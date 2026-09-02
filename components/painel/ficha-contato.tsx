'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { ROTULO_ORIGEM, telefoneVisivel, tempoRelativo } from '@/lib/dados/formato';
import { useAcao } from './base';
import { Avatar } from './avatar';

/**
 * Ficha do contato ao lado da conversa.
 *
 * Tudo é editável: quem atende descobre o nome verdadeiro, o interesse e o
 * e-mail no meio da conversa, e precisa registrar isso sem sair da tela. O
 * WhatsApp só entrega um nome de perfil, que muitas vezes é apelido.
 */

const SITUACOES: Array<[string, string]> = [
  ['lead', 'Lead'],
  ['paciente', 'Paciente'],
  ['inativo', 'Inativo'],
  ['arquivado', 'Arquivado'],
];

export type Contato = {
  paciente_id: string;
  nome_completo: string | null;
  telefone: string | null;
  email: string | null;
  foto_url: string | null;
  origem: string | null;
  situacao: string;
  interesse_principal: string | null;
  observacoes: string | null;
  etiquetas: string[] | null;
  etapa_funil: string | null;
  ultima_mensagem_em: string | null;
  ia_ativa: boolean;
  atendente: string | null;
};

export function FichaContato({
  contato,
  aoFechar,
  aoSalvar,
}: {
  contato: Contato;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { executar, ocupado } = useAcao();
  const [editando, setEditando] = useState(false);
  const [novaEtiqueta, setNovaEtiqueta] = useState('');

  const [campos, setCampos] = useState({
    nome_completo: contato.nome_completo ?? '',
    email: contato.email ?? '',
    origem: contato.origem ?? 'whatsapp',
    situacao: contato.situacao,
    interesse_principal: contato.interesse_principal ?? '',
    observacoes: contato.observacoes ?? '',
  });

  // Trocar de conversa precisa recarregar a ficha e sair do modo de edição.
  useEffect(() => {
    setEditando(false);
    setCampos({
      nome_completo: contato.nome_completo ?? '',
      email: contato.email ?? '',
      origem: contato.origem ?? 'whatsapp',
      situacao: contato.situacao,
      interesse_principal: contato.interesse_principal ?? '',
      observacoes: contato.observacoes ?? '',
    });
  }, [contato.paciente_id]);

  const etiquetas = contato.etiquetas ?? [];

  async function salvar() {
    await executar(
      () =>
        supabase
          .from('pacientes')
          .update({
            nome_completo: campos.nome_completo.trim() || (contato.telefone ?? ''),
            email: campos.email.trim() || null,
            origem: campos.origem as never,
            situacao: campos.situacao as never,
            interesse_principal: campos.interesse_principal.trim() || null,
            observacoes: campos.observacoes.trim() || null,
          })
          .eq('id', contato.paciente_id),
      'Contato atualizado',
      () => {
        setEditando(false);
        aoSalvar();
      },
    );
  }

  async function guardarEtiquetas(lista: string[]) {
    await executar(
      () => supabase.from('pacientes').update({ etiquetas: lista }).eq('id', contato.paciente_id),
      'Etiquetas atualizadas',
      aoSalvar,
    );
  }

  function adicionar() {
    const nova = novaEtiqueta.trim();
    if (!nova || etiquetas.includes(nova)) {
      setNovaEtiqueta('');
      return;
    }
    setNovaEtiqueta('');
    void guardarEtiquetas([...etiquetas, nova]);
  }

  return (
    <aside className="contact-info">
      <header>
        <h3>Informações do contato</h3>
        <div className="ficha-acoes">
          {!editando && (
            <button className="botao-icone" onClick={() => setEditando(true)} aria-label="Editar">
              <Pencil size={14} />
            </button>
          )}
          <button className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="contato-topo">
        <Avatar nome={contato.nome_completo} foto={contato.foto_url} className="big-avatar" />
        {editando ? (
          <input
            className="ficha-nome"
            value={campos.nome_completo}
            onChange={(e) => setCampos((c) => ({ ...c, nome_completo: e.target.value }))}
            placeholder="Nome do contato"
          />
        ) : (
          <b>{contato.nome_completo ?? 'Sem nome'}</b>
        )}
        <span>{telefoneVisivel(contato.telefone)}</span>
      </div>

      <section>
        <h4>Etiquetas</h4>
        <div className="etiquetas">
          {etiquetas.map((etiqueta) => (
            <span className="etiqueta" key={etiqueta}>
              {etiqueta}
              <button
                onClick={() => guardarEtiquetas(etiquetas.filter((e) => e !== etiqueta))}
                disabled={ocupado}
                aria-label={`Remover ${etiqueta}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="etiqueta-nova">
          <input
            value={novaEtiqueta}
            onChange={(e) => setNovaEtiqueta(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            placeholder="Nova etiqueta"
          />
          <button onClick={adicionar} disabled={ocupado || !novaEtiqueta.trim()} aria-label="Adicionar">
            <Plus size={14} />
          </button>
        </div>
      </section>

      {editando ? (
        <>
          <section className="ficha-campos">
            <label>
              Situação
              <select
                value={campos.situacao}
                onChange={(e) => setCampos((c) => ({ ...c, situacao: e.target.value }))}
              >
                {SITUACOES.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Origem
              <select
                value={campos.origem}
                onChange={(e) => setCampos((c) => ({ ...c, origem: e.target.value }))}
              >
                {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Interesse
              <input
                value={campos.interesse_principal}
                onChange={(e) => setCampos((c) => ({ ...c, interesse_principal: e.target.value }))}
                placeholder="Harmonização facial"
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={campos.email}
                onChange={(e) => setCampos((c) => ({ ...c, email: e.target.value }))}
              />
            </label>
            <label>
              Observações
              <textarea
                value={campos.observacoes}
                onChange={(e) => setCampos((c) => ({ ...c, observacoes: e.target.value }))}
                rows={3}
                placeholder="O que a equipe precisa lembrar deste contato"
              />
            </label>
          </section>

          <div className="ficha-rodape">
            <button className="secondary-btn" onClick={() => setEditando(false)}>
              Cancelar
            </button>
            <button className="primary-btn" onClick={salvar} disabled={ocupado}>
              <Check size={14} /> Salvar
            </button>
          </div>
        </>
      ) : (
        <>
          <section>
            <h4>Situação</h4>
            <p>
              <em className={`situacao situacao-${contato.situacao}`}>
                {SITUACOES.find(([v]) => v === contato.situacao)?.[1] ?? contato.situacao}
              </em>
            </p>
          </section>
          <section>
            <h4>Origem</h4>
            <p>{ROTULO_ORIGEM[contato.origem ?? ''] ?? 'Não informada'}</p>
          </section>
          <section>
            <h4>Interesse</h4>
            <p>{contato.interesse_principal ?? 'Não informado'}</p>
          </section>
          <section>
            <h4>E-mail</h4>
            <p>{contato.email ?? 'Não informado'}</p>
          </section>
          {contato.etapa_funil && (
            <section>
              <h4>Etapa do funil</h4>
              <p>{contato.etapa_funil}</p>
            </section>
          )}
          <section>
            <h4>Observações</h4>
            <p>{contato.observacoes ?? 'Nada anotado.'}</p>
          </section>
          <section>
            <h4>Atendimento</h4>
            <p>
              {contato.ia_ativa
                ? 'A IA está respondendo automaticamente.'
                : `Assumida por ${contato.atendente ?? 'um atendente'}.`}
            </p>
            <p className="ficha-secundario">
              Última mensagem {tempoRelativo(contato.ultima_mensagem_em)}
            </p>
          </section>
        </>
      )}
    </aside>
  );
}
