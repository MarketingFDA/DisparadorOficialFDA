# Disparador Fradema — notas do projeto

- Frontend (`frontend/`) é estático, sem build step, publicado via GitHub Pages na pasta `/frontend` da branch `main`. Não introduzir framework/bundler aqui sem necessidade real.
- Backend (`backend/`) segue o mesmo padrão do repo `MarketingFDA/publisher` (NestJS + Prisma + Dockerfile + railway.json + nixpacks.toml, deploy no Railway).
- A integração de WhatsApp é a **Meta Cloud API oficial** (Graph API). Não confundir com a Evolution API (Baileys, não-oficial) usada em outro projeto local da Fradema — são integrações diferentes, não compartilham código.
- Nunca expor `META_ACCESS_TOKEN` ou `META_APP_SECRET` no frontend — esses valores só existem como env var no backend/Railway.
- Escopo atual: só o módulo de Campanhas. Atendimento/inbox, base de clientes completa e "Minha Empresa" são fases futuras, fora deste MVP.
