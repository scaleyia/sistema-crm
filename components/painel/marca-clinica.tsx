'use client';

import { useRef, useState } from 'react';
import { Building2, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useSessao } from '@/lib/dados/sessao';
import { apagarLogo, subirLogo } from '@/lib/dados/midia';
import { iniciais } from '@/lib/dados/formato';
import { Campo, useAcao, useAviso } from './base';

/**
 * Identidade da clínica: logo e nomes.
 *
 * A logo entra no lugar das iniciais no menu e na barra superior. Enquanto não
 * houver uma, as iniciais continuam servindo — é melhor do que um espaço vazio.
 */
export function MarcaClinica() {
  const { clinica, ehGestor, recarregar } = useSessao();
  const { executar, ocupado } = useAcao();
  const { alertar } = useAviso();

  const [nome, setNome] = useState(clinica?.nome ?? '');
  const [exibicao, setExibicao] = useState(clinica?.nome_exibicao ?? '');
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  if (!clinica) return null;

  const alterado = nome !== clinica.nome || (exibicao || '') !== (clinica.nome_exibicao || '');

  async function trocarLogo(arquivo: File) {
    if (!clinica) return;
    setEnviando(true);
    try {
      const { url, erro } = await subirLogo(clinica.id, arquivo);
      if (erro) {
        alertar(erro);
        return;
      }

      const anterior = clinica.logo_url;
      const ok = await executar(
        () => supabase.from('clinicas').update({ logo_url: url }).eq('id', clinica.id),
        'Logo atualizada',
        recarregar,
      );

      // A antiga só sai depois que a nova está gravada, para nunca ficar sem.
      if (ok && anterior) await apagarLogo(anterior);
    } finally {
      setEnviando(false);
    }
  }

  async function removerLogo() {
    if (!clinica?.logo_url) return;
    const anterior = clinica.logo_url;
    const ok = await executar(
      () => supabase.from('clinicas').update({ logo_url: null }).eq('id', clinica.id),
      'Logo removida',
      recarregar,
    );
    if (ok) await apagarLogo(anterior);
  }

  async function salvarNomes() {
    if (!clinica) return;
    await executar(
      () =>
        supabase
          .from('clinicas')
          .update({ nome: nome.trim(), nome_exibicao: exibicao.trim() || null })
          .eq('id', clinica.id),
      'Dados da clínica salvos',
      recarregar,
    );
  }

  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <h2>Identidade da clínica</h2>
          <p>A logo aparece no menu lateral e na barra superior do painel</p>
        </div>
      </div>

      <input
        ref={arquivoRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void trocarLogo(arquivo);
          e.target.value = '';
        }}
      />

      <div className="marca">
        <div className="marca-previa">
          {clinica.logo_url ? (
            <img src={clinica.logo_url} alt={`Logo da ${clinica.nome}`} />
          ) : (
            <span>{iniciais(clinica.nome)}</span>
          )}
        </div>

        <div className="marca-acoes">
          <b>{clinica.logo_url ? 'Logo atual' : 'Sem logo'}</b>
          <span>
            PNG, JPG, WEBP ou SVG, até 2 MB. Prefira imagem quadrada com fundo transparente — ela
            é exibida em um quadro pequeno e arredondado.
          </span>
          <div>
            <button
              className="secondary-btn"
              onClick={() => arquivoRef.current?.click()}
              disabled={!ehGestor || enviando || ocupado}
            >
              {enviando ? <Loader2 size={14} className="girando" /> : <ImagePlus size={14} />}
              {clinica.logo_url ? 'Trocar logo' : 'Enviar logo'}
            </button>
            {clinica.logo_url && (
              <button
                className="secondary-btn perigo"
                onClick={removerLogo}
                disabled={!ehGestor || ocupado}
              >
                <Trash2 size={14} /> Remover
              </button>
            )}
          </div>
          {!ehGestor && <small>Somente gestores podem alterar a identidade.</small>}
        </div>
      </div>

      <div className="modal-grade marca-nomes">
        <Campo rotulo="Nome da clínica">
          <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!ehGestor} />
        </Campo>
        <Campo rotulo="Nome no painel" dica="Deixe em branco para usar o nome completo.">
          <input
            value={exibicao}
            onChange={(e) => setExibicao(e.target.value)}
            placeholder={clinica.nome}
            disabled={!ehGestor}
          />
        </Campo>
      </div>

      {alterado && ehGestor && (
        <div className="marca-salvar">
          <button className="primary-btn" onClick={salvarNomes} disabled={ocupado || !nome.trim()}>
            <Building2 size={15} /> Salvar
          </button>
        </div>
      )}
    </article>
  );
}
