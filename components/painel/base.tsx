'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';

/* ------------------------------------------------------------------ avisos */

type Aviso = { texto: string; tom: 'ok' | 'erro' };

type ContextoAviso = {
  avisar: (texto: string) => void;
  alertar: (texto: string) => void;
};

const AvisoContexto = createContext<ContextoAviso | null>(null);

export function ProvedorAviso({ children }: { children: React.ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.tom === 'erro' ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [aviso]);

  const valor = useMemo<ContextoAviso>(
    () => ({
      avisar: (texto) => setAviso({ texto, tom: 'ok' }),
      alertar: (texto) => setAviso({ texto, tom: 'erro' }),
    }),
    [],
  );

  return (
    <AvisoContexto.Provider value={valor}>
      {children}
      {aviso && (
        <div className={`toast ${aviso.tom === 'erro' ? 'toast-erro' : ''}`} role="status">
          {aviso.tom === 'erro' ? <AlertTriangle size={16} /> : <Check size={16} />}
          {aviso.texto}
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      )}
    </AvisoContexto.Provider>
  );
}

export function useAviso(): ContextoAviso {
  const contexto = useContext(AvisoContexto);
  if (!contexto) throw new Error('useAviso precisa estar dentro de <ProvedorAviso>.');
  return contexto;
}

/* ----------------------------------------------------------------- cabeçalho */

/**
 * Cabeçalho de tela.
 *
 * `etiqueta` é opcional de propósito: só vale a pena quando carrega informação
 * (a data, no painel inicial). Como rótulo fixo acima do título ela repetia o
 * nome da própria tela — "AGENDA" sobre "Agenda" — e virava ruído.
 */
export function Cabecalho({
  etiqueta,
  titulo,
  texto,
  acao,
}: {
  etiqueta?: string;
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="welcome section-heading">
      <div>
        {etiqueta && <p>{etiqueta}</p>}
        <h1>{titulo}</h1>
        <span>{texto}</span>
      </div>
      {acao}
    </div>
  );
}

/* -------------------------------------------------------------------- estados */

export function Esqueleto({ linhas = 3, altura = 64 }: { linhas?: number; altura?: number }) {
  return (
    <div className="esqueleto" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <span key={i} style={{ height: altura }} />
      ))}
    </div>
  );
}

export function EstadoVazio({
  icone: Icone,
  titulo,
  texto,
  acao,
}: {
  icone: React.ElementType;
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icone />
      <b>{titulo}</b>
      <span>{texto}</span>
      {acao}
    </div>
  );
}

export function Falha({ erro, aoTentar }: { erro: string; aoTentar?: () => void }) {
  return (
    <div className="falha" role="alert">
      <AlertTriangle size={18} />
      <p>{erro}</p>
      {aoTentar && (
        <button className="secondary-btn" onClick={aoTentar}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/**
 * Envolve o corpo de um painel: mostra esqueleto enquanto carrega, erro se
 * falhar e o conteúdo quando há dados. Evita repetir esse `if` em toda tela.
 */
export function Conteudo<T>({
  consulta,
  vazio,
  linhas,
  children,
}: {
  consulta: { dados: T | null; carregando: boolean; erro: string | null; recarregar: () => void };
  vazio?: React.ReactNode;
  linhas?: number;
  children: (dados: T) => React.ReactNode;
}) {
  if (consulta.carregando) return <Esqueleto linhas={linhas ?? 3} />;
  if (consulta.erro) return <Falha erro={consulta.erro} aoTentar={consulta.recarregar} />;
  const dados = consulta.dados;
  const semDados = dados == null || (Array.isArray(dados) && dados.length === 0);
  if (semDados && vazio) return <>{vazio}</>;
  if (dados == null) return null;
  return <>{children(dados)}</>;
}

/* --------------------------------------------------------------------- modal */

export function Modal({
  titulo,
  descricao,
  aberto,
  aoFechar,
  aoConfirmar,
  rotuloConfirmar = 'Salvar',
  salvando = false,
  children,
}: {
  titulo: string;
  descricao?: string;
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar?: () => void;
  rotuloConfirmar?: string;
  salvando?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const escutar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', escutar);
    return () => window.removeEventListener('keydown', escutar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="modal-fundo" onMouseDown={aoFechar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <h2>{titulo}</h2>
            {descricao && <p>{descricao}</p>}
          </div>
          <button onClick={aoFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <form
          className="modal-corpo"
          onSubmit={(e) => {
            e.preventDefault();
            aoConfirmar?.();
          }}
        >
          {children}
          {aoConfirmar && (
            <footer>
              <button type="button" className="secondary-btn" onClick={aoFechar}>
                Cancelar
              </button>
              <button type="submit" className="primary-btn" disabled={salvando}>
                {salvando ? <Loader2 size={15} className="girando" /> : null}
                {salvando ? 'Salvando...' : rotuloConfirmar}
              </button>
            </footer>
          )}
        </form>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- campos */

export function Campo({
  rotulo,
  children,
  dica,
  largo = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  dica?: string;
  largo?: boolean;
}) {
  return (
    <label className={`campo ${largo ? 'campo-largo' : ''}`}>
      {rotulo}
      {children}
      {dica && <small>{dica}</small>}
    </label>
  );
}

/** Salva a alteração e mostra o resultado, com trava contra duplo clique. */
export function useAcao() {
  const { avisar, alertar } = useAviso();
  const [ocupado, setOcupado] = useState(false);

  const executar = useCallback(
    async (
      operacao: () => PromiseLike<{ error: unknown } | void>,
      sucesso: string,
      aoTerminar?: () => void,
    ) => {
      if (ocupado) return false;
      setOcupado(true);
      try {
        const resultado = await Promise.resolve(operacao());
        const erro = resultado && 'error' in resultado ? resultado.error : null;
        if (erro) {
          const { mensagemDeErro } = await import('@/lib/dados/consulta');
          alertar(mensagemDeErro(erro));
          return false;
        }
        avisar(sucesso);
        aoTerminar?.();
        return true;
      } catch (falha) {
        const { mensagemDeErro } = await import('@/lib/dados/consulta');
        alertar(mensagemDeErro(falha));
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [ocupado, avisar, alertar],
  );

  return { executar, ocupado };
}
