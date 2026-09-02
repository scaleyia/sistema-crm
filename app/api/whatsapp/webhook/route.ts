import { anonimo, chaveWebhook, falha, segredo } from '@/lib/servidor/banco';
import { responderConversa } from '@/lib/servidor/assistente';

/**
 * Recebe os eventos da UazApi.
 *
 * Não há usuário logado aqui, então a autorização é dupla: a chave derivada na
 * URL (que a UazApi guarda) e, dentro do banco, o segredo exigido pelas funções
 * `wa_*`. A chave da URL não serve para chamar essas funções, então vazá-la em
 * log de proxy não dá acesso ao banco.
 */

type Mensagem = {
  id?: string;
  messageid?: string;
  chatid?: string;
  sender?: string;
  sender_pn?: string;
  senderName?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  messageType?: string;
  text?: string;
  content?: unknown;
  fileURL?: string;
  wasSentByApi?: boolean;
};

/**
 * Texto vindo de fora, sem confiar no tipo.
 *
 * `String(x)` num objeto produz "[object Object]", que passaria adiante como
 * se fosse um valor legítimo. Aqui só string e número viram texto; o resto
 * vira vazio e o chamador decide o que fazer.
 */
function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  return '';
}

/** Pega o primeiro campo preenchido entre as variações conhecidas do envelope. */
function primeiroTexto(...valores: unknown[]): string {
  for (const valor of valores) {
    const t = texto(valor).trim();
    if (t) return t;
  }
  return '';
}

/**
 * O formato do envelope varia entre versões; aceitamos as variações conhecidas.
 *
 * A ordem importa: o corpo real traz `instanceName` com o nome da instância e
 * `owner` com o número de telefone do aparelho. Consultar `owner` primeiro
 * fazia o telefone ser tratado como instância, e nenhuma credencial batia —
 * todo evento recebido era descartado com "instância não pertence a nenhuma
 * clínica". `owner` só entra como último recurso.
 */
function lerEnvelope(corpo: Record<string, unknown>) {
  const evento = primeiroTexto(corpo.event, corpo.EventType, corpo.type).toLowerCase();
  const instancia = primeiroTexto(
    corpo.instanceName,
    corpo.instance,
    corpo.instance_id,
    corpo.owner,
  );
  const dados = (corpo.data ?? corpo) as Record<string, unknown>;
  return { evento, instancia, dados };
}

function lerMensagem(dados: Record<string, unknown>): Mensagem | null {
  const bruta = (dados.message ?? dados.messages ?? dados) as Mensagem | Mensagem[];
  const alvo = Array.isArray(bruta) ? bruta[0] : bruta;
  if (!alvo || typeof alvo !== 'object') return null;
  return alvo.messageid || alvo.id || alvo.chatid ? alvo : null;
}

/** "5511998452031@s.whatsapp.net" → "5511998452031" */
function telefoneDoJid(jid: unknown): string {
  return texto(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Rótulo para mensagem sem texto.
 *
 * O banco exige conteúdo ou mídia. Uma foto pode chegar antes de a URL do
 * arquivo estar resolvida, e sem isso a mensagem seria recusada e sumiria da
 * conversa. O rótulo mantém o registro na thread — é o mesmo que o WhatsApp
 * mostra na prévia da lista.
 */
const ROTULO_SEM_TEXTO: Record<string, string> = {
  imagem: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  documento: 'Documento',
  figurinha: 'Figurinha',
  localizacao: 'Localização',
  contato: 'Contato',
  texto: 'Mensagem sem texto',
};

const TIPOS: Record<string, string> = {
  conversation: 'texto',
  extendedtextmessage: 'texto',
  text: 'texto',
  imagemessage: 'imagem',
  image: 'imagem',
  videomessage: 'video',
  video: 'video',
  audiomessage: 'audio',
  audio: 'audio',
  ptt: 'audio',
  pttmessage: 'audio',
  myaudio: 'audio',
  documentmessage: 'documento',
  document: 'documento',
  stickermessage: 'figurinha',
  sticker: 'figurinha',
  locationmessage: 'localizacao',
  contactmessage: 'contato',
};

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('k') !== (await chaveWebhook())) {
      // Sem detalhe: um webhook não deve ajudar quem está sondando.
      return new Response('não autorizado', { status: 401 });
    }

    const corpo = (await req.json()) as Record<string, unknown>;
    const { evento, instancia, dados } = lerEnvelope(corpo);

    if (!instancia) return Response.json({ ignorado: 'sem instância' });

    const chave = await segredo();
    const servidor = anonimo();

    if (evento.startsWith('connection')) {
      const conectado =
        dados.loggedIn === true || texto(dados.status).toLowerCase() === 'connected';
      await servidor.rpc('wa_atualizar_conexao', {
        p_segredo: chave,
        p_instancia: instancia,
        p_status: conectado ? 'conectado' : 'desconectado',
        p_numero: primeiroTexto(dados.owner) || null,
      });
      return Response.json({ ok: true, tratado: 'conexao' });
    }

    if (!evento.startsWith('message')) {
      return Response.json({ ignorado: evento || 'evento sem nome' });
    }

    const mensagem = lerMensagem(dados);
    if (!mensagem) return Response.json({ ignorado: 'payload sem mensagem' });

    // Grupos não são atendimento individual; ficam de fora do CRM.
    if (mensagem.isGroup) return Response.json({ ignorado: 'grupo' });

    const telefone =
      telefoneDoJid(mensagem.sender_pn) ||
      telefoneDoJid(mensagem.chatid) ||
      telefoneDoJid(mensagem.sender);

    if (!telefone) return Response.json({ ignorado: 'sem telefone' });

    // O corpo real usa "Conversation", "ImageMessage" etc., e às vezes traz o
    // formato em `type`/`mediaType`. Normalizamos os três.
    const tipo =
      TIPOS[texto(mensagem.messageType).toLowerCase()] ??
      TIPOS[texto((mensagem as { mediaType?: unknown }).mediaType).toLowerCase()] ??
      TIPOS[texto((mensagem as { type?: unknown }).type).toLowerCase()] ??
      'texto';
    const midia = primeiroTexto(mensagem.fileURL) || null;

    // Sem texto e sem mídia o banco recusaria a linha; o rótulo preserva o
    // registro em vez de deixar um buraco na conversa.
    const conteudo =
      primeiroTexto(mensagem.text, mensagem.content) ||
      (midia ? null : (ROTULO_SEM_TEXTO[tipo] ?? ROTULO_SEM_TEXTO.texto));

    const { data, error } = await servidor.rpc('wa_registrar_mensagem', {
      p_segredo: chave,
      p_instancia: instancia,
      p_telefone: telefone,
      p_nome: primeiroTexto(mensagem.senderName) || null,
      p_conteudo: conteudo,
      p_de_mim: Boolean(mensagem.fromMe),
      p_id_externo: primeiroTexto(mensagem.messageid, mensagem.id) || null,
      p_tipo: tipo as never,
      p_midia_url: midia,
      p_enviada_pela_api: Boolean(mensagem.wasSentByApi),
    });

    if (error) {
      console.error('[webhook] falha ao gravar:', error.message);
      // 200 de propósito: reenviar não resolveria um payload que não encaixa.
      return Response.json({ erro: error.message }, { status: 200 });
    }

    const gravada = data as unknown as {
      mensagem_id: string | null;
      conversa_id: string;
      duplicada: boolean;
    };

    // A assistente só entra em mensagem nova do paciente. Evento reentregue já
    // foi respondido; mensagem nossa não pede resposta.
    if (mensagem.fromMe || gravada.duplicada) {
      return Response.json({ ok: true, mensagemId: gravada.mensagem_id, respondeu: false });
    }

    const { data: credencial } = await servidor.rpc('wa_credencial_por_instancia', {
      p_segredo: chave,
      p_instancia: instancia,
    });

    const token = credencial?.[0]?.token;
    if (!token) {
      return Response.json({ ok: true, mensagemId: gravada.mensagem_id, respondeu: false });
    }

    let resposta;
    try {
      resposta = await responderConversa(gravada.conversa_id, token, telefone);
    } catch (e) {
      // A mensagem do paciente já está salva; falhar aqui não pode desfazer
      // isso nem pedir reentrega do evento.
      console.error('[assistente]', e instanceof Error ? e.message : e);
      return Response.json({ ok: true, mensagemId: gravada.mensagem_id, respondeu: false });
    }

    return Response.json({
      ok: true,
      mensagemId: gravada.mensagem_id,
      respondeu: resposta.respondeu,
      ...(resposta.respondeu ? {} : { motivo: resposta.motivo }),
    });
  } catch (e) {
    return falha(e);
  }
}

/** A UazApi valida a URL com um GET antes de salvar o webhook. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const autorizado = url.searchParams.get('k') === (await chaveWebhook());
  return new Response(autorizado ? 'ok' : 'não autorizado', { status: autorizado ? 200 : 401 });
}
