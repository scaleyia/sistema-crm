'use client';

import { useState } from 'react';
import { Megaphone, Plus, Send, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { whatsapp } from '@/lib/dados/api';
import {
  moeda,
  numero,
  percentual,
  ROTULO_STATUS_CAMPANHA,
  ROTULO_STATUS_CHIP,
  telefoneVisivel,
} from '@/lib/dados/formato';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Modal, useAcao } from './base';

export type DesempenhoCampanha = {
  campanha_id: string;
  campanha: string;
  status: string;
  investimento: number;
  abordados: number;
  enviados: number;
  responderam: number;
  agendaram: number;
  compareceram: number;
  receita: number;
  retorno_sobre_investimento: number | null;
  taxa_resposta_percentual: number | null;
};

type Chip = {
  numero_id: string;
  apelido: string;
  numero: string;
  status: string;
  enviados_hoje: number;
  limite_diario: number;
  uso_percentual: number | null;
};

export function useDesempenhoCampanhas(clinicaId: string, pulso = 0) {
  return useConsulta<DesempenhoCampanha[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_desempenho_campanhas')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('receita', { ascending: false })
      : null,
    [clinicaId], [pulso],
  );
}

export function PainelCampanhas() {
  const { clinicaId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [pulso, setPulso] = useState(0);
  const [modalAberto, setModalAberto] = useState(false);

  const campanhas = useDesempenhoCampanhas(clinicaId, pulso);

  const chips = useConsulta<Chip[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_saude_chips')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('apelido')
      : null,
    [clinicaId], [pulso],
  );

  const conectados = (chips.dados ?? []).filter((c) => c.status === 'conectado').length;

  /** Pausa ou retoma sem mexer na fila já enfileirada na UazApi. */
  async function alternar(campanha: DesempenhoCampanha) {
    const emAndamento = campanha.status === 'em_andamento';
    await executar(
      () =>
        supabase
          .from('campanhas')
          .update({ status: emAndamento ? 'pausada' : 'em_andamento' })
          .eq('id', campanha.campanha_id),
      emAndamento ? `"${campanha.campanha}" pausada` : `"${campanha.campanha}" retomada`,
      () => setPulso((n) => n + 1),
    );
  }

  /** Enfileira o disparo real na UazApi e monta o funil da campanha. */
  async function disparar(campanha: DesempenhoCampanha) {
    await executar(
      async () => {
        const r = await whatsapp.dispararCampanha(campanha.campanha_id);
        return { error: null, resultado: r };
      },
      `Disparo enfileirado para "${campanha.campanha}"`,
      () => setPulso((n) => n + 1),
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Campanhas"
        texto="Disparos com rotação entre os números conectados."
        acao={
          <button className="primary-btn" onClick={() => setModalAberto(true)}>
            <Plus size={15} /> Criar campanha
          </button>
        }
      />

      <div className="chip-health panel">
        <div>
          <i className={conectados ? 'chip-on' : 'chip-off'} />
          <b>
            {conectados} de {(chips.dados ?? []).length} número(s) online
          </b>
          <span>
            {conectados ? 'Rotação disponível para disparo' : 'Cadastre um número em Minha clínica'}
          </span>
        </div>
        {(chips.dados ?? []).map((chip) => (
          <span key={chip.numero_id} title={telefoneVisivel(chip.numero)}>
            {chip.apelido}
            <b>{ROTULO_STATUS_CHIP[chip.status] ?? chip.status}</b>
            <em>
              {numero(chip.enviados_hoje)}/{numero(chip.limite_diario)}
            </em>
          </span>
        ))}
      </div>

      <article className="panel table-panel">
        <div className="panel-title">
          <div>
            <h2>Suas campanhas</h2>
            <p>Resultados calculados a partir dos envios registrados</p>
          </div>
        </div>

        <Conteudo
          consulta={campanhas}
          linhas={3}
          vazio={
            <EstadoVazio
              icone={Megaphone}
              titulo="Nenhuma campanha criada"
              texto="Crie uma campanha para reativar contatos antigos em escala."
              acao={
                <button className="primary-btn" onClick={() => setModalAberto(true)}>
                  <Plus size={15} /> Criar campanha
                </button>
              }
            />
          }
        >
          {(linhas) => (
            <div className="data-table">
              <header>
                <span>CAMPANHA</span>
                <span>ENVIADOS</span>
                <span>RESPOSTAS</span>
                <span>AGENDADOS</span>
                <span>RECEITA</span>
                <span>STATUS</span>
              </header>
              {linhas.map((linha) => (
                <div key={linha.campanha_id}>
                  <span>{linha.campanha}</span>
                  <span>{numero(linha.enviados)}</span>
                  <span>{numero(linha.responderam)}</span>
                  <span>{numero(linha.agendaram)}</span>
                  <span>{linha.receita ? moeda(linha.receita) : '—'}</span>
                  <div className="acoes-evento">
                    <button
                      className="secondary-btn"
                      disabled={ocupado || !conectados}
                      onClick={() => disparar(linha)}
                      title={
                        conectados
                          ? 'Enfileira os envios na UazApi'
                          : 'Conecte um número de WhatsApp primeiro'
                      }
                    >
                      <Send size={14} /> Disparar
                    </button>
                    <button
                      className={`switch ${linha.status === 'em_andamento' ? 'on' : ''}`}
                      disabled={ocupado}
                      onClick={() => alternar(linha)}
                      aria-label={`${ROTULO_STATUS_CAMPANHA[linha.status]} — clique para alternar`}
                      title={ROTULO_STATUS_CAMPANHA[linha.status]}
                    >
                      <i />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Conteudo>
      </article>

      <ModalCampanha
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        aoCriar={() => setPulso((n) => n + 1)}
      />
    </>
  );
}

/**
 * Objetivos que uma clínica estética de fato usa. Cada um já traz uma sugestão
 * de mensagem, porque a folha em branco é onde a maioria das campanhas morre.
 */
const OBJETIVOS: Array<{ chave: string; rotulo: string; mensagem: string }> = [
  {
    chave: 'reativar',
    rotulo: 'Reativar quem não vem há meses',
    mensagem:
      'Oi {{primeiro_nome}}! Faz um tempo que a gente não se vê por aqui 💛 Preparei uma condição especial para você voltar. Quer que eu veja um horário?',
  },
  {
    chave: 'retorno',
    rotulo: 'Chamar para o retorno do procedimento',
    mensagem:
      'Oi {{primeiro_nome}}! Já está na época de renovar seu procedimento para manter o resultado. Quer que eu reserve um horário?',
  },
  {
    chave: 'orcamento',
    rotulo: 'Retomar orçamento que não fechou',
    mensagem:
      'Oi {{primeiro_nome}}! Passando para saber se ficou alguma dúvida sobre o que conversamos. Posso te ajudar a decidir?',
  },
  {
    chave: 'promocao',
    rotulo: 'Divulgar promoção ou novidade',
    mensagem:
      'Oi {{primeiro_nome}}! Temos uma novidade na clínica esta semana com condição especial. Quer saber mais?',
  },
  {
    chave: 'aniversario',
    rotulo: 'Felicitar aniversariantes do mês',
    mensagem:
      'Oi {{primeiro_nome}}, feliz aniversário! 🎉 Preparamos um mimo para você comemorar com a gente. Quer que eu conte?',
  },
  {
    chave: 'avaliacao',
    rotulo: 'Convidar para avaliação gratuita',
    mensagem:
      'Oi {{primeiro_nome}}! Estamos com agenda aberta para avaliação sem custo esta semana. Quer garantir a sua?',
  },
  {
    chave: 'outro',
    rotulo: 'Outro objetivo (escrever)',
    mensagem: '',
  },
];

function ModalCampanha({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const { clinicaId, unidadeId, membroId } = useClinica();
  const { executar, ocupado } = useAcao();

  const [nome, setNome] = useState('');
  const [objetivoChave, setObjetivoChave] = useState('reativar');
  const [objetivoLivre, setObjetivoLivre] = useState('');
  const [modelo, setModelo] = useState(OBJETIVOS[0].mensagem);
  const [investimento, setInvestimento] = useState('');
  // Escolher outro objetivo troca a mensagem sugerida, mas nunca por cima de
  // um texto que a pessoa já ajustou.
  const [mensagemTocada, setMensagemTocada] = useState(false);

  const objetivo =
    objetivoChave === 'outro'
      ? objetivoLivre
      : (OBJETIVOS.find((o) => o.chave === objetivoChave)?.rotulo ?? '');

  function escolherObjetivo(chave: string) {
    setObjetivoChave(chave);
    const escolhido = OBJETIVOS.find((o) => o.chave === chave);
    if (escolhido?.mensagem && !mensagemTocada) setModelo(escolhido.mensagem);
  }

  async function salvar() {
    if (!nome.trim()) return;
    await executar(
      () =>
        supabase.from('campanhas').insert({
          clinica_id: clinicaId,
          unidade_id: unidadeId,
          nome: nome.trim(),
          objetivo: objetivo.trim() || null,
          modelo_mensagem: modelo,
          investimento: investimento ? Number(investimento) : 0,
          criado_por: membroId,
        }),
      'Campanha criada como rascunho',
      () => {
        setNome('');
        setObjetivoLivre('');
        setMensagemTocada(false);
        aoCriar();
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Criar campanha"
      descricao="Ela nasce como rascunho — o disparo só começa quando você ligar a chave."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Criar"
      salvando={ocupado}
    >
      <Campo rotulo="Nome da campanha">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Clientes inativos — setembro"
          required
          autoFocus
        />
      </Campo>
      <Campo rotulo="Objetivo" dica="Escolher um objetivo já sugere a mensagem.">
        <select value={objetivoChave} onChange={(e) => escolherObjetivo(e.target.value)}>
          {OBJETIVOS.map((o) => (
            <option key={o.chave} value={o.chave}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      {objetivoChave === 'outro' && (
        <Campo rotulo="Qual o objetivo?">
          <input
            value={objetivoLivre}
            onChange={(e) => setObjetivoLivre(e.target.value)}
            placeholder="Trazer de volta quem não vem há 6 meses"
          />
        </Campo>
      )}

      <Campo rotulo="Mensagem" dica="Use {{primeiro_nome}} para personalizar.">
        <textarea
          value={modelo}
          onChange={(e) => {
            setModelo(e.target.value);
            setMensagemTocada(true);
          }}
          rows={4}
        />
      </Campo>
      <Campo rotulo="Investimento previsto (R$)">
        <input
          type="number"
          min={0}
          step="0.01"
          value={investimento}
          onChange={(e) => setInvestimento(e.target.value)}
        />
      </Campo>
      <p className="modal-nota">
        <Smartphone size={14} /> O público e o disparo dependem de um número de WhatsApp conectado.
      </p>
    </Modal>
  );
}

export function funilDaCampanha(c: DesempenhoCampanha) {
  return [
    { rotulo: 'Abordados', valor: Number(c.abordados ?? 0), cor: '#6d5527' },
    { rotulo: 'Responderam', valor: Number(c.responderam ?? 0), cor: '#96742f' },
    { rotulo: 'Agendaram', valor: Number(c.agendaram ?? 0), cor: '#c8a15b' },
    { rotulo: 'Compareceram', valor: Number(c.compareceram ?? 0), cor: '#e7d0a1' },
  ];
}

export function resumoCampanha(c: DesempenhoCampanha) {
  return {
    receita: moeda(c.receita),
    roi: c.retorno_sobre_investimento ? `${Number(c.retorno_sobre_investimento).toFixed(1)}x` : '—',
    investido: moeda(c.investimento),
    taxaResposta: percentual(c.taxa_resposta_percentual),
  };
}
