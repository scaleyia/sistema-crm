'use client';

import { useMemo, useState } from 'react';
import { Bell, Bot, CalendarDays, Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { garantirPaciente, useProcedimentos, useProfissionais } from '@/lib/dados/catalogo';
import {
  dataIso,
  hora,
  moeda,
  paraIso,
  ROTULO_STATUS_AGENDAMENTO,
  somarMinutos,
  telefoneDigitos,
} from '@/lib/dados/formato';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Modal, useAcao } from './base';

type LinhaAgenda = {
  agendamento_id: string;
  inicio: string;
  fim: string;
  status: string;
  valor: number | null;
  paciente: string | null;
  procedimento: string | null;
  profissional: string | null;
  duracao_minutos: number | null;
};

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export function PainelAgenda() {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();

  const [dia, setDia] = useState(() => dataIso(new Date()));
  const [semana, setSemana] = useState(0);
  const [modalAberto, setModalAberto] = useState(false);
  const [pulso, setPulso] = useState(0);

  // Semana de domingo a sábado, deslocada por `semana`. Navegar por semana
  // inteira evita o efeito de "janela deslizante" que confunde quem procura
  // uma data específica.
  const faixa = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - base.getDay() + semana * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [semana]);

  const primeiroDia = dataIso(faixa[0]);
  const ultimoDia = dataIso(faixa[6]);

  // Contagem por dia, para a faixa mostrar onde há atendimento sem precisar
  // clicar dia a dia.
  const contagens = useConsulta<Array<{ data_local: string }>>(
    clinicaId
      ? () => {
          let consulta = supabase
            .from('vw_agenda')
            .select('data_local')
            .eq('clinica_id', clinicaId)
            .gte('data_local', primeiroDia)
            .lte('data_local', ultimoDia)
            .neq('status', 'cancelado');
          if (unidadeId) consulta = consulta.eq('unidade_id', unidadeId);
          return consulta;
        }
      : null,
    [clinicaId, unidadeId, primeiroDia, ultimoDia], [pulso],
  );

  const porDia = new Map<string, number>();
  for (const linha of contagens.dados ?? []) {
    porDia.set(linha.data_local, (porDia.get(linha.data_local) ?? 0) + 1);
  }

  const agenda = useConsulta<LinhaAgenda[]>(
    clinicaId
      ? () => {
          let consulta = supabase
            .from('vw_agenda')
            .select(
              'agendamento_id, inicio, fim, status, valor, paciente, procedimento, profissional, duracao_minutos',
            )
            .eq('clinica_id', clinicaId)
            .eq('data_local', dia)
            .order('inicio');
          if (unidadeId) consulta = consulta.eq('unidade_id', unidadeId);
          return consulta;
        }
      : null,
    [clinicaId, unidadeId, dia], [pulso],
  );

  const linhas = agenda.dados ?? [];
  const confirmados = linhas.filter((l) => l.status === 'confirmado').length;
  const aguardando = linhas.filter((l) => l.status === 'aguardando_confirmacao').length;
  const agora = new Date().toISOString();
  const proximo = linhas.find((l) => l.inicio > agora && l.status !== 'cancelado') ?? null;

  async function mudarStatus(id: string, status: string) {
    await executar(
      () => supabase.from('agendamentos').update({ status: status as never }).eq('id', id),
      `Agendamento: ${ROTULO_STATUS_AGENDAMENTO[status]}`,
      () => setPulso((n) => n + 1),
    );
  }

  /** Enfileira a confirmação; o worker de envio consome `lembretes_agendamento`. */
  async function enviarLembrete(id: string) {
    await executar(
      () =>
        supabase.from('lembretes_agendamento').insert({
          clinica_id: clinicaId,
          agendamento_id: id,
          tipo: 'confirmacao',
          enviar_em: new Date().toISOString(),
        }),
      'Lembrete enfileirado para envio',
    );
  }

  const hojeIso = dataIso(new Date());
  const ehHoje = dia === hojeIso;

  return (
    <>
      <Cabecalho
        titulo="Agenda"
        texto="Confirmações e lembretes em um só lugar."
        acao={
          <div className="acoes-cabecalho">
            {(!ehHoje || semana !== 0) && (
              <button
                className="secondary-btn"
                onClick={() => {
                  setSemana(0);
                  setDia(hojeIso);
                }}
              >
                <CalendarDays size={15} /> Hoje
              </button>
            )}
            <button className="primary-btn" onClick={() => setModalAberto(true)}>
              <Plus size={15} /> Novo agendamento
            </button>
          </div>
        }
      />

      <div className="calendar-strip panel">
        <button
          className="passo-semana"
          onClick={() => setSemana((n) => n - 1)}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={17} />
        </button>

        {faixa.map((d) => {
          const iso = dataIso(d);
          const quantidade = porDia.get(iso) ?? 0;
          return (
            <button
              key={iso}
              className={`${dia === iso ? 'active' : ''} ${iso === hojeIso ? 'hoje' : ''}`}
              onClick={() => setDia(iso)}
            >
              <span>{DIAS[d.getDay()]}</span>
              <b>{d.getDate()}</b>
              {quantidade > 0 ? <em>{quantidade}</em> : <em className="vazio" />}
            </button>
          );
        })}

        <button
          className="passo-semana"
          onClick={() => setSemana((n) => n + 1)}
          aria-label="Próxima semana"
        >
          <ChevronRight size={17} />
        </button>
      </div>

      <div className="agenda-grid">
        <article className="panel day-schedule">
          <div className="panel-title">
            <div>
              <h2>
                {new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
                {ehHoje ? ' (hoje)' : ''}
              </h2>
              <p>
                {linhas.length
                  ? `${linhas.length} atendimento(s) agendado(s)`
                  : 'Nenhum atendimento agendado'}
              </p>
            </div>
          </div>

          <Conteudo
            consulta={agenda}
            linhas={3}
            vazio={
              <EstadoVazio
                icone={CalendarDays}
                titulo="Agenda livre"
                texto="Escolha outro dia ou crie um agendamento."
                acao={
                  <button className="primary-btn" onClick={() => setModalAberto(true)}>
                    <Plus size={15} /> Novo agendamento
                  </button>
                }
              />
            }
          >
            {(itens) => (
              <>
                {itens.map((item) => (
                  <div className="agenda-event" key={item.agendamento_id}>
                    <time>{hora(item.inicio)}</time>
                    <div className="event-line" />
                    <div>
                      <b>{item.paciente ?? 'Sem paciente'}</b>
                      <span>
                        {item.procedimento ?? 'Sem procedimento'} • {item.duracao_minutos ?? 60} min
                        {item.profissional ? ` • ${item.profissional}` : ''}
                        {item.valor ? ` • ${moeda(item.valor)}` : ''}
                      </span>
                    </div>
                    <span
                      className={`status ${
                        item.status === 'confirmado' || item.status === 'compareceu'
                          ? 'confirmed'
                          : item.status === 'cancelado' || item.status === 'faltou'
                            ? 'cancelado'
                            : 'waiting'
                      }`}
                    >
                      {ROTULO_STATUS_AGENDAMENTO[item.status] ?? item.status}
                    </span>

                    <div className="acoes-evento">
                      {item.status === 'aguardando_confirmacao' && (
                        <button
                          className="secondary-btn"
                          disabled={ocupado}
                          onClick={() => mudarStatus(item.agendamento_id, 'confirmado')}
                        >
                          <Check size={14} /> Confirmar
                        </button>
                      )}
                      {item.status === 'confirmado' && (
                        <button
                          className="secondary-btn"
                          disabled={ocupado}
                          onClick={() => mudarStatus(item.agendamento_id, 'compareceu')}
                        >
                          <Check size={14} /> Compareceu
                        </button>
                      )}
                      <button
                        className="secondary-btn"
                        disabled={ocupado}
                        onClick={() => enviarLembrete(item.agendamento_id)}
                      >
                        <Bell size={14} /> Lembrete
                      </button>
                      {item.status !== 'cancelado' && (
                        <button
                          className="secondary-btn perigo"
                          disabled={ocupado}
                          onClick={() => mudarStatus(item.agendamento_id, 'cancelado')}
                          aria-label="Cancelar agendamento"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </Conteudo>
        </article>

        <aside className="panel summary-card">
          <h2>Resumo do dia</h2>
          <div>
            <span>
              Confirmados<b>{confirmados}</b>
            </span>
            <span>
              Aguardando<b>{aguardando}</b>
            </span>
            <span>
              Total<b>{linhas.length}</b>
            </span>
          </div>
          <hr />
          {proximo ? (
            <div className="proximo">
              <span>PRÓXIMO ATENDIMENTO</span>
              <b>{proximo.paciente ?? 'Sem paciente'}</b>
              <small>
                {hora(proximo.inicio)} • {proximo.procedimento ?? 'Sem procedimento'}
              </small>
            </div>
          ) : (
            <p className="sem-proximo">Nada mais marcado para este dia.</p>
          )}
          <hr />
          <p>
            <Bot size={17} /> A confirmação da véspera é enviada às 18h pelo disparador.
          </p>
        </aside>
      </div>

      <ModalAgendamento
        aberto={modalAberto}
        dia={dia}
        aoFechar={() => setModalAberto(false)}
        aoCriar={() => setPulso((n) => n + 1)}
      />
    </>
  );
}

function ModalAgendamento({
  aberto,
  dia,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  dia: string;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const { clinicaId, unidadeId, membroId } = useClinica();
  const { executar, ocupado } = useAcao();
  const procedimentos = useProcedimentos(clinicaId);
  const profissionais = useProfissionais(clinicaId);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [procedimentoId, setProcedimentoId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [data, setData] = useState(dia);
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [duracao, setDuracao] = useState(60);
  const [valor, setValor] = useState('');

  const procedimento = procedimentos.dados?.find((p) => p.id === procedimentoId);

  // Escolher o procedimento herda duração e preço do catálogo.
  function escolherProcedimento(id: string) {
    setProcedimentoId(id);
    const escolhido = procedimentos.dados?.find((p) => p.id === id);
    if (escolhido) {
      setDuracao(escolhido.duracao_minutos ?? 60);
      setValor(String(escolhido.valor_promocional ?? escolhido.valor ?? ''));
    }
  }

  async function salvar() {
    const digitos = telefoneDigitos(telefone);
    if (!nome.trim() || digitos.length < 12 || !unidadeId) return;

    await executar(
      async () => {
        const { id: pacienteId, error } = await garantirPaciente({
          clinicaId,
          unidadeId,
          nome: nome.trim(),
          telefone: digitos,
          interesse: procedimento?.nome ?? null,
        });
        if (error || !pacienteId) return { error };

        const inicio = paraIso(data, horaInicio);
        return supabase.from('agendamentos').insert({
          clinica_id: clinicaId,
          unidade_id: unidadeId,
          paciente_id: pacienteId,
          procedimento_id: procedimentoId || null,
          profissional_id: profissionalId || null,
          inicio,
          fim: somarMinutos(inicio, duracao),
          valor: valor ? Number(valor) : null,
          origem: 'presencial',
          criado_por: membroId,
        });
      },
      'Agendamento criado',
      () => {
        setNome('');
        setTelefone('');
        aoCriar();
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Novo agendamento"
      descricao="O paciente é identificado pelo telefone; se for novo, ele é cadastrado."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Agendar"
      salvando={ocupado}
    >
      {!unidadeId && (
        <p className="modal-nota alerta">
          Cadastre uma unidade antes de agendar (menu Minha clínica).
        </p>
      )}

      <div className="modal-grade">
        <Campo rotulo="Paciente">
          <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
        </Campo>
        <Campo rotulo="Telefone">
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 99845-2031"
            required
          />
        </Campo>

        <Campo rotulo="Procedimento">
          <select value={procedimentoId} onChange={(e) => escolherProcedimento(e.target.value)}>
            <option value="">— Sem procedimento —</option>
            {(procedimentos.dados ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Profissional">
          <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
            <option value="">— A definir —</option>
            {(profissionais.dados ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Data">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </Campo>
        <Campo rotulo="Início">
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            required
          />
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
      </div>

      <p className="modal-nota">
        O banco recusa dois atendimentos do mesmo profissional no mesmo horário.
      </p>
    </Modal>
  );
}
