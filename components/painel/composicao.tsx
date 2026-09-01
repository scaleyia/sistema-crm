'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FileText, Image as Icone, Loader2, Mic, Pause, Play, Plus, Send, Smile, Trash2,
} from 'lucide-react';
import { formatoDeGravacao } from '@/lib/dados/midia';
import { useAviso } from './base';
import { SeletorEmoji } from './seletor-emoji';

/**
 * Barra de composição da conversa, no formato do WhatsApp.
 *
 * Três estados: parada (anexo + texto + emoji + microfone), gravando (lixeira,
 * cronômetro com onda, pausa e envio) e enviando. O microfone vira botão de
 * enviar assim que existe texto — é o mesmo gesto que a pessoa já conhece.
 */

/** Quantas barrinhas a onda mostra. */
const BARRAS = 34;

export function Composicao({
  aoEnviarTexto,
  aoEnviarArquivo,
  ocupado,
  enviandoMidia,
}: {
  aoEnviarTexto: (texto: string) => Promise<void> | void;
  aoEnviarArquivo: (arquivo: Blob, nome: string) => Promise<void> | void;
  ocupado: boolean;
  enviandoMidia: boolean;
}) {
  const { alertar } = useAviso();

  const [texto, setTexto] = useState('');
  const [menuAnexo, setMenuAnexo] = useState(false);
  const [menuEmoji, setMenuEmoji] = useState(false);

  const [gravando, setGravando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [onda, setOnda] = useState<number[]>([]);

  const campoRef = useRef<HTMLTextAreaElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const midiaRef = useRef<HTMLInputElement>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const descartarRef = useRef(false);
  // O intervalo do medidor lê isto direto: um estado do React ficaria preso no
  // fechamento criado quando o medidor foi ligado.
  const pausadoRef = useRef(false);
  const audioRef = useRef<{ contexto: AudioContext; parar: () => void } | null>(null);

  /* ------------------------------------------------------------- texto */

  // A caixa cresce com o texto, como no WhatsApp, até um teto.
  useEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight, 132)}px`;
  }, [texto]);

  async function enviarTexto() {
    const conteudo = texto.trim();
    if (!conteudo) return;
    await aoEnviarTexto(conteudo);
    setTexto('');
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviarTexto();
    }
  }

  /* ---------------------------------------------------------- gravação */

  /**
   * Barras da onda a partir do volume captado, para dar sinal de vida.
   * Enquanto pausado o medidor para de alimentar barras — uma onda correndo
   * com a gravação parada diria o contrário do que está acontecendo.
   */
  function ligarMedidor(fluxo: MediaStream) {
    const contexto = new AudioContext();
    const origem = contexto.createMediaStreamSource(fluxo);
    const analisador = contexto.createAnalyser();
    analisador.fftSize = 512;
    origem.connect(analisador);

    const amostras = new Uint8Array(analisador.frequencyBinCount);
    const relogio = setInterval(() => {
      if (pausadoRef.current) return;
      analisador.getByteTimeDomainData(amostras);
      let pico = 0;
      for (const amostra of amostras) pico = Math.max(pico, Math.abs(amostra - 128));
      setOnda((atual) => [...atual, Math.min(1, pico / 70)].slice(-BARRAS));
    }, 110);

    audioRef.current = {
      contexto,
      parar: () => {
        clearInterval(relogio);
        void contexto.close();
      },
    };
  }

  async function comecarGravacao() {
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alertar('Permita o acesso ao microfone para gravar um áudio.');
      return;
    }

    const formato = formatoDeGravacao();
    const gravador = new MediaRecorder(fluxo, formato ? { mimeType: formato } : undefined);
    const pedacos: Blob[] = [];
    descartarRef.current = false;

    gravador.ondataavailable = (e) => e.data.size > 0 && pedacos.push(e.data);
    gravador.onstop = () => {
      fluxo.getTracks().forEach((faixa) => faixa.stop());
      audioRef.current?.parar();
      audioRef.current = null;
      setGravando(false);
      setPausado(false);
      pausadoRef.current = false;
      setOnda([]);

      if (descartarRef.current) return;
      const audio = new Blob(pedacos, { type: gravador.mimeType });
      // Menos de um segundo é quase sempre toque sem querer.
      if (audio.size > 1200) {
        void aoEnviarArquivo(audio, `audio.${gravador.mimeType.includes('ogg') ? 'ogg' : 'webm'}`);
      }
    };

    gravadorRef.current = gravador;
    pausadoRef.current = false;
    gravador.start();
    ligarMedidor(fluxo);
    setGravando(true);
    setSegundos(0);
  }

  function pausarOuSeguir() {
    const gravador = gravadorRef.current;
    if (!gravador) return;
    if (gravador.state === 'recording') {
      gravador.pause();
      pausadoRef.current = true;
      setPausado(true);
    } else if (gravador.state === 'paused') {
      gravador.resume();
      pausadoRef.current = false;
      setPausado(false);
    }
  }

  function descartar() {
    descartarRef.current = true;
    gravadorRef.current?.stop();
  }

  function concluir() {
    descartarRef.current = false;
    gravadorRef.current?.stop();
  }

  useEffect(() => {
    if (!gravando || pausado) return;
    const relogio = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(relogio);
  }, [gravando, pausado]);

  // Solta microfone e AudioContext se a conversa mudar no meio da gravação.
  useEffect(
    () => () => {
      descartarRef.current = true;
      gravadorRef.current?.stop();
      audioRef.current?.parar();
    },
    [],
  );

  const relogio = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;

  /* ------------------------------------------------------------ desenho */

  if (gravando) {
    return (
      <div className="composicao gravacao">
        <button className="redondo" onClick={descartar} aria-label="Descartar áudio" title="Descartar">
          <Trash2 size={18} />
        </button>

        <div className="pilula-gravacao">
          <i className={pausado ? 'ponto pausado' : 'ponto'} />
          <span className="relogio">{relogio}</span>
          <div className="onda" aria-hidden="true">
            {Array.from({ length: BARRAS }, (_, i) => {
              const nivel = onda[onda.length - BARRAS + i] ?? 0;
              return <b key={i} style={{ height: `${8 + nivel * 76}%` }} />;
            })}
          </div>
        </div>

        <button
          className="redondo"
          onClick={pausarOuSeguir}
          aria-label={pausado ? 'Continuar gravação' : 'Pausar gravação'}
        >
          {pausado ? <Play size={17} /> : <Pause size={17} />}
        </button>

        <button className="redondo enviar" onClick={concluir} aria-label="Enviar áudio">
          <Send size={17} />
        </button>
      </div>
    );
  }

  const temTexto = texto.trim().length > 0;

  return (
    <div className="composicao">
      <input
        ref={arquivoRef}
        type="file"
        hidden
        accept="application/pdf,.doc,.docx,.xls,.xlsx,.txt"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void aoEnviarArquivo(arquivo, arquivo.name);
          e.target.value = '';
        }}
      />
      <input
        ref={midiaRef}
        type="file"
        hidden
        accept="image/*,video/mp4"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void aoEnviarArquivo(arquivo, arquivo.name);
          e.target.value = '';
        }}
      />

      <div className="ancora-anexo">
        <button
          className={`redondo ${menuAnexo ? 'aberto' : ''}`}
          onClick={() => {
            setMenuAnexo((v) => !v);
            setMenuEmoji(false);
          }}
          disabled={ocupado || enviandoMidia}
          aria-label="Anexar"
          aria-expanded={menuAnexo}
        >
          {enviandoMidia ? <Loader2 size={19} className="girando" /> : <Plus size={19} />}
        </button>

        {menuAnexo && (
          <>
            <div className="cortina" onClick={() => setMenuAnexo(false)} role="presentation" />
            <div className="menu-anexo">
              <button
                onClick={() => {
                  setMenuAnexo(false);
                  midiaRef.current?.click();
                }}
              >
                <i className="anexo-icone azul">
                  <Icone size={20} />
                </i>
                <span>Fotos e vídeos</span>
              </button>
              <button
                onClick={() => {
                  setMenuAnexo(false);
                  arquivoRef.current?.click();
                }}
              >
                <i className="anexo-icone roxo">
                  <FileText size={20} />
                </i>
                <span>Documento</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="pilula">
        <textarea
          ref={campoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          placeholder="Mensagem"
          rows={1}
        />

        <div className="ancora-emoji">
          <button
            className="emoji"
            onClick={() => {
              setMenuEmoji((v) => !v);
              setMenuAnexo(false);
            }}
            aria-label="Emojis"
            aria-expanded={menuEmoji}
          >
            <Smile size={19} />
          </button>

          {menuEmoji && (
            <>
              <div className="cortina" onClick={() => setMenuEmoji(false)} role="presentation" />
              <div className="menu-emoji">
                <SeletorEmoji
                  aoEscolher={(emoji) => {
                    setTexto((atual) => atual + emoji);
                    campoRef.current?.focus();
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {temTexto ? (
        <button
          className="redondo enviar"
          onClick={() => void enviarTexto()}
          disabled={ocupado}
          aria-label="Enviar mensagem"
        >
          <Send size={18} />
        </button>
      ) : (
        <button
          className="redondo"
          onClick={comecarGravacao}
          disabled={ocupado || enviandoMidia}
          aria-label="Gravar áudio"
          title="Gravar um áudio"
        >
          <Mic size={19} />
        </button>
      )}
    </div>
  );
}
