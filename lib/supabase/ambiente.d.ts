/**
 * Variáveis de ambiente lidas pelo cliente (Vite as injeta na build).
 * Declaradas aqui em vez de `vite/client` no tsconfig para não alterar a
 * configuração compartilhada do projeto.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
