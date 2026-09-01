'use client';

import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import type { Database } from '@/lib/supabase/tipos-banco';

type Tabelas = Database['public']['Tables'];

export type Paciente = Tabelas['pacientes']['Row'];
export type Procedimento = Tabelas['procedimentos']['Row'];
export type Profissional = Tabelas['profissionais']['Row'];
export type EtapaFunil = Tabelas['etapas_funil']['Row'];
export type Campanha = Tabelas['campanhas']['Row'];
export type NumeroWhatsapp = Tabelas['numeros_whatsapp']['Row'];
export type ConfiguracaoIA = Tabelas['configuracoes_ia']['Row'];

/** Listas usadas nos seletores dos formulários. Curtas por natureza. */

export function usePacientes(clinicaId: string) {
  return useConsulta<Paciente[]>(
    clinicaId
      ? () =>
          supabase
            .from('pacientes')
            .select('*')
            .eq('clinica_id', clinicaId)
            .is('excluido_em', null)
            .order('nome_completo')
            .limit(500)
      : null,
    [clinicaId],
  );
}

export function useProcedimentos(clinicaId: string) {
  return useConsulta<Procedimento[]>(
    clinicaId
      ? () =>
          supabase
            .from('procedimentos')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
            .order('nome')
      : null,
    [clinicaId],
  );
}

export function useProfissionais(clinicaId: string) {
  return useConsulta<Profissional[]>(
    clinicaId
      ? () =>
          supabase
            .from('profissionais')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
            .order('nome')
      : null,
    [clinicaId],
  );
}

export function useEtapasFunil(clinicaId: string) {
  return useConsulta<EtapaFunil[]>(
    clinicaId
      ? () =>
          supabase
            .from('etapas_funil')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativa', true)
            .order('ordem')
      : null,
    [clinicaId],
  );
}

export function useCampanhas(clinicaId: string) {
  return useConsulta<Campanha[]>(
    clinicaId
      ? () =>
          supabase
            .from('campanhas')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('criado_em', { ascending: false })
      : null,
    [clinicaId],
  );
}

/**
 * Cria (ou reaproveita) o paciente pelo telefone, que é a chave natural do
 * WhatsApp. Sem isso, cada tela criaria uma Mariana Lopes diferente.
 */
export async function garantirPaciente(entrada: {
  clinicaId: string;
  unidadeId: string | null;
  nome: string;
  telefone: string;
  origem?: Database['public']['Enums']['origem_contato'];
  interesse?: string | null;
}): Promise<{ id: string | null; error: unknown }> {
  const { data: existente, error: erroBusca } = await supabase
    .from('pacientes')
    .select('id')
    .eq('clinica_id', entrada.clinicaId)
    .eq('telefone', entrada.telefone)
    .is('excluido_em', null)
    .maybeSingle();

  if (erroBusca) return { id: null, error: erroBusca };
  if (existente) return { id: existente.id, error: null };

  const { data, error } = await supabase
    .from('pacientes')
    .insert({
      clinica_id: entrada.clinicaId,
      unidade_id: entrada.unidadeId,
      nome_completo: entrada.nome,
      telefone: entrada.telefone,
      origem: entrada.origem ?? 'whatsapp',
      interesse_principal: entrada.interesse ?? null,
    })
    .select('id')
    .single();

  return { id: data?.id ?? null, error };
}
