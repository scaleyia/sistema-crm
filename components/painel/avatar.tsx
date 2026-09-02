'use client';

import { useEffect, useState } from 'react';
import { iniciais } from '@/lib/dados/formato';

/**
 * Foto do contato, com as iniciais como reserva.
 *
 * A URL vem do WhatsApp e **expira** — ela carrega um prazo de validade. Uma
 * foto que deixou de carregar não pode virar um quadrado quebrado no meio da
 * conversa, então a falha volta silenciosamente para as iniciais.
 */
export function Avatar({
  nome,
  foto,
  className = 'patient-avatar peach',
}: {
  nome: string | null | undefined;
  foto?: string | null;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);

  // Foto renovada precisa ser tentada de novo.
  useEffect(() => setFalhou(false), [foto]);

  if (!foto || falhou) {
    return <span className={className}>{iniciais(nome)}</span>;
  }

  return (
    <span className={`${className} com-foto`}>
      <img src={foto} alt="" loading="lazy" onError={() => setFalhou(true)} />
    </span>
  );
}
