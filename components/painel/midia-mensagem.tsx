'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { urlDaMidia } from '@/lib/dados/midia';

/**
 * Mídia dentro do balão da conversa.
 *
 * A URL é resolvida sob demanda porque o que está gravado é o caminho no balde
 * privado — a assinatura só é pedida quando a mensagem entra na tela.
 */
export function MidiaMensagem({
  midiaUrl,
  tipo,
  legenda,
}: {
  midiaUrl: string;
  tipo: string;
  legenda?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    urlDaMidia(midiaUrl)
      .then((resolvida) => ativo && setUrl(resolvida))
      .catch(() => ativo && setFalhou(true));
    return () => {
      ativo = false;
    };
  }, [midiaUrl]);

  if (falhou) return <p className="midia-erro">Não foi possível carregar o arquivo.</p>;

  if (!url) {
    return (
      <div className="midia-carregando">
        <Loader2 size={15} className="girando" />
      </div>
    );
  }

  if (tipo === 'imagem' || tipo === 'figurinha') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="midia-imagem">
        <img src={url} alt={legenda ?? 'Imagem enviada na conversa'} loading="lazy" />
      </a>
    );
  }

  if (tipo === 'audio') {
    return <audio className="midia-audio" controls preload="metadata" src={url} />;
  }

  if (tipo === 'video') {
    return <video className="midia-video" controls preload="metadata" src={url} />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="midia-documento">
      <FileText size={16} />
      <span>{legenda?.trim() || 'Abrir documento'}</span>
    </a>
  );
}
