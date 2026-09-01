# CliniIA — CRM e atendimento para clínicas

Painel de atendimento, agenda, CRM e campanhas de WhatsApp para clínicas de
estética. Atendimento automático por IA, disparo em massa com rotação de
números e relatórios de origem de receita.

## O que tem dentro

| Área | O que faz |
|---|---|
| **Conversas** | Caixa de entrada de WhatsApp em tempo real, com envio de texto, foto, áudio e documento |
| **Agenda** | Agendamentos, confirmação automática na véspera e lembretes |
| **Contatos** | Base de leads e pacientes, com importação e exportação em CSV |
| **CRM & Funil** | Kanban de oportunidades com histórico de movimentação |
| **Reativação / Campanhas** | Disparo em massa pela UazApi, com funil de resultado |
| **Relatórios** | Receita por mês, origem dos agendamentos e exportação |
| **Minha clínica** | Identidade, unidades, equipe, catálogo e números de WhatsApp |
| **Configurar IA** | Prompt editável por clínica, tom de voz e limites de negociação |

## Como funciona

- **Front:** React 19 + RSC sobre [vinext](https://www.npmjs.com/package/vinext) (Vite), sem framework de UI — CSS próprio.
- **Banco:** Postgres no Supabase, multi-tenant por clínica, com RLS em todas as tabelas.
- **WhatsApp:** [UazApi](https://uazapi.dev) — instância por número, webhook para receber.
- **IA:** OpenAI, chamada pelo servidor com o contexto vivo da clínica.

### Segurança

O projeto **não usa `service_role`**. As operações sem usuário logado (webhook,
tarefas de fundo) se autenticam com um segredo compartilhado exigido por funções
`SECURITY DEFINER` no Postgres. As tabelas `credenciais_whatsapp` e
`segredos_integracao` têm RLS ligado e nenhuma policy — são invisíveis à API.

Segredos de servidor ficam em `.dev.vars` (nunca em `.env.local`, cujo prefixo
`VITE_` embute o valor no bundle do navegador).

## Rodando localmente

```bash
npm install
cp .env.example .env.local     # URL e chave publicável do Supabase
cp .dev.vars.example .dev.vars # UazApi, OpenAI e o segredo da integração
npm run dev
```

O segredo da integração precisa ser registrado no banco:

```sql
select public.wa_definir_segredo('O_VALOR_QUE_ESTA_EM_.dev.vars');
```

## Tarefas de fundo

Lembretes, follow-ups e a reconciliação do funil de campanhas rodam por
`pg_cron`, chamando a própria aplicação. Depois de publicar, ligue o agendador:

```sql
select public.wa_ligar_agendador('https://SEU-DOMINIO/api/whatsapp/tarefas?k=CHAVE');
```

A `CHAVE` é `sha256(INTEGRACAO_SEGREDO + ':webhook')`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | oxlint |
| `npm run format` | oxfmt |
