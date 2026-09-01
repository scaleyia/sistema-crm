'use client';

import { useState } from 'react';
import { Building2, Loader2, LogIn, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { mensagemDeErro } from '@/lib/dados/consulta';
import { useSessao } from '@/lib/dados/sessao';

/** Moldura das telas de fora do painel (login e onboarding). */
function Portal({ children }: { children: React.ReactNode }) {
  return (
    <main className="portal">
      <div className="portal-marca">
        <span className="brand-mark" role="img" aria-label="Impéria Esthétique" />
        <span className="brand-name">
          <b>IMPÉRIA</b>
          <small>ESTHÉTIQUE</small>
        </span>
        <p className="brand-tagline">Sua essência, nossa excelência.</p>
      </div>
      <div className="portal-cartao">{children}</div>
    </main>
  );
}

export function Entrar() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarEmail, setConfirmarEmail] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.SyntheticEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) {
          // A mensagem crua do GoTrue é técnica demais para a recepção da clínica.
          setErro(
            error.message === 'Invalid login credentials'
              ? 'E-mail ou senha incorretos.'
              : mensagemDeErro(error),
          );
        }
        // Em caso de sucesso, o onAuthStateChange assume daqui.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome_completo: nome.trim() } },
        });
        if (error) {
          setErro(
            error.message.includes('already registered')
              ? 'Este e-mail já tem cadastro. Faça login.'
              : mensagemDeErro(error),
          );
        } else if (!data.session) {
          // Projeto com confirmação de e-mail ligada: não há sessão ainda.
          setConfirmarEmail(true);
        }
      }
    } finally {
      setEnviando(false);
    }
  }

  if (confirmarEmail) {
    return (
      <Portal>
        <div className="portal-confirmacao">
          <MailCheck size={28} />
          <h1>Confirme seu e-mail</h1>
          <p>
            Enviamos um link de confirmação para <b>{email}</b>. Abra o link e depois volte para
            entrar.
          </p>
          <button
            className="secondary-btn"
            onClick={() => {
              setConfirmarEmail(false);
              setModo('entrar');
            }}
          >
            Voltar para o login
          </button>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <h1>{modo === 'entrar' ? 'Bem-vinda de volta' : 'Criar sua conta'}</h1>
      <p className="portal-sub">
        {modo === 'entrar'
          ? 'Entre para acompanhar sua clínica.'
          : 'Em um minuto sua clínica está no ar.'}
      </p>

      <form onSubmit={enviar} className="portal-form">
        {modo === 'criar' && (
          <label className="campo">
            Seu nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Gabriela Santos"
              autoComplete="name"
              required
            />
          </label>
        )}

        <label className="campo">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@clinica.com.br"
            autoComplete="email"
            required
          />
        </label>

        <label className="campo">
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Mínimo de 6 caracteres"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>

        {erro && (
          <p className="portal-erro" role="alert">
            {erro}
          </p>
        )}

        <button className="primary-btn portal-envio" disabled={enviando}>
          {enviando ? <Loader2 size={16} className="girando" /> : <LogIn size={16} />}
          {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>

      <button
        className="link-btn portal-alternar"
        onClick={() => {
          setModo(modo === 'entrar' ? 'criar' : 'entrar');
          setErro(null);
        }}
      >
        {modo === 'entrar' ? 'Não tenho conta — criar agora' : 'Já tenho conta — entrar'}
      </button>
    </Portal>
  );
}

export function Onboarding() {
  const { recarregar, sair, perfil } = useSessao();
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(evento: React.SyntheticEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const { error } = await supabase.rpc('criar_clinica_do_usuario', {
      p_nome: nome.trim(),
      p_unidade: unidade.trim() || 'Unidade principal',
    });

    if (error) {
      setErro(mensagemDeErro(error));
      setEnviando(false);
      return;
    }

    // O banco já criou funil, configuração da IA e régua de follow-up.
    await recarregar();
  }

  return (
    <Portal>
      <div className="portal-icone">
        <Building2 size={22} />
      </div>
      <h1>Vamos abrir sua clínica</h1>
      <p className="portal-sub">
        Olá{perfil?.nome_completo ? `, ${perfil.nome_completo.split(' ')[0]}` : ''}! Só falta o nome
        que aparece no painel.
      </p>

      <form onSubmit={criar} className="portal-form">
        <label className="campo">
          Nome da clínica
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Impéria Esthétique"
            required
            autoFocus
          />
        </label>

        <label className="campo">
          Primeira unidade
          <input
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            placeholder="Unidade Jardins"
          />
          <small>Você pode cadastrar outras unidades depois.</small>
        </label>

        {erro && (
          <p className="portal-erro" role="alert">
            {erro}
          </p>
        )}

        <button className="primary-btn portal-envio" disabled={enviando}>
          {enviando && <Loader2 size={16} className="girando" />}
          Criar clínica
        </button>
      </form>

      <button className="link-btn portal-alternar" onClick={() => void sair()}>
        Sair da conta
      </button>
    </Portal>
  );
}
