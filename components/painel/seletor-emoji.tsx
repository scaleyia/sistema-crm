'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Loader2, Search } from 'lucide-react';
import type { GrupoEmoji } from '@/lib/dados/emojis';

/**
 * Seletor de emojis.
 *
 * O catálogo tem ~1.900 itens e pesa dezenas de KB, então entra por importação
 * dinâmica: só é baixado quando alguém abre o seletor pela primeira vez.
 * Os usados recentemente ficam no navegador, como no WhatsApp.
 */

const CHAVE_RECENTES = 'cliniia:emojis-recentes';
const MAXIMO_RECENTES = 32;

function lerRecentes(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE_RECENTES);
    return bruto ? (JSON.parse(bruto) as string[]).slice(0, MAXIMO_RECENTES) : [];
  } catch {
    return [];
  }
}

export function guardarRecente(emoji: string): void {
  try {
    const atuais = lerRecentes().filter((e) => e !== emoji);
    localStorage.setItem(
      CHAVE_RECENTES,
      JSON.stringify([emoji, ...atuais].slice(0, MAXIMO_RECENTES)),
    );
  } catch {
    // Navegação privada: seguir sem histórico de recentes.
  }
}

export function SeletorEmoji({ aoEscolher }: { aoEscolher: (emoji: string) => void }) {
  const [grupos, setGrupos] = useState<GrupoEmoji[] | null>(null);
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState(0);
  const [recentes, setRecentes] = useState<string[]>([]);
  const listaRef = useRef<HTMLDivElement>(null);
  const buscaPt = useRef<Record<string, string>>({});

  useEffect(() => {
    let ativo = true;
    setRecentes(lerRecentes());
    void import('@/lib/dados/emojis').then((modulo) => {
      if (!ativo) return;
      buscaPt.current = modulo.BUSCA_PT;
      setGrupos(modulo.GRUPOS_EMOJI);
    });
    return () => {
      ativo = false;
    };
  }, []);

  /** Traduz o termo em português para as palavras dos nomes do Unicode. */
  const resultados = useMemo(() => {
    if (!grupos) return null;
    const termo = busca.trim().toLowerCase();
    if (!termo) return null;

    const semAcento = termo.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const alvos = [termo, semAcento, buscaPt.current[semAcento] ?? '']
      .filter(Boolean)
      .flatMap((t) => t.split(/\s+/));

    return grupos
      .flatMap((g) => g.emojis)
      .filter(([, nome]) => alvos.some((alvo) => nome.includes(alvo)))
      .slice(0, 200);
  }, [grupos, busca]);

  function escolher(emoji: string) {
    aoEscolher(emoji);
    guardarRecente(emoji);
    setRecentes(lerRecentes());
  }

  function irParaGrupo(indice: number) {
    setAba(indice);
    listaRef.current?.querySelector(`[data-grupo="${indice}"]`)?.scrollIntoView({ block: 'start' });
  }

  if (!grupos) {
    return (
      <div className="seletor-emoji carregando">
        <Loader2 size={18} className="girando" />
      </div>
    );
  }

  return (
    <div className="seletor-emoji">
      <label className="emoji-busca">
        <Search size={14} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar emoji..."
        />
      </label>

      {!busca && (
        <div className="emoji-abas" role="tablist">
          {recentes.length > 0 && (
            <button
              className={aba === -1 ? 'ativa' : ''}
              onClick={() => irParaGrupo(-1)}
              aria-label="Usados recentemente"
            >
              <Clock size={15} />
            </button>
          )}
          {grupos.map((grupo, i) => (
            <button
              key={grupo.nome}
              className={aba === i ? 'ativa' : ''}
              onClick={() => irParaGrupo(i)}
              title={grupo.nome}
              aria-label={grupo.nome}
            >
              {grupo.icone}
            </button>
          ))}
        </div>
      )}

      <div className="emoji-lista" ref={listaRef}>
        {resultados ? (
          resultados.length === 0 ? (
            <p className="lista-vazia">Nenhum emoji encontrado.</p>
          ) : (
            <div className="emoji-grade">
              {resultados.map(([emoji, nome]) => (
                <button key={emoji} onClick={() => escolher(emoji)} title={nome}>
                  {emoji}
                </button>
              ))}
            </div>
          )
        ) : (
          <>
            {recentes.length > 0 && (
              <section data-grupo="-1">
                <h4>Usados recentemente</h4>
                <div className="emoji-grade">
                  {recentes.map((emoji) => (
                    <button key={emoji} onClick={() => escolher(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {grupos.map((grupo, i) => (
              <section key={grupo.nome} data-grupo={i}>
                <h4>{grupo.nome}</h4>
                <div className="emoji-grade">
                  {grupo.emojis.map(([emoji, nome]) => (
                    <button key={emoji} onClick={() => escolher(emoji)} title={nome}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
