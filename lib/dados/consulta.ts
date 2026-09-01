'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

export type Resposta<T> = { data: T | null; error: PostgrestError | null };

/**
 * O que o construtor de consultas do Supabase devolve. As views chegam com
 * todas as colunas anuláveis (o Postgres não sabe garantir o contrário), então
 * o tipo da linha é declarado por quem chama e aplicado aqui.
 */
type RespostaCrua = { data: unknown; error: unknown };

export type Consulta<T> = {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
};

/**
 * Executa uma consulta ao Supabase e devolve estado de carregamento, erro e
 * recarga manual.
 *
 * `executar` é recriada a cada render pelo chamador, então quem manda no
 * disparo são as `dependencias` — a função vai para um ref e nunca entra no
 * array de efeito, o que evitaria um laço infinito.
 *
 * Passar `null` em `executar` significa "ainda não dá para consultar" (por
 * exemplo, antes de a clínica ser conhecida): fica carregando sem ir à rede.
 */
export function useConsulta<T>(
  executar: (() => PromiseLike<RespostaCrua>) | null,
  dependencias: unknown[],
): Consulta<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);

  const executarRef = useRef(executar);
  executarRef.current = executar;

  useEffect(() => {
    const fn = executarRef.current;
    if (!fn) {
      setCarregando(true);
      return;
    }

    let ativo = true;
    setCarregando(true);
    setErro(null);

    Promise.resolve(fn()).then(
      (resposta) => {
        if (!ativo) return;
        if (resposta.error) {
          setErro(mensagemDeErro(resposta.error));
          setDados(null);
        } else {
          setDados(resposta.data as T | null);
        }
        setCarregando(false);
      },
      (falha: unknown) => {
        if (!ativo) return;
        setErro(mensagemDeErro(falha));
        setCarregando(false);
      },
    );

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, gatilho]);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);

  return { dados, carregando, erro, recarregar };
}

/** Traduz os erros mais comuns do Postgres/PostgREST para o operador da clínica. */
export function mensagemDeErro(falha: unknown): string {
  const erro = falha as { code?: string; message?: string; details?: string } | null;
  if (!erro) return 'Algo deu errado. Tente novamente.';

  switch (erro.code) {
    case '23505':
      return erro.message?.includes('clínica')
        ? erro.message
        : 'Já existe um registro com esses dados.';
    case '23503':
      return 'Este registro depende de outro que não existe mais.';
    case '42501':
      return 'Você não tem permissão para esta ação.';
    case 'PGRST116':
      return 'Registro não encontrado.';
    case '23514':
      return erro.message ?? 'Os dados informados não são válidos.';
    default:
      return erro.message ?? 'Algo deu errado. Tente novamente.';
  }
}
