import { anonimo, erro, exigirUsuario, falha, numeroDoUsuario, segredo } from '@/lib/servidor/banco';
import { desconectarInstancia } from '@/lib/servidor/uazapi';

/** Desconecta o aparelho sem apagar a instância — dá para reparear depois. */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { numeroId } = (await req.json()) as { numeroId?: string };
    if (!numeroId) return erro('Informe qual número desconectar.');

    const numero = await numeroDoUsuario(autorizacao.cliente, numeroId);
    if (!numero) return erro('Número não encontrado nesta clínica.', 404);

    const chave = await segredo();
    const servidor = anonimo();
    const { data: credencial } = await servidor.rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroId,
    });

    const linha = credencial?.[0];
    if (!linha) return erro('Este número nunca foi conectado.', 404);

    await desconectarInstancia(linha.token);
    await servidor.rpc('wa_atualizar_conexao', {
      p_segredo: chave,
      p_instancia: linha.instancia,
      p_status: 'desconectado',
    });

    return Response.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}
