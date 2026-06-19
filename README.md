# Disparador Fradema

MVP do módulo "Campanhas por WhatsApp": disparo de campanhas em massa via Meta Cloud API (WhatsApp oficial), com acompanhamento de estatísticas de entrega/leitura em tempo quase real.

Frontend estático publicado em [marketingfda.github.io/DisparadorOficialFDA](https://marketingfda.github.io/DisparadorOficialFDA), consumindo uma API backend hospedada no Railway.

## Estrutura

- `docs/` — frontend HTML/CSS/JS estático (sem build step), publicado via GitHub Pages (path `/docs` é um dos dois únicos suportados pelo Pages sem precisar de GitHub Actions).
- `backend/` — NestJS + Prisma + Postgres, deploy via Railway.

## Rodando o backend localmente

```bash
cd backend
npm install
cp .env.example .env   # preencher com as credenciais da Meta (ver META_SETUP.md)
npx prisma db push
npm run start:dev
```

API sobe em `http://localhost:3001`.

## Variáveis de ambiente (backend)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string do Postgres |
| `META_ACCESS_TOKEN` | Token de System User da Meta (permissão `whatsapp_business_messaging`) |
| `META_APP_SECRET` | App Secret do Meta Developer App, usado para validar assinatura do webhook |
| `META_WEBHOOK_VERIFY_TOKEN` | String própria, configurada também no painel da Meta |
| `META_API_VERSION` | Versão da Graph API (ex: `v20.0`) |
| `CORS_ORIGIN` | Origem permitida no CORS (ex: `https://marketingfda.github.io`) |
| `PORT` | Porta do servidor (default `3001`) |

## Rodando o frontend localmente

`docs/` é estático — basta abrir `index.html` num servidor local (ex: `npx serve docs`) e ajustar `API_BASE_URL` em `docs/assets/js/api.js` para `http://localhost:3001`.

## Configuração da Meta (WhatsApp Cloud API)

Ver checklist completo em [`META_SETUP.md`](./META_SETUP.md).

## Escopo do MVP

Esta primeira versão cobre **somente o módulo de Campanhas** (criação, disparo, estatísticas, importação de destinatários, templates, exportação). Atendimento/inbox, base de clientes completa e configurações de empresa ficam para versões futuras.
