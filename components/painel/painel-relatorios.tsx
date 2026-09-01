'use client';

import { useMemo, useState } from 'react';
import { Activity, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { baixarCsv } from '@/lib/dados/exportar';
import {
  moeda,
  moedaCompacta,
  numero,
  percentual,
  ROTULO_ORIGEM,
  variacao,
} from '@/lib/dados/formato';
import { Cabecalho, Conteudo, EstadoVazio } from './base';

type Indicadores = {
  mes: string;
  conversas_atendidas: number;
  agendamentos: number;
  agendamentos_pela_ia: number;
  comparecimentos: number;
  taxa_conversao_percentual: number;
  receita_total: number;
  receita_atribuida_ia: number;
  ticket_medio: number;
};

type Origem = {
  mes: string;
  origem: string;
  agendamentos: number;
  comparecimentos: number;
  receita: number;
};

/** Períodos que uma clínica realmente compara. */
const PERIODOS: Array<[string, string, number]> = [
  ['mes', 'Este mês', 1],
  ['3m', 'Últimos 3 meses', 3],
  ['6m', 'Últimos 6 meses', 6],
  ['12m', 'Últimos 12 meses', 12],
];

function rotuloMes(iso: string, curto = false): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    month: curto ? 'short' : 'long',
    year: curto ? undefined : 'numeric',
  });
}

export function PainelRelatorios() {
  const { clinicaId } = useClinica();
  const [periodo, setPeriodo] = useState('3m');

  const meses = useConsulta<Indicadores[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_indicadores_mensais')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('mes', { ascending: false })
            .limit(24)
      : null,
    [clinicaId],
  );

  const origens = useConsulta<Origem[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_origem_agendamentos')
            .select('mes, origem, agendamentos, comparecimentos, receita')
            .eq('clinica_id', clinicaId)
            .order('mes', { ascending: false })
            .limit(300)
      : null,
    [clinicaId],
  );

  const quantos = PERIODOS.find(([chave]) => chave === periodo)?.[2] ?? 3;

  // Do mais antigo para o mais novo: gráfico de tempo se lê da esquerda.
  const janela = useMemo(
    () => (meses.dados ?? []).slice(0, quantos).reverse(),
    [meses.dados, quantos],
  );

  const anterior = useMemo(
    () => (meses.dados ?? []).slice(quantos, quantos * 2),
    [meses.dados, quantos],
  );

  const somar = (linhas: Indicadores[], campo: keyof Indicadores) =>
    linhas.reduce((total, linha) => total + Number(linha[campo] ?? 0), 0);

  const atual = {
    receita: somar(janela, 'receita_total'),
    agendamentos: somar(janela, 'agendamentos'),
    comparecimentos: somar(janela, 'comparecimentos'),
    receitaIa: somar(janela, 'receita_atribuida_ia'),
    conversas: somar(janela, 'conversas_atendidas'),
  };

  const passado = {
    receita: somar(anterior, 'receita_total'),
    agendamentos: somar(anterior, 'agendamentos'),
    receitaIa: somar(anterior, 'receita_atribuida_ia'),
  };

  const ticket = atual.comparecimentos ? atual.receita / atual.comparecimentos : 0;
  const ticketAnterior = somar(anterior, 'comparecimentos')
    ? passado.receita / somar(anterior, 'comparecimentos')
    : 0;

  // Origens agregadas na janela escolhida.
  const porOrigem = useMemo(() => {
    const mesesDaJanela = new Set(janela.map((m) => m.mes));
    const acumulado = new Map<string, { agendamentos: number; receita: number }>();
    for (const linha of origens.dados ?? []) {
      if (!mesesDaJanela.has(linha.mes)) continue;
      const atualLinha = acumulado.get(linha.origem) ?? { agendamentos: 0, receita: 0 };
      acumulado.set(linha.origem, {
        agendamentos: atualLinha.agendamentos + Number(linha.agendamentos),
        receita: atualLinha.receita + Number(linha.receita ?? 0),
      });
    }
    return [...acumulado.entries()]
      .map(([origem, dados]) => ({ origem, ...dados }))
      .sort((a, b) => b.agendamentos - a.agendamentos);
  }, [origens.dados, janela]);

  const totalOrigem = porOrigem.reduce((s, o) => s + o.agendamentos, 0);

  function exportar() {
    const nome = `relatorio-${periodo}-${new Date().toISOString().slice(0, 10)}.csv`;
    baixarCsv(
      nome,
      ['Mês', 'Conversas', 'Agendamentos', 'Pela IA', 'Comparecimentos', 'Receita', 'Ticket médio'],
      [
        ...janela.map((m) => [
          rotuloMes(m.mes),
          m.conversas_atendidas,
          m.agendamentos,
          m.agendamentos_pela_ia,
          m.comparecimentos,
          Number(m.receita_total ?? 0).toFixed(2).replace('.', ','),
          Number(m.ticket_medio ?? 0).toFixed(2).replace('.', ','),
        ]),
        [],
        ['Origem', 'Agendamentos', 'Receita'],
        ...porOrigem.map((o) => [
          ROTULO_ORIGEM[o.origem] ?? o.origem,
          o.agendamentos,
          o.receita.toFixed(2).replace('.', ','),
        ]),
      ],
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Relatórios"
        texto="De onde vêm seus agendamentos e quanto cada origem rende."
        acao={
          <div className="acoes-cabecalho">
            <div className="periodos" role="group" aria-label="Período">
              {PERIODOS.map(([chave, rotulo]) => (
                <button
                  key={chave}
                  className={periodo === chave ? 'ativo' : ''}
                  onClick={() => setPeriodo(chave)}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <button className="secondary-btn" onClick={exportar} disabled={!janela.length}>
              <Download size={15} /> Exportar
            </button>
          </div>
        }
      />

      <Conteudo
        consulta={meses}
        linhas={4}
        vazio={
          <div className="panel">
            <EstadoVazio
              icone={Activity}
              titulo="Ainda não há histórico"
              texto="Os relatórios aparecem no primeiro mês com agendamentos ou conversas."
            />
          </div>
        }
      >
        {() =>
          janela.length === 0 ? (
            <div className="panel">
              <EstadoVazio
                icone={Activity}
                titulo="Sem dados neste período"
                texto="Escolha um intervalo maior para ver o histórico."
              />
            </div>
          ) : (
            <>
              <div className="metrics">
                <article className="metric">
                  <span>Receita no período</span>
                  <strong>{moedaCompacta(atual.receita)}</strong>
                  <small>
                    <b>{variacao(atual.receita, passado.receita)}</b> vs. período anterior
                  </small>
                </article>
                <article className="metric">
                  <span>Agendamentos</span>
                  <strong>{numero(atual.agendamentos)}</strong>
                  <small>
                    <b>{variacao(atual.agendamentos, passado.agendamentos)}</b> vs. período anterior
                  </small>
                </article>
                <article className="metric">
                  <span>Ticket médio</span>
                  <strong>{moeda(ticket)}</strong>
                  <small>
                    <b>{variacao(ticket, ticketAnterior)}</b> vs. período anterior
                  </small>
                </article>
                <article className="metric">
                  <span>Retorno da IA</span>
                  <strong>{moedaCompacta(atual.receitaIa)}</strong>
                  <small>
                    {atual.receita
                      ? `${percentual((atual.receitaIa / atual.receita) * 100, 0)} da receita`
                      : 'sem receita no período'}
                  </small>
                </article>
              </div>

              <div className="report-grid">
                <GraficoReceita meses={janela} />
                <GraficoOrigem itens={porOrigem} total={totalOrigem} />
              </div>
            </>
          )
        }
      </Conteudo>
    </>
  );
}

/* ------------------------------------------------------------ receita no tempo */

/**
 * Receita por mês.
 *
 * Barras, não linha: os meses são períodos fechados e comparáveis, não uma
 * medida contínua. Série única, então não há legenda — o título já a nomeia.
 */
function GraficoReceita({ meses }: { meses: Indicadores[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const valores = meses.map((m) => Number(m.receita_total ?? 0));
  const maior = Math.max(1, ...valores);
  const temReceita = valores.some((v) => v > 0);

  // Rótulo direto só no pico e no mês mais recente: são as duas leituras que
  // alguém procura sem passar o mouse. Número em toda barra vira ruído.
  const indicePico = valores.indexOf(Math.max(...valores));
  const indiceUltimo = meses.length - 1;

  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <h2>Receita por mês</h2>
          <p>Valor efetivamente pago no período</p>
        </div>
      </div>

      {!temReceita ? (
        <EstadoVazio
          icone={Activity}
          titulo="Sem receita registrada"
          texto="Os valores aparecem conforme os pagamentos forem marcados como pagos."
        />
      ) : (
        <div className="grafico-barras">
          {meses.map((m, i) => {
            const valor = Number(m.receita_total ?? 0);
            const altura = Math.max(2, (valor / maior) * 100);
            return (
              <div
                key={m.mes}
                className={`coluna ${ativo === i ? 'ativa' : ''}`}
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                tabIndex={0}
                role="figure"
                aria-label={`${rotuloMes(m.mes)}: ${moeda(valor)}`}
              >
                {ativo === i && (
                  <div className="dica-grafico">
                    <b>{rotuloMes(m.mes)}</b>
                    <span>{moeda(valor, true)}</span>
                    <span>
                      {numero(m.agendamentos)} agendamento(s) • {numero(m.comparecimentos)}{' '}
                      comparecimento(s)
                    </span>
                  </div>
                )}
                <div className="trilho">
                  {(i === indicePico || i === indiceUltimo) && valor > 0 && (
                    <span className="valor-direto">{moedaCompacta(valor)}</span>
                  )}
                  <i style={{ height: `${altura}%` }} />
                </div>
                <label>{rotuloMes(m.mes, true).replace('.', '')}</label>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- por origem */

/**
 * Origem dos agendamentos.
 *
 * Barras horizontais ordenadas por volume, com valor rotulado em cada uma —
 * a categoria já é identificada pelo rótulo, então uma cor só basta. Pintar
 * cada barra de um tom diferente seria codificar duas vezes a mesma coisa.
 */
function GraficoOrigem({
  itens,
  total,
}: {
  itens: Array<{ origem: string; agendamentos: number; receita: number }>;
  total: number;
}) {
  const [ativo, setAtivo] = useState<string | null>(null);
  const maior = Math.max(1, ...itens.map((i) => i.agendamentos));

  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <h2>Origem dos agendamentos</h2>
          <p>{total ? `${numero(total)} no período` : 'Nada para distribuir ainda'}</p>
        </div>
      </div>

      {itens.length === 0 ? (
        <EstadoVazio
          icone={Activity}
          titulo="Sem agendamentos no período"
          texto="A origem é registrada quando o agendamento é criado."
        />
      ) : (
        <div className="grafico-origem">
          {itens.map((item) => {
            const parte = total ? (item.agendamentos / total) * 100 : 0;
            return (
              <div
                key={item.origem}
                className={ativo === item.origem ? 'ativo' : ''}
                onMouseEnter={() => setAtivo(item.origem)}
                onMouseLeave={() => setAtivo(null)}
              >
                <span className="rotulo">{ROTULO_ORIGEM[item.origem] ?? item.origem}</span>
                <div className="trilho">
                  <i style={{ width: `${Math.max(2, (item.agendamentos / maior) * 100)}%` }} />
                </div>
                <b>{numero(item.agendamentos)}</b>
                <em>{percentual(parte, 0)}</em>
                {ativo === item.origem && (
                  <div className="dica-grafico dica-lateral">
                    <b>{ROTULO_ORIGEM[item.origem] ?? item.origem}</b>
                    <span>{numero(item.agendamentos)} agendamento(s)</span>
                    <span>{moeda(item.receita, true)} de receita</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
