'use client';

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import {
  Building2,
  Loader2,
  Plus,
  QrCode,
  Smartphone,
  Sparkles,
  Trash2,
  Unplug,
  UserCog,
} from 'lucide-react';
import { whatsapp, type RespostaConexao } from '@/lib/dados/api';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica, useSessao } from '@/lib/dados/sessao';
import {
  useProfissionais,
  type NumeroWhatsapp,
  type Procedimento,
} from '@/lib/dados/catalogo';
import type { Database } from '@/lib/supabase/tipos-banco';

type Unidade = Database['public']['Tables']['unidades']['Row'];
import { moeda, numero, ROTULO_STATUS_CHIP, telefoneDigitos, telefoneVisivel } from '@/lib/dados/formato';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Falha, Modal, useAcao, useAviso } from './base';
import { MarcaClinica } from './marca-clinica';

type Guia = 'clinica' | 'procedimentos' | 'profissionais' | 'unidades' | 'numeros';

const GUIAS: Array<[Guia, string, React.ElementType]> = [
  ['clinica', 'Identidade', Building2],
  ['numeros', 'Números de WhatsApp', Smartphone],
  ['procedimentos', 'Procedimentos', Sparkles],
  ['profissionais', 'Profissionais', UserCog],
  ['unidades', 'Unidades', Building2],
];

export function PainelCadastros({ guiaInicial }: { guiaInicial?: Guia } = {}) {
  const [guia, setGuia] = useState<Guia>(guiaInicial ?? 'procedimentos');

  return (
    <>
      <Cabecalho
        titulo="Minha clínica"
        texto="Identidade, unidades, equipe e o catálogo que alimenta a agenda e a assistente."
      />

      <div className="guias">
        {GUIAS.map(([chave, rotulo, Icone]) => (
          <button
            key={chave}
            className={guia === chave ? 'active' : ''}
            onClick={() => setGuia(chave)}
          >
            <Icone size={15} /> {rotulo}
          </button>
        ))}
      </div>

      {guia === 'procedimentos' && <Procedimentos />}
      {guia === 'profissionais' && <Profissionais />}
      {guia === 'unidades' && <Unidades />}
      {guia === 'clinica' && <MarcaClinica />}
      {guia === 'numeros' && <Numeros />}
    </>
  );
}

/* ------------------------------------------------------------ procedimentos */

function Procedimentos() {
  const { clinicaId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [pulso, setPulso] = useState(0);

  const lista = useConsulta<Procedimento[]>(
    clinicaId
      ? () =>
          supabase
            .from('procedimentos')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
            .order('nome')
      : null,
    [clinicaId], [pulso],
  );

  const [nome, setNome] = useState('');
  const [duracao, setDuracao] = useState(60);
  const [valor, setValor] = useState('');
  const [retorno, setRetorno] = useState('');

  async function salvar() {
    if (!nome.trim()) return;
    await executar(
      () =>
        supabase.from('procedimentos').insert({
          clinica_id: clinicaId,
          nome: nome.trim(),
          duracao_minutos: duracao,
          valor: valor ? Number(valor) : 0,
          intervalo_retorno_dias: retorno ? Number(retorno) : null,
        }),
      'Procedimento cadastrado',
      () => {
        setNome('');
        setValor('');
        setRetorno('');
        setPulso((n) => n + 1);
        setAberto(false);
      },
    );
  }

  async function desativar(id: string, rotulo: string) {
    await executar(
      () => supabase.from('procedimentos').update({ ativo: false }).eq('id', id),
      `${rotulo} removido do catálogo`,
      () => setPulso((n) => n + 1),
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Procedimentos</h2>
          <p>Duração e preço entram sozinhos ao marcar um atendimento</p>
        </div>
        <button className="primary-btn" onClick={() => setAberto(true)}>
          <Plus size={15} /> Novo
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={Sparkles}
            titulo="Nenhum procedimento"
            texto="Cadastre o que sua clínica oferece — é a base da agenda e do funil."
            acao={
              <button className="primary-btn" onClick={() => setAberto(true)}>
                <Plus size={15} /> Cadastrar procedimento
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="data-table">
            <header>
              <span>NOME</span>
              <span>DURAÇÃO</span>
              <span>VALOR</span>
              <span>RETORNO</span>
              <span />
            </header>
            {itens.map((item) => (
              <div key={item.id}>
                <span>{item.nome}</span>
                <span>{item.duracao_minutos} min</span>
                <span>{moeda(item.valor)}</span>
                <span>
                  {item.intervalo_retorno_dias ? `${item.intervalo_retorno_dias} dias` : '—'}
                </span>
                <button
                  className="icone-perigo"
                  disabled={ocupado}
                  onClick={() => desativar(item.id, item.nome)}
                  aria-label={`Remover ${item.nome}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Novo procedimento"
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoConfirmar={salvar}
        salvando={ocupado}
      >
        <div className="modal-grade">
          <Campo rotulo="Nome" largo>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </Campo>
          <Campo rotulo="Duração (min)">
            <input
              type="number"
              min={15}
              step={15}
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
            />
          </Campo>
          <Campo rotulo="Valor (R$)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Retorno em (dias)" dica="Usado para lembrar o paciente de voltar." largo>
            <input
              type="number"
              min={0}
              value={retorno}
              onChange={(e) => setRetorno(e.target.value)}
            />
          </Campo>
        </div>
      </Modal>
    </article>
  );
}

/* ------------------------------------------------------------ profissionais */

function Profissionais() {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [aberto, setAberto] = useState(false);
  const lista = useProfissionais(clinicaId);

  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [registro, setRegistro] = useState('');

  async function salvar() {
    if (!nome.trim()) return;
    await executar(
      () =>
        supabase.from('profissionais').insert({
          clinica_id: clinicaId,
          unidade_id: unidadeId,
          nome: nome.trim(),
          especialidade: especialidade.trim() || null,
          registro_conselho: registro.trim() || null,
        }),
      'Profissional cadastrado',
      () => {
        setNome('');
        setEspecialidade('');
        setRegistro('');
        setAberto(false);
        lista.recarregar();
      },
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Profissionais</h2>
          <p>Quem executa os procedimentos na agenda</p>
        </div>
        <button className="primary-btn" onClick={() => setAberto(true)}>
          <Plus size={15} /> Novo
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={UserCog}
            titulo="Nenhum profissional"
            texto="Sem profissional a agenda não bloqueia conflitos de horário."
            acao={
              <button className="primary-btn" onClick={() => setAberto(true)}>
                <Plus size={15} /> Cadastrar profissional
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="data-table">
            <header>
              <span>NOME</span>
              <span>ESPECIALIDADE</span>
              <span>REGISTRO</span>
            </header>
            {itens.map((item) => (
              <div key={item.id}>
                <span>{item.nome}</span>
                <span>{item.especialidade ?? '—'}</span>
                <span>{item.registro_conselho ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Novo profissional"
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoConfirmar={salvar}
        salvando={ocupado}
      >
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
        </Campo>
        <Campo rotulo="Especialidade">
          <input
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
            placeholder="Biomedicina estética"
          />
        </Campo>
        <Campo rotulo="Registro no conselho">
          <input value={registro} onChange={(e) => setRegistro(e.target.value)} />
        </Campo>
      </Modal>
    </article>
  );
}

/* ----------------------------------------------------------------- unidades */

function Unidades() {
  const { clinicaId, ehGestor } = useClinica();
  const { recarregar } = useSessao();
  const { executar, ocupado } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [pulso, setPulso] = useState(0);

  const lista = useConsulta<Unidade[]>(
    clinicaId
      ? () =>
          supabase
            .from('unidades')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativa', true)
            .order('nome')
      : null,
    [clinicaId], [pulso],
  );

  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [telefone, setTelefone] = useState('');

  async function salvar() {
    if (!nome.trim()) return;
    await executar(
      () =>
        supabase.from('unidades').insert({
          clinica_id: clinicaId,
          nome: nome.trim(),
          cidade: cidade.trim() || null,
          telefone: telefone.trim() || null,
        }),
      'Unidade criada',
      async () => {
        setNome('');
        setCidade('');
        setTelefone('');
        setPulso((n) => n + 1);
        setAberto(false);
        // O seletor de unidade no menu lateral vem da sessão.
        await recarregar();
      },
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Unidades</h2>
          <p>Cada unidade tem agenda e equipe próprias</p>
        </div>
        {ehGestor && (
          <button className="primary-btn" onClick={() => setAberto(true)}>
            <Plus size={15} /> Nova
          </button>
        )}
      </div>

      <Conteudo consulta={lista}>
        {(itens) => (
          <div className="data-table">
            <header>
              <span>NOME</span>
              <span>CIDADE</span>
              <span>TELEFONE</span>
            </header>
            {itens.map((item) => (
              <div key={item.id}>
                <span>{item.nome}</span>
                <span>{item.cidade ?? '—'}</span>
                <span>{item.telefone ? telefoneVisivel(item.telefone) : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Nova unidade"
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoConfirmar={salvar}
        salvando={ocupado}
      >
        <Campo rotulo="Nome">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Unidade Moema"
            required
            autoFocus
          />
        </Campo>
        <Campo rotulo="Cidade">
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </Campo>
        <Campo rotulo="Telefone">
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </Campo>
      </Modal>
    </article>
  );
}

/* ------------------------------------------------------------------ números */

function Numeros() {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [pulso, setPulso] = useState(0);
  const [conectando, setConectando] = useState<NumeroWhatsapp | null>(null);

  const lista = useConsulta<NumeroWhatsapp[]>(
    clinicaId
      ? () =>
          supabase
            .from('numeros_whatsapp')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
            .order('apelido')
      : null,
    [clinicaId], [pulso],
  );

  const [apelido, setApelido] = useState('');
  const [numeroTexto, setNumeroTexto] = useState('');
  const [limite, setLimite] = useState(300);

  async function salvar() {
    if (!apelido.trim()) return;
    await executar(
      () =>
        supabase.from('numeros_whatsapp').insert({
          clinica_id: clinicaId,
          unidade_id: unidadeId,
          apelido: apelido.trim(),
          // Fica nulo até o pareamento: quem informa o número é o WhatsApp.
          numero: telefoneDigitos(numeroTexto) || null,
          limite_diario: limite,
        }),
      'Número cadastrado — agora conecte o WhatsApp',
      () => {
        setApelido('');
        setNumeroTexto('');
        setPulso((n) => n + 1);
        setAberto(false);
      },
    );
  }

  async function desconectar(numero: NumeroWhatsapp) {
    await executar(
      () => whatsapp.desconectar(numero.id).then(() => ({ error: null })),
      `${numero.apelido} desconectado`,
      () => setPulso((n) => n + 1),
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Números de WhatsApp</h2>
          <p>Conecte o aparelho lendo o QR Code — é o que liga o sistema ao WhatsApp</p>
        </div>
        <button className="primary-btn" onClick={() => setAberto(true)}>
          <Plus size={15} /> Novo
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={Smartphone}
            titulo="Nenhum número cadastrado"
            texto="Sem um número conectado, o sistema não envia nem recebe mensagem."
            acao={
              <button className="primary-btn" onClick={() => setAberto(true)}>
                <Plus size={15} /> Cadastrar número
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="data-table">
            <header>
              <span>APELIDO</span>
              <span>NÚMERO</span>
              <span>STATUS</span>
              <span>HOJE</span>
              <span>LIMITE</span>
              <span />
            </header>
            {itens.map((item) => {
              const conectado = item.status === 'conectado';
              return (
                <div key={item.id}>
                  <span>{item.apelido}</span>
                  <span>{item.numero ? telefoneVisivel(item.numero) : '—'}</span>
                  <span className={`status ${conectado ? 'confirmed' : 'waiting'}`}>
                    <i />
                    {ROTULO_STATUS_CHIP[item.status] ?? item.status}
                  </span>
                  <span>{numero(item.enviados_hoje)}</span>
                  <span>{numero(item.limite_diario)}</span>
                  <div className="acoes-evento">
                    {conectado ? (
                      <button
                        className="secondary-btn"
                        disabled={ocupado}
                        onClick={() => desconectar(item)}
                      >
                        <Unplug size={14} /> Desconectar
                      </button>
                    ) : (
                      <button className="primary-btn" onClick={() => setConectando(item)}>
                        <QrCode size={14} /> Conectar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Novo número"
        descricao="Cadastre o apelido; o número em si vem do aparelho ao parear."
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoConfirmar={salvar}
        salvando={ocupado}
      >
        <Campo rotulo="Apelido">
          <input
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Chip principal"
            required
            autoFocus
          />
        </Campo>
        <Campo rotulo="Número (opcional)" dica="Deixe em branco para preencher no pareamento.">
          <input
            value={numeroTexto}
            onChange={(e) => setNumeroTexto(e.target.value)}
            placeholder="(11) 99845-2031"
          />
        </Campo>
        <Campo rotulo="Limite diário de envios">
          <input
            type="number"
            min={1}
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
          />
        </Campo>
      </Modal>

      {conectando && (
        <ModalConexao
          numero={conectando}
          aoFechar={() => {
            setConectando(null);
            setPulso((n) => n + 1);
          }}
        />
      )}
    </article>
  );
}

/**
 * Pareamento do aparelho.
 *
 * O QR Code do WhatsApp expira em segundos, então a tela consulta o estado a
 * cada 4 segundos: renova o código enquanto ninguém leu e fecha sozinha assim
 * que a conexão é confirmada.
 */
function ModalConexao({ numero, aoFechar }: { numero: NumeroWhatsapp; aoFechar: () => void }) {
  const { avisar, alertar } = useAviso();
  const [conexao, setConexao] = useState<RespostaConexao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const encerrado = useRef(false);

  useEffect(() => {
    encerrado.current = false;

    whatsapp
      .conectar(numero.id)
      .then((resposta) => {
        if (encerrado.current) return;
        setConexao(resposta);
        if (resposta.conectado) setConectado(true);
      })
      .catch((e: Error) => !encerrado.current && setErro(e.message));

    const relogio = setInterval(async () => {
      if (encerrado.current) return;
      try {
        const estado = await whatsapp.estado(numero.id);
        if (encerrado.current) return;

        if (estado.conectado) {
          setConectado(true);
          clearInterval(relogio);
          avisar(`${numero.apelido} conectado`);
          setTimeout(aoFechar, 1200);
          return;
        }
        // QR novo a cada rodada, porque o anterior já expirou.
        if (estado.qrcode) {
          setConexao((atual) => (atual ? { ...atual, qrcode: estado.qrcode ?? null } : atual));
        }
      } catch (e) {
        if (!encerrado.current) alertar((e as Error).message);
      }
    }, 4000);

    return () => {
      encerrado.current = true;
      clearInterval(relogio);
    };
  }, [numero.id, numero.apelido, aoFechar, avisar, alertar]);

  return (
    <Modal
      titulo={`Conectar ${numero.apelido}`}
      descricao="No celular: WhatsApp › Aparelhos conectados › Conectar um aparelho."
      aberto
      aoFechar={aoFechar}
    >
      {erro && <Falha erro={erro} />}

      {!erro && conectado && (
        <div className="pareamento pareamento-ok">
          <Smartphone size={26} />
          <b>Conectado!</b>
          <span>Este número já envia e recebe mensagens pelo sistema.</span>
        </div>
      )}

      {!erro && !conectado && (
        <div className="pareamento">
          {conexao?.qrcode ? (
            // oxlint-disable-next-line no-img-element -- data URI gerado pela
            // UazApi e trocado a cada 4s: não há o que o next/image otimizar.
            <img src={conexao.qrcode} alt="QR Code para conectar o WhatsApp" width={232} height={232} />
          ) : (
            <div className="pareamento-espera">
              <Loader2 size={22} className="girando" />
              <span>Gerando o código...</span>
            </div>
          )}
          <b>Leia o código com o celular</b>
          <span>O código se renova sozinho a cada poucos segundos.</span>
          {conexao?.paircode && (
            <p className="modal-nota">
              Ou digite este código no aparelho: <b>{conexao.paircode}</b>
            </p>
          )}
        </div>
      )}

      {conexao?.avisoWebhook && (
        <p className="modal-nota alerta">
          O aparelho vai conectar, mas as mensagens recebidas não chegarão até o
          sistema enquanto o webhook não apontar para um endereço público.
        </p>
      )}
    </Modal>
  );
}
