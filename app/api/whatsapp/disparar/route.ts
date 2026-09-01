import {
  anonimo,
  erro,
  exigirUsuario,
  falha,
  normalizarTelefone,
  segredo,
} from '@/lib/servidor/banco';
import { checarNumeros, criarDisparo } from '@/lib/servidor/uazapi';

/**
 * Dispara uma campanha de reativação.
 *
 * O público sai do filtro salvo na campanha; a UazApi cuida da fila e do
 * intervalo entre envios, que é o que protege o número do bloqueio. Cada
 * destinatário vira uma linha em `envios_campanha`, e é dela que o funil da
 * tela de Reativação se alimenta.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { campanhaId } = (await req.json()) as { campanhaId?: string };
    if (!campanhaId) return erro('Informe a campanha.');

    // RLS: a campanha só existe para quem é da clínica.
    const { data: campanha } = await autorizacao.cliente
      .from('campanhas')
      .select('id, clinica_id, nome, modelo_mensagem, status, envios_por_hora')
      .eq('id', campanhaId)
      .maybeSingle();

    if (!campanha) return erro('Campanha não encontrada.', 404);
    if (!campanha.modelo_mensagem?.trim()) {
      return erro('Escreva a mensagem da campanha antes de disparar.');
    }

    const { data: numeroChip } = await autorizacao.cliente
      .from('numeros_whatsapp')
      .select('id')
      .eq('clinica_id', campanha.clinica_id)
      .eq('ativo', true)
      .eq('status', 'conectado')
      .order('peso_rotacao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!numeroChip) {
      return erro(
        'Nenhum número conectado. Conecte um em Minha clínica › Números de WhatsApp.',
        409,
      );
    }

    // Público: quem aceita marketing e ainda não recebeu esta campanha.
    const { data: jaEnviados } = await autorizacao.cliente
      .from('envios_campanha')
      .select('paciente_id')
      .eq('campanha_id', campanha.id);

    const excluir = new Set((jaEnviados ?? []).map((e) => e.paciente_id));

    const { data: publico } = await autorizacao.cliente
      .from('pacientes')
      .select('id, nome_completo, telefone')
      .eq('clinica_id', campanha.clinica_id)
      .eq('aceita_marketing', true)
      .is('excluido_em', null)
      .limit(1000);

    const destinatarios = (publico ?? []).filter((p) => !excluir.has(p.id));
    if (destinatarios.length === 0) {
      return erro('Nenhum contato novo para esta campanha.', 409);
    }

    const chave = await segredo();
    const { data: credencial } = await anonimo().rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroChip.id,
    });

    const linha = credencial?.[0];
    if (!linha) return erro('O número conectado não tem instância vinculada.', 409);

    // Gastar disparo com quem não tem WhatsApp só queima reputação do número.
    const telefones = destinatarios.map((p) => normalizarTelefone(p.telefone));
    const conferidos = await checarNumeros(linha.token, telefones);
    const validos = new Set(
      conferidos.filter((c) => c.isInWhatsapp).map((c) => c.query.replace(/\D/g, '')),
    );

    const alvos = destinatarios.filter((p) => validos.has(normalizarTelefone(p.telefone)));
    if (alvos.length === 0) {
      return erro('Nenhum dos contatos tem WhatsApp ativo.', 409);
    }

    // Intervalo derivado do ritmo escolhido na campanha, com folga aleatória.
    const porHora = Math.max(1, campanha.envios_por_hora ?? 60);
    const medioSegundos = Math.max(3, Math.round(3600 / porHora));

    const disparo = await criarDisparo(linha.token, {
      numeros: alvos.map((p) => normalizarTelefone(p.telefone)),
      texto: campanha.modelo_mensagem,
      pasta: `${campanha.nome} (${campanha.id.slice(0, 8)})`,
      atrasoMin: Math.round(medioSegundos * 0.7),
      atrasoMax: Math.round(medioSegundos * 1.4),
    });

    // Cada destinatário vira uma linha do funil da campanha.
    const { error: erroEnvios } = await autorizacao.cliente.from('envios_campanha').insert(
      alvos.map((p) => ({
        clinica_id: campanha.clinica_id,
        campanha_id: campanha.id,
        paciente_id: p.id,
        numero_whatsapp_id: numeroChip.id,
        status: 'pendente' as const,
        mensagem_enviada: campanha.modelo_mensagem,
        agendado_para: new Date().toISOString(),
      })),
    );
    if (erroEnvios) return erro(erroEnvios.message, 500);

    // A pasta é a chave para reconciliar depois quem de fato recebeu.
    await autorizacao.cliente
      .from('campanhas')
      .update({ status: 'em_andamento', pasta_externa: disparo.folder_id ?? null })
      .eq('id', campanha.id);

    return Response.json({
      ok: true,
      enviados: alvos.length,
      ignorados: destinatarios.length - alvos.length,
      pasta: disparo.folder_id ?? null,
    });
  } catch (e) {
    return falha(e);
  }
}
