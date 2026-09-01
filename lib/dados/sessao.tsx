'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/cliente';
import type { Database } from '@/lib/supabase/tipos-banco';

type Perfil = Database['public']['Tables']['perfis']['Row'];
type Unidade = Database['public']['Tables']['unidades']['Row'];
type Clinica = Database['public']['Tables']['clinicas']['Row'];
type Papel = Database['public']['Enums']['papel_usuario'];

/**
 * `sem-clinica` é o estado de quem acabou de se cadastrar: existe login, mas
 * ainda não existe tenant. É o onboarding que resolve.
 */
export type Situacao = 'carregando' | 'deslogado' | 'sem-clinica' | 'pronto';

type ContextoSessao = {
  situacao: Situacao;
  sessao: Session | null;
  perfil: Perfil | null;
  clinica: Clinica | null;
  /**
   * Id da linha em `membros_clinica` — não confundir com o id do perfil.
   * É ele que as colunas de autoria (criado_por, enviada_por, assumida_por,
   * responsavel_id) referenciam por chave estrangeira.
   */
  membroId: string | null;
  papel: Papel | null;
  ehGestor: boolean;
  unidades: Unidade[];
  unidade: Unidade | null;
  trocarUnidade: (id: string) => void;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
};

const Contexto = createContext<ContextoSessao | null>(null);

const CHAVE_UNIDADE = 'cliniia:unidade';

const PAPEIS_GESTORES: Papel[] = ['proprietario', 'administrador', 'gerente'];

export function ProvedorSessao({ children }: { children: React.ReactNode }) {
  const [situacao, setSituacao] = useState<Situacao>('carregando');
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [clinica, setClinica] = useState<Clinica | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [membroId, setMembroId] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);

  /** Carrega perfil, vínculo e unidades de quem está logado. */
  const carregarContexto = useCallback(async (sessaoAtual: Session | null) => {
    if (!sessaoAtual) {
      setPerfil(null);
      setClinica(null);
      setPapel(null);
      setMembroId(null);
      setUnidades([]);
      setSituacao('deslogado');
      return;
    }

    const usuarioId = sessaoAtual.user.id;

    const [respostaPerfil, respostaVinculo] = await Promise.all([
      supabase.from('perfis').select('*').eq('id', usuarioId).maybeSingle(),
      supabase
        .from('membros_clinica')
        .select('id, papel, unidade_id, clinicas(*)')
        .eq('perfil_id', usuarioId)
        .eq('ativo', true)
        .order('criado_em')
        .limit(1)
        .maybeSingle(),
    ]);

    setPerfil(respostaPerfil.data ?? null);

    const vinculo = respostaVinculo.data as
      | { id: string; papel: Papel; unidade_id: string | null; clinicas: Clinica | null }
      | null;

    if (!vinculo?.clinicas) {
      setClinica(null);
      setPapel(null);
      setMembroId(null);
      setUnidades([]);
      setSituacao('sem-clinica');
      return;
    }

    setClinica(vinculo.clinicas);
    setPapel(vinculo.papel);
    setMembroId(vinculo.id);

    const { data: listaUnidades } = await supabase
      .from('unidades')
      .select('*')
      .eq('clinica_id', vinculo.clinicas.id)
      .eq('ativa', true)
      .order('nome');

    const disponiveis = listaUnidades ?? [];
    setUnidades(disponiveis);

    // Um membro preso a uma unidade não escolhe; os demais retomam a última.
    const salva = typeof window === 'undefined' ? null : localStorage.getItem(CHAVE_UNIDADE);
    const preferida =
      vinculo.unidade_id ??
      (salva && disponiveis.some((u) => u.id === salva) ? salva : null) ??
      disponiveis[0]?.id ??
      null;

    setUnidadeId(preferida);
    setSituacao('pronto');
  }, []);

  useEffect(() => {
    let ativo = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      void carregarContexto(data.session);
    });

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      if (!ativo) return;
      setSessao(novaSessao);
      // TOKEN_REFRESHED chega de tempos em tempos e não muda nada do contexto.
      setSituacao((anterior) =>
        anterior === 'pronto' && novaSessao ? anterior : 'carregando',
      );
      void carregarContexto(novaSessao);
    });

    return () => {
      ativo = false;
      inscricao.subscription.unsubscribe();
    };
  }, [carregarContexto]);

  const trocarUnidade = useCallback((id: string) => {
    setUnidadeId(id);
    try {
      localStorage.setItem(CHAVE_UNIDADE, id);
    } catch {
      // Navegação privada: seguir sem persistir a preferência.
    }
  }, []);

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSessao(data.session);
    await carregarContexto(data.session);
  }, [carregarContexto]);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    try {
      localStorage.removeItem(CHAVE_UNIDADE);
    } catch {
      // idem
    }
  }, []);

  const valor = useMemo<ContextoSessao>(
    () => ({
      situacao,
      sessao,
      perfil,
      clinica,
      membroId,
      papel,
      ehGestor: papel ? PAPEIS_GESTORES.includes(papel) : false,
      unidades,
      unidade: unidades.find((u) => u.id === unidadeId) ?? null,
      trocarUnidade,
      recarregar,
      sair,
    }),
    [
      situacao,
      sessao,
      perfil,
      clinica,
      membroId,
      papel,
      unidades,
      unidadeId,
      trocarUnidade,
      recarregar,
      sair,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ContextoSessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de <ProvedorSessao>.');
  return contexto;
}

/**
 * Atalho para as telas internas, onde clínica e unidade já existem.
 * Evita repetir `clinica!.id` em toda consulta.
 */
export function useClinica() {
  const { clinica, unidade, perfil, membroId, ehGestor } = useSessao();
  return {
    clinicaId: clinica?.id ?? '',
    unidadeId: unidade?.id ?? null,
    clinica,
    unidade,
    perfil,
    membroId,
    ehGestor,
  };
}
