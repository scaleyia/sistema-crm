import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './tipos-banco';

/**
 * Cliente Supabase do CliniIA.
 *
 * Usa a chave publicável, que é feita para rodar no navegador: toda a proteção
 * dos dados vem do RLS, não do sigilo da chave. A service_role nunca entra aqui.
 */

const URL = import.meta.env.VITE_SUPABASE_URL;
const CHAVE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!URL || !CHAVE) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copie .env.example para .env.local e preencha os valores.',
  );
}

export type ClienteCliniIA = SupabaseClient<Database>;

let instancia: ClienteCliniIA | undefined;

/**
 * Cliente compartilhado do navegador. Um único socket de realtime e uma única
 * sessão para toda a aplicação — chamar várias vezes devolve a mesma instância.
 */
export function clienteSupabase(): ClienteCliniIA {
  instancia ??= createClient<Database>(URL, CHAVE, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return instancia;
}

export const supabase = clienteSupabase();
