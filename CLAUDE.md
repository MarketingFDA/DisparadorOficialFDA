# Disparador Fradema — notas do projeto

- Frontend (`docs/`) é estático, sem build step, publicado via GitHub Pages na pasta `/docs` da branch `main` (GitHub Pages "Deploy from branch" só aceita `/` ou `/docs` como path — por isso o nome da pasta, não por ser documentação). Não introduzir framework/bundler aqui sem necessidade real.
- Backend (`backend/`) segue a mesma stack do repo `MarketingFDA/publisher` (NestJS + Prisma + Dockerfile). Deploy real é no **Render** (`render.yaml` na raiz, Blueprint) — a ideia original era Railway (como o `publisher`), mas a conta Railway em uso bateu o limite de provisionamento do plano gratuito (não cria projeto, serviço, nem banco novo). `railway.json`/`nixpacks.toml` ficaram no repo para o dia em que isso for resolvido.
- A integração de WhatsApp é a **Meta Cloud API oficial** (Graph API). Não confundir com a Evolution API (Baileys, não-oficial) usada em outro projeto local da Fradema — são integrações diferentes, não compartilham código.
- Nunca expor `META_ACCESS_TOKEN` ou `META_APP_SECRET` no frontend — esses valores só existem como env var no backend/Railway.
- Escopo atual: só o módulo de Campanhas. Atendimento/inbox, base de clientes completa e "Minha Empresa" são fases futuras, fora deste MVP.
