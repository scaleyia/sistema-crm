'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useClinica } from '@/lib/dados/sessao';
import { ROTULO_ORIGEM, telefoneDigitos, telefoneVisivel } from '@/lib/dados/formato';
import {
  adivinharMapeamento,
  lerCsv,
  refinarPeloConteudo,
  SEM_COLUNA,
  type Mapeamento,
  type Tabela,
} from '@/lib/dados/importar';
import { Campo, Modal, useAviso } from './base';

/**
 * Importação de base de contatos.
 *
 * Três etapas: escolher o arquivo, conferir de que coluna vem cada campo e
 * confirmar. O mapeamento é chutado pelo cabeçalho (e pelo conteúdo, quando o
 * cabeçalho não ajuda), mas quem decide é a pessoa — cada exportador nomeia as
 * colunas do seu jeito.
 */

const LOTE = 200;

type Preparado = {
  nome: string;
  telefone: string;
  email: string | null;
  interesse: string | null;
};

export function ImportarContatos({
  aberto,
  aoFechar,
  aoImportar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoImportar: () => void;
}) {
  const { clinicaId, unidadeId } = useClinica();
  const { avisar, alertar } = useAviso();

  const [tabela, setTabela] = useState<Tabela | null>(null);
  const [mapa, setMapa] = useState<Mapeamento | null>(null);
  const [origem, setOrigem] = useState('outro');
  const [autorizados, setAutorizados] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const arquivoRef = useRef<HTMLInputElement>(null);

  function escolher(arquivo: File) {
    const leitor = new FileReader();
    leitor.onload = () => {
      const lida = lerCsv(String(leitor.result ?? ''));
      if (lida.linhas.length === 0) {
        alertar('O arquivo não tem linhas de dados.');
        return;
      }
      setTabela(lida);
      setMapa(refinarPeloConteudo(lida, adivinharMapeamento(lida.cabecalhos)));
    };
    leitor.onerror = () => alertar('Não foi possível ler o arquivo.');
    leitor.readAsText(arquivo, 'utf-8');
  }

  /** Linhas prontas, já sem telefone inválido e sem repetição dentro do arquivo. */
  const preparados = useMemo<Preparado[] | null>(() => {
    if (!tabela || !mapa || mapa.telefone === SEM_COLUNA) return null;

    const vistos = new Set<string>();
    const lista: Preparado[] = [];

    for (const linha of tabela.linhas) {
      const telefone = telefoneDigitos(linha[mapa.telefone] ?? '');
      if (telefone.length < 12 || vistos.has(telefone)) continue;
      vistos.add(telefone);

      const nome = [
        mapa.nome === SEM_COLUNA ? '' : (linha[mapa.nome] ?? ''),
        mapa.sobrenome === SEM_COLUNA ? '' : (linha[mapa.sobrenome] ?? ''),
      ]
        .join(' ')
        .trim();

      lista.push({
        // Sem nome no arquivo, o telefone serve de identificação até alguém
        // responder — melhor do que descartar o contato.
        nome: nome || telefoneVisivel(telefone),
        telefone,
        email: mapa.email === SEM_COLUNA ? null : (linha[mapa.email] || null),
        interesse: mapa.interesse === SEM_COLUNA ? null : (linha[mapa.interesse] || null),
      });
    }

    return lista;
  }, [tabela, mapa]);

  const descartados = tabela && preparados ? tabela.linhas.length - preparados.length : 0;

  async function importar() {
    if (!preparados?.length) return;
    setImportando(true);
    setProgresso(0);

    try {
      // Quem já está cadastrado não entra de novo: o telefone é a chave.
      const { data: existentes } = await supabase
        .from('pacientes')
        .select('telefone')
        .eq('clinica_id', clinicaId)
        .is('excluido_em', null);

      const jaTem = new Set((existentes ?? []).map((p) => p.telefone));
      const novos = preparados.filter((p) => !jaTem.has(p.telefone));

      if (novos.length === 0) {
        avisar('Todos os contatos do arquivo já estavam cadastrados.');
        aoFechar();
        return;
      }

      let gravados = 0;
      for (let i = 0; i < novos.length; i += LOTE) {
        const fatia = novos.slice(i, i + LOTE);
        const { error } = await supabase.from('pacientes').insert(
          fatia.map((p) => ({
            clinica_id: clinicaId,
            unidade_id: unidadeId,
            nome_completo: p.nome,
            telefone: p.telefone,
            email: p.email,
            interesse_principal: p.interesse,
            origem: origem as never,
            // Sem autorização declarada, o contato fica fora das campanhas.
            aceita_marketing: autorizados,
          })),
        );

        if (error) {
          alertar(`Importados ${gravados}. Erro no lote seguinte: ${error.message}`);
          break;
        }

        gravados += fatia.length;
        setProgresso(Math.round((gravados / novos.length) * 100));
      }

      if (gravados > 0) {
        const repetidos = preparados.length - novos.length;
        avisar(
          `${gravados} contato(s) importado(s)` +
            (repetidos ? ` • ${repetidos} já existiam` : ''),
        );
        aoImportar();
        limpar();
        aoFechar();
      }
    } finally {
      setImportando(false);
    }
  }

  function limpar() {
    setTabela(null);
    setMapa(null);
    setAutorizados(false);
    setProgresso(0);
  }

  function fechar() {
    limpar();
    aoFechar();
  }

  const colunas = tabela?.cabecalhos ?? [];

  function seletor(campo: keyof Mapeamento, rotulo: string, obrigatorio = false) {
    return (
      <Campo rotulo={rotulo}>
        <select
          value={mapa?.[campo] ?? SEM_COLUNA}
          onChange={(e) =>
            setMapa((atual) => (atual ? { ...atual, [campo]: Number(e.target.value) } : atual))
          }
        >
          {!obrigatorio && <option value={SEM_COLUNA}>— Não importar —</option>}
          {colunas.map((coluna, i) => (
            <option key={`${coluna}-${i}`} value={i}>
              {coluna || `Coluna ${i + 1}`}
            </option>
          ))}
        </select>
      </Campo>
    );
  }

  return (
    <Modal
      titulo="Importar contatos"
      descricao="Aceita CSV exportado de planilha, do Google Contatos ou da agenda do celular."
      aberto={aberto}
      aoFechar={fechar}
      aoConfirmar={tabela ? importar : undefined}
      rotuloConfirmar={preparados?.length ? `Importar ${preparados.length}` : 'Importar'}
      salvando={importando}
    >
      <input
        ref={arquivoRef}
        type="file"
        hidden
        accept=".csv,text/csv,text/plain"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) escolher(arquivo);
          e.target.value = '';
        }}
      />

      {!tabela ? (
        <button className="area-arquivo" onClick={() => arquivoRef.current?.click()}>
          <Upload size={22} />
          <b>Escolher arquivo CSV</b>
          <span>
            Precisa ter pelo menos uma coluna com telefone. As demais são opcionais.
          </span>
        </button>
      ) : (
        <>
          <p className="modal-nota">
            <CheckCircle2 size={14} /> {tabela.linhas.length} linha(s) no arquivo,{' '}
            {colunas.length} coluna(s).{' '}
            <button className="link-btn" onClick={() => arquivoRef.current?.click()}>
              Trocar arquivo
            </button>
          </p>

          <div className="modal-grade">
            {seletor('nome', 'Nome')}
            {seletor('sobrenome', 'Sobrenome')}
            {seletor('telefone', 'Telefone', true)}
            {seletor('email', 'E-mail')}
            {seletor('interesse', 'Interesse')}
            <Campo rotulo="Origem destes contatos">
              <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {preparados && (
            <div className="previa-importacao">
              <header>
                <span>PRÉVIA</span>
                <b>
                  {preparados.length} válido(s)
                  {descartados > 0 && ` • ${descartados} sem telefone ou repetido(s)`}
                </b>
              </header>
              {preparados.slice(0, 4).map((p) => (
                <div key={p.telefone}>
                  <b>{p.nome}</b>
                  <span>{telefoneVisivel(p.telefone)}</span>
                  <span>{p.email ?? '—'}</span>
                </div>
              ))}
              {preparados.length > 4 && <p>e mais {preparados.length - 4}...</p>}
            </div>
          )}

          <label className="consentimento">
            <input
              type="checkbox"
              checked={autorizados}
              onChange={(e) => setAutorizados(e.target.checked)}
            />
            <span>
              <b>Estes contatos autorizaram receber mensagens da clínica.</b>
              Sem marcar, eles entram na base mas ficam fora das campanhas de disparo.
            </span>
          </label>

          {!autorizados && (
            <p className="modal-nota alerta">
              <AlertTriangle size={14} /> Disparar para quem não autorizou é risco de bloqueio do
              número e de infração à LGPD.
            </p>
          )}

          {importando && (
            <div className="barra-progresso">
              <i style={{ width: `${progresso}%` }} />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
