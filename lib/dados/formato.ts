/** Formatações de exibição — pt-BR em todo o painel. */

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const MOEDA_EXATA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function moeda(valor: number | null | undefined, exata = false): string {
  const n = Number(valor ?? 0);
  return exata ? MOEDA_EXATA.format(n) : MOEDA.format(n);
}

/** Valores grandes viram "R$ 86,4 mil" para caber nos cartões de métrica. */
export function moedaCompacta(valor: number | null | undefined): string {
  const n = Number(valor ?? 0);
  if (Math.abs(n) < 10_000) return moeda(n);
  if (Math.abs(n) < 1_000_000) {
    return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
}

export function numero(valor: number | null | undefined): string {
  return Number(valor ?? 0).toLocaleString('pt-BR');
}

export function percentual(valor: number | null | undefined, casas = 1): string {
  return `${Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;
}

/** Variação entre dois períodos, já com sinal: "+18,2%" / "—" quando não há base. */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined): string {
  const a = Number(atual ?? 0);
  const b = Number(anterior ?? 0);
  if (!b) return a ? 'novo' : '—';
  const delta = ((a - b) / Math.abs(b)) * 100;
  const sinal = delta >= 0 ? '+' : '';
  return `${sinal}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '??';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}

export function hora(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function dataCurta(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function dataPorExtenso(data: Date): string {
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "Agora", "5 min", "1 h", "3 d" — o rótulo curto usado nas listas. */
export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'Agora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `${dias} d`;
  return dataCurta(iso);
}

/** O telefone é a chave natural do WhatsApp: guardamos só dígitos, com DDI. */
export function telefoneDigitos(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55')) return digitos;
  return `55${digitos}`;
}

export function telefoneVisivel(numero: string | null | undefined): string {
  const d = (numero ?? '').replace(/\D/g, '');
  const local = d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return numero ?? '—';
}

/** Combina data (YYYY-MM-DD) e hora (HH:MM) locais num instante ISO. */
export function paraIso(data: string, horaLocal: string): string {
  return new Date(`${data}T${horaLocal}:00`).toISOString();
}

export function dataIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function somarMinutos(iso: string, minutos: number): string {
  return new Date(new Date(iso).getTime() + minutos * 60_000).toISOString();
}

/** Primeiro instante do mês, em ISO — usado nos filtros das views mensais. */
export function inicioDoMes(deslocamento = 0): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1).toISOString();
}

export const ROTULO_STATUS_AGENDAMENTO: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando',
  confirmado: 'Confirmado',
  remarcado: 'Remarcado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  compareceu: 'Compareceu',
  faltou: 'Faltou',
  cancelado: 'Cancelado',
};

export const ROTULO_ORIGEM: Record<string, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  google: 'Google',
  site: 'Site',
  indicacao: 'Indicação',
  reativacao: 'Reativação',
  presencial: 'Presencial',
  telefone: 'Telefone',
  outro: 'Outro',
};

export const ROTULO_STATUS_CAMPANHA: Record<string, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ROTULO_STATUS_CHIP: Record<string, string> = {
  desconectado: 'Desconectado',
  conectando: 'Conectando',
  conectado: 'Online',
  aquecendo: 'Aquecendo',
  pausado: 'Pausado',
  banido: 'Banido',
};
