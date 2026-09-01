'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  MessageCircle,
  PanelRight,
  Phone,
  Plus,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { garantirPaciente } from '@/lib/dados/catalogo';
import { whatsapp } from '@/lib/dados/api';
import { subirMidia, tipoDoArquivo } from '@/lib/dados/midia';
import { Composicao } from './composicao';
import { MidiaMensagem } from './midia-mensagem';
import {
  hora,
  iniciais,
  ROTULO_ORIGEM,
  telefoneDigitos,
  telefoneVisivel,
  tempoRelativo,
} from '@/lib/dados/formato';
import { Campo, Conteudo, EstadoVazio, Modal, useAcao, useAviso } from './base';

type LinhaCaixa = {
  conversa_id: string;
  paciente_id: string;
  nome_completo: string | null;
  telefone: string | null;
  ultima_mensagem_previa: string | null;
  ultima_mensagem_em: string | null;
  nao_lidas: number;
  ia_ativa: boolean;
  assumida_por: string | null;
  atendente: string | null;
  origem: string | null;
  interesse_principal: string | null;
  etapa_funil: string | null;
  status: string;
  criado_em?: string | null;
};

type Mensagem = {
  id: string;
  autor: 'paciente' | 'ia' | 'humano' | 'sistema';
  conteudo: string | null;
  tipo_conteudo: string;
  midia_url: string | null;
  criado_em: string;
};

export function PainelConversas({ busca }: { busca: string }) {
  const { clinicaId, unidadeId, membroId } = useClinica();
  const { avisar, alertar } = useAviso();
  const { executar, ocupado } = useAcao();

  const [aba, setAba] = useState<'todas' | 'minhas' | 'nao-lidas'>('todas');
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [contatoAberto, setContatoAberto] = useState(false);
  const [pulso, setPulso] = useState(0);

  const caixa = useConsulta<LinhaCaixa[]>(
    clinicaId
      ? () => {
          let consulta = supabase
            .from('vw_caixa_entrada')
            .select('*')
            .eq('clinica_id', clinicaId)
            .neq('status', 'arquivada')
            .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
            .limit(100);
          if (unidadeId) consulta = consulta.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
          return consulta;
        }
      : null,
    [clinicaId, unidadeId, pulso],
  );

  /**
   * Realtime: qualquer mensagem nova na clínica reordena a caixa de entrada e,
   * se for da conversa aberta, entra na thread. Uma inscrição só para as duas
   * listas — o `pulso` é o gatilho comum de recarga.
   */
  useEffect(() => {
    if (!clinicaId) return;
    const canal = supabase
      .channel(`mensagens:${clinicaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `clinica_id=eq.${clinicaId}`,
        },
        () => setPulso((n) => n + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [clinicaId]);

  const lista = (caixa.dados ?? []).filter((linha) => {
    const alvo = `${linha.nome_completo ?? ''} ${linha.telefone ?? ''}`.toLowerCase();
    if (busca && !alvo.includes(busca.toLowerCase())) return false;
    if (aba === 'nao-lidas' && linha.nao_lidas <= 0) return false;
    if (aba === 'minhas' && linha.assumida_por !== membroId) return false;
    return true;
  });

  const naoLidas = (caixa.dados ?? []).filter((l) => l.nao_lidas > 0).length;
  const minhas = (caixa.dados ?? []).filter((l) => l.assumida_por === membroId).length;
  // Só abre a conversa que a pessoa escolheu. Abrir a primeira sozinho faz
  // parecer que um atendimento foi assumido sem ninguém pedir.
  const atual = lista.find((l) => l.conversa_id === conversaId) ?? null;

  const abertaId = atual?.conversa_id;
  const abertaNaoLidas = atual?.nao_lidas ?? 0;

  const mensagens = useConsulta<Mensagem[]>(
    abertaId
      ? () =>
          supabase
            .from('mensagens')
            .select('id, autor, conteudo, tipo_conteudo, midia_url, criado_em')
            .eq('conversa_id', abertaId)
            .order('criado_em')
            .limit(200)
      : null,
    [abertaId, pulso],
  );

  useEffect(() => {
    if (!abertaId || abertaNaoLidas <= 0) return;
    void supabase
      .from('conversas')
      .update({ nao_lidas: 0 })
      .eq('id', abertaId)
      .then(() => setPulso((n) => n + 1));
  }, [abertaId, abertaNaoLidas]);

  // Rola para a mensagem mais recente sempre que a thread muda.
  const fimDaThread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimDaThread.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.dados]);

  /** Sobe o arquivo e manda pelo WhatsApp, usando o texto atual como legenda. */
  async function enviarArquivo(arquivo: Blob, nome: string) {
    if (!atual) return;
    setEnviandoMidia(true);
    try {
      const { caminho, erro } = await subirMidia(clinicaId, arquivo, nome);
      if (erro) {
        alertar(erro);
        return;
      }

      const ok = await executar(
        () =>
          whatsapp
            .enviarMidia({
              conversaId: atual.conversa_id,
              caminho,
              tipo: tipoDoArquivo(arquivo.type || ''),
              legenda: null,
              nomeArquivo: nome,
              mimetype: arquivo.type || null,
            })
            .then(() => ({ error: null })),
        'Arquivo enviado',
      );

      if (ok) setPulso((n) => n + 1);
    } finally {
      setEnviandoMidia(false);
    }
  }

  async function enviarTexto(conteudo: string) {
    if (!conteudo || !atual) return;

    // O servidor entrega no WhatsApp e grava o registro numa operação só —
    // assim a tela nunca mostra uma mensagem que não saiu.
    const ok = await executar(
      () => whatsapp.enviar(atual.conversa_id, conteudo).then(() => ({ error: null })),
      'Mensagem enviada',
    );

    if (ok) setPulso((n) => n + 1);
  }

  async function alternarAtendimento() {
    if (!atual) return;
    const assumindo = atual.ia_ativa;

    await executar(
      () =>
        supabase
          .from('conversas')
          .update(
            assumindo
              ? { assumida_por: membroId, assumida_em: new Date().toISOString() }
              : { assumida_por: null, assumida_em: null, ia_ativa: true },
          )
          .eq('id', atual.conversa_id),
      assumindo ? 'Você assumiu a conversa' : 'Conversa devolvida à IA',
      () => setPulso((n) => n + 1),
    );
  }

  if (!caixa.carregando && !caixa.erro && (caixa.dados ?? []).length === 0) {
    return (
      <div className="caixa-vazia">
        <EstadoVazio
          icone={MessageCircle}
          titulo="Nenhuma conversa ainda"
          texto="Abra a primeira conversa manualmente ou conecte um número de WhatsApp em Minha clínica."
          acao={
            <button className="primary-btn" onClick={() => setModalAberto(true)}>
              <Plus size={15} /> Nova conversa
            </button>
          }
        />
        <ModalNovaConversa
          aberto={modalAberto}
          aoFechar={() => setModalAberto(false)}
          aoCriar={(id) => {
            setConversaId(id);
            setPulso((n) => n + 1);
            avisar('Conversa criada');
          }}
        />
      </div>
    );
  }

  return (
    <div className={`caixa ${contatoAberto ? '' : 'sem-contato'}`}>
      {/* ------------------------------------------------------------ lista */}
      <div className="caixa-lista">
        <header className="lista-topo">
          <div className="list-tabs">
            <button className={aba === 'todas' ? 'active' : ''} onClick={() => setAba('todas')}>
              Todas
            </button>
            <button className={aba === 'minhas' ? 'active' : ''} onClick={() => setAba('minhas')}>
              Minhas {minhas > 0 && <em>{minhas}</em>}
            </button>
            <button
              className={aba === 'nao-lidas' ? 'active' : ''}
              onClick={() => setAba('nao-lidas')}
            >
              Não lidas {naoLidas > 0 && <em>{naoLidas}</em>}
            </button>
          </div>
          <button
            className="botao-icone"
            onClick={() => setModalAberto(true)}
            aria-label="Nova conversa"
          >
            <Plus size={16} />
          </button>
        </header>

        <div className="conversation-list">
          <Conteudo
            consulta={caixa}
            linhas={5}
            vazio={<p className="lista-vazia">Nenhuma conversa.</p>}
          >
            {() =>
              lista.length === 0 ? (
                <p className="lista-vazia">Nenhuma conversa neste filtro.</p>
              ) : (
                lista.map((linha) => (
                  <button
                    key={linha.conversa_id}
                    className={atual?.conversa_id === linha.conversa_id ? 'selected' : ''}
                    onClick={() => setConversaId(linha.conversa_id)}
                  >
                    <div className="patient-avatar peach">{iniciais(linha.nome_completo)}</div>

                    <div className="item-corpo">
                      <div className="item-linha">
                        <b>{linha.nome_completo ?? 'Sem nome'}</b>
                        <time>{tempoRelativo(linha.ultima_mensagem_em)}</time>
                      </div>

                      <span className="item-atribuicao">
                        {linha.ia_ativa ? (
                          <>
                            <Bot size={11} /> Atendimento automático
                          </>
                        ) : (
                          <>
                            <Check size={11} /> Com {linha.atendente ?? 'um atendente'}
                          </>
                        )}
                      </span>

                      <span className="item-previa">
                        {linha.ultima_mensagem_previa ?? 'Sem mensagens'}
                      </span>

                      <div className="item-selos">
                        {linha.origem && (
                          <span className="selo">{ROTULO_ORIGEM[linha.origem] ?? linha.origem}</span>
                        )}
                        {linha.etapa_funil && <span className="selo selo-ouro">{linha.etapa_funil}</span>}
                        {linha.nao_lidas > 0 && <span className="selo-contador">{linha.nao_lidas}</span>}
                      </div>
                    </div>
                  </button>
                ))
              )
            }
          </Conteudo>
        </div>
      </div>

      {/* -------------------------------------------------------------- chat */}
      <div className="chat">
        {atual ? (
          <>
            <header className="chat-head">
              <div className="patient-avatar sage">{iniciais(atual.nome_completo)}</div>
              <div className="chat-quem">
                <b>{atual.nome_completo ?? 'Sem nome'}</b>
                <span>
                  <i className={atual.ia_ativa ? 'ponto-ia' : 'ponto-humano'} />
                  {atual.ia_ativa ? 'atendimento automático' : `com ${atual.atendente ?? 'atendente'}`}
                </span>
              </div>

              <div className="chat-acoes">
                <button className="secondary-btn" onClick={alternarAtendimento} disabled={ocupado}>
                  {atual.ia_ativa ? 'Assumir conversa' : 'Devolver para a IA'}
                </button>
                <button
                  className={`botao-icone ${contatoAberto ? 'ativo' : ''}`}
                  onClick={() => setContatoAberto((v) => !v)}
                  aria-label={
                    contatoAberto ? 'Ocultar informações do contato' : 'Informações do contato'
                  }
                  title="Informações do contato"
                >
                  <PanelRight size={16} />
                </button>
              </div>
            </header>

            <div className="messages">
              <Conteudo
                consulta={mensagens}
                linhas={3}
                vazio={
                  <p className="lista-vazia">
                    Nenhuma mensagem nesta conversa. Escreva a primeira abaixo.
                  </p>
                }
              >
                {(itens) =>
                  itens.map((m) => (
                    <div
                      className={`message ${m.autor === 'paciente' ? 'client' : 'ai'}`}
                      key={m.id}
                    >
                      {m.autor === 'ia' && (
                        <small>
                          <Sparkles size={11} /> IA
                        </small>
                      )}
                      {m.autor === 'humano' && <small>VOCÊ</small>}
                      {m.midia_url && (
                        <MidiaMensagem
                          midiaUrl={m.midia_url}
                          tipo={m.tipo_conteudo}
                          legenda={m.conteudo}
                        />
                      )}
                      {m.conteudo && <p>{m.conteudo}</p>}
                      <time>{hora(m.criado_em)}</time>
                    </div>
                  ))
                }
              </Conteudo>
              <div ref={fimDaThread} />
            </div>

            <Composicao
              aoEnviarTexto={enviarTexto}
              aoEnviarArquivo={enviarArquivo}
              ocupado={ocupado}
              enviandoMidia={enviandoMidia}
            />
          </>
        ) : (
          <EstadoVazio
            icone={MessageCircle}
            titulo="Nenhuma conversa aberta"
            texto="Escolha um contato na lista à esquerda para ver o histórico e responder."
          />
        )}
      </div>

      {/* ---------------------------------------------------------- contato */}
      {contatoAberto && (
        <aside className="contact-info">
          {atual && (
            <>
              <header>
                <h3>Informações do contato</h3>
                <button
                  className="botao-icone"
                  onClick={() => setContatoAberto(false)}
                  aria-label="Fechar"
                >
                  <X size={15} />
                </button>
              </header>

              <div className="contato-topo">
                <div className="big-avatar">{iniciais(atual.nome_completo)}</div>
                <b>{atual.nome_completo ?? 'Sem nome'}</b>
                <span>
                  <Phone size={12} /> {telefoneVisivel(atual.telefone)}
                </span>
              </div>

              <section>
                <h4>Etiquetas</h4>
                <div className="item-selos">
                  {atual.origem && (
                    <span className="selo">{ROTULO_ORIGEM[atual.origem] ?? atual.origem}</span>
                  )}
                  {atual.etapa_funil && <span className="selo selo-ouro">{atual.etapa_funil}</span>}
                  {!atual.origem && !atual.etapa_funil && <span className="vazio-inline">—</span>}
                </div>
              </section>

              <section>
                <h4>Interesse</h4>
                <p>{atual.interesse_principal ?? 'Não informado'}</p>
              </section>

              <section>
                <h4>Última mensagem</h4>
                <p>{tempoRelativo(atual.ultima_mensagem_em)}</p>
              </section>

              <section>
                <h4>Atendimento</h4>
                <p>
                  {atual.ia_ativa
                    ? 'A IA está respondendo automaticamente.'
                    : `Assumida por ${atual.atendente ?? 'um atendente'}.`}
                </p>
              </section>
            </>
          )}
        </aside>
      )}

      <ModalNovaConversa
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        aoCriar={(id) => {
          setConversaId(id);
          setPulso((n) => n + 1);
          avisar('Conversa criada');
        }}
      />
    </div>
  );
}

function ModalNovaConversa({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (conversaId: string) => void;
}) {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origem, setOrigem] = useState('whatsapp');

  async function salvar() {
    const digitos = telefoneDigitos(telefone);
    if (!nome.trim() || digitos.length < 12) return;

    await executar(
      async () => {
        const { id, error } = await garantirPaciente({
          clinicaId,
          unidadeId,
          nome: nome.trim(),
          telefone: digitos,
          origem: origem as never,
        });
        if (error || !id) return { error };

        // Uma thread por paciente e canal: se já existe, reaproveita.
        const { data: existente } = await supabase
          .from('conversas')
          .select('id')
          .eq('clinica_id', clinicaId)
          .eq('paciente_id', id)
          .eq('canal', 'whatsapp')
          .maybeSingle();

        if (existente) {
          aoCriar(existente.id);
          return { error: null };
        }

        const { data, error: erroConversa } = await supabase
          .from('conversas')
          .insert({
            clinica_id: clinicaId,
            unidade_id: unidadeId,
            paciente_id: id,
            canal: 'whatsapp',
          })
          .select('id')
          .single();

        if (data) aoCriar(data.id);
        return { error: erroConversa };
      },
      'Conversa aberta',
      () => {
        setNome('');
        setTelefone('');
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Nova conversa"
      descricao="O telefone identifica o contato — se já existir, abrimos a conversa dele."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Abrir conversa"
      salvando={ocupado}
    >
      <Campo rotulo="Nome do contato">
        <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
      </Campo>
      <Campo rotulo="Telefone (com DDD)" dica="Ex.: (11) 99845-2031">
        <input
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(11) 99845-2031"
          required
        />
      </Campo>
      <Campo rotulo="Origem">
        <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
          {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <p className="modal-nota">
        <UserPlus size={14} /> O contato entra como lead e pode virar oportunidade no CRM.
      </p>
    </Modal>
  );
}
