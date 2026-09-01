'use client';

import { supabase } from '@/lib/supabase/cliente';

/**
 * Mídias das conversas.
 *
 * O arquivo vai direto do navegador para o Storage — o RLS confere se quem
 * envia é membro da clínica pelo primeiro segmento do caminho. O servidor
 * recebe só o caminho, nunca o binário.
 */

const BALDE = 'midias';

export type TipoMidia = 'imagem' | 'audio' | 'video' | 'documento';

const POR_MIME: Array<[RegExp, TipoMidia]> = [
  [/^image\//, 'imagem'],
  [/^audio\//, 'audio'],
  [/^video\//, 'video'],
];

export function tipoDoArquivo(mime: string): TipoMidia {
  return POR_MIME.find(([padrao]) => padrao.test(mime))?.[1] ?? 'documento';
}

/** Limite do balde; conferir antes evita subir 20 MB para receber erro no fim. */
export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

function extensao(nome: string, mime: string): string {
  const doNome = nome.includes('.') ? nome.split('.').pop() : null;
  if (doNome && doNome.length <= 5) return doNome.toLowerCase();
  return (mime.split('/')[1] ?? 'bin').split(';')[0];
}

export async function subirMidia(
  clinicaId: string,
  arquivo: Blob,
  nomeOriginal: string,
): Promise<{ caminho: string; erro: string | null }> {
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { caminho: '', erro: 'Arquivo maior que 25 MB.' };
  }

  const mime = arquivo.type || 'application/octet-stream';
  const caminho = `${clinicaId}/${crypto.randomUUID()}.${extensao(nomeOriginal, mime)}`;

  const { error } = await supabase.storage.from(BALDE).upload(caminho, arquivo, {
    contentType: mime,
    upsert: false,
  });

  return { caminho, erro: error?.message ?? null };
}

/**
 * URL para exibir a mídia.
 *
 * O que fica gravado em `midia_url` pode ser o caminho no nosso balde (mídia
 * que nós enviamos) ou uma URL completa da UazApi (mídia recebida). Só o
 * primeiro caso precisa de assinatura.
 */
export async function urlDaMidia(midiaUrl: string): Promise<string | null> {
  if (/^https?:\/\//.test(midiaUrl)) return midiaUrl;

  const { data } = await supabase.storage.from(BALDE).createSignedUrl(midiaUrl, 3600);
  return data?.signedUrl ?? null;
}

/** O formato que o navegador consegue gravar varia; pegamos o primeiro aceito. */
export function formatoDeGravacao(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidatos = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  return candidatos.find((formato) => MediaRecorder.isTypeSupported(formato));
}

/* ------------------------------------------------------------------ marca */

const BALDE_MARCA = 'marca';
export const TAMANHO_MAXIMO_LOGO = 2 * 1024 * 1024;

/**
 * Sobe a logo da clínica e devolve a URL definitiva.
 *
 * O balde é público, então a URL é estável e não precisa de assinatura a cada
 * carregamento. O nome do arquivo carrega um carimbo de tempo porque o
 * navegador guarda a imagem em cache: reusar o mesmo nome mostraria a logo
 * antiga depois da troca.
 */
export async function subirLogo(
  clinicaId: string,
  arquivo: File,
): Promise<{ url: string; caminho: string; erro: string | null }> {
  if (arquivo.size > TAMANHO_MAXIMO_LOGO) {
    return { url: '', caminho: '', erro: 'A logo precisa ter até 2 MB.' };
  }

  const mime = arquivo.type || 'image/png';
  const caminho = `${clinicaId}/logo-${Date.now()}.${extensao(arquivo.name, mime)}`;

  const { error } = await supabase.storage.from(BALDE_MARCA).upload(caminho, arquivo, {
    contentType: mime,
    upsert: true,
  });

  if (error) return { url: '', caminho: '', erro: error.message };

  const { data } = supabase.storage.from(BALDE_MARCA).getPublicUrl(caminho);
  return { url: data.publicUrl, caminho, erro: null };
}

/** Remove uma logo antiga; falhar aqui não pode atrapalhar a troca. */
export async function apagarLogo(url: string): Promise<void> {
  const marcador = `/${BALDE_MARCA}/`;
  const posicao = url.indexOf(marcador);
  if (posicao < 0) return;

  const caminho = url.slice(posicao + marcador.length).split('?')[0];
  await supabase.storage.from(BALDE_MARCA).remove([decodeURIComponent(caminho)]);
}
