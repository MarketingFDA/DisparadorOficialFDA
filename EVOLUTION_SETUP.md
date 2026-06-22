# Checklist — Configuração do canal "WhatsApp Normal" (Evolution API)

Esse canal usa a **Evolution API** (automação não-oficial sobre o WhatsApp Web/Baileys) para disparar mensagens de números comuns, sem precisar de template aprovado pela Meta. É o canal "WhatsApp Normal" nas telas de Números e Nova campanha.

## Leia antes de usar

- Esse canal **não é o WhatsApp Business Platform oficial**. O WhatsApp pode banir o número a qualquer momento se detectar padrão de disparo em massa — o delay de 10s entre mensagens (configurado em `backend/src/whatsapp/dispatch-queue.service.ts`) reduz o risco, mas **não elimina**.
- Use só com contatos que já têm relacionamento com a Fradema (clientes, leads que pediram contato). Não é recomendado para listas frias.
- Se o número cadastrado for usado por alguém no dia a dia (WhatsApp Web aberto, app no celular), evite rodar disparos simultâneos — pode gerar conflito de sessão.

## 1. Ter uma instância da Evolution API rodando e conectada

Se você já tem a Evolution API rodando local (Docker, `~/evolution-api`, painel em `http://localhost:8080/manager`):

1. Acesse o manager e crie uma instância (`POST /instance/create` ou pela UI).
2. Escaneie o QR Code com o número de WhatsApp normal que vai disparar as mensagens.
3. Anote o **nome da instância** — é o que você vai cadastrar na tela "Números" do Disparador.

## 2. Expor a instância publicamente

O backend do Disparador roda na nuvem (Render), não na sua máquina — ele **não enxerga** `http://localhost:8080`. Para o canal funcionar em produção, a Evolution API precisa estar acessível por uma URL pública HTTPS. Opções, da mais simples à mais robusta:

- **Cloudflare Tunnel** (grátis, sem alterar o docker-compose): `cloudflared tunnel --url http://localhost:8080` gera uma URL pública temporária. Para algo permanente, crie um Named Tunnel vinculado a um domínio.
- **Deploy da própria Evolution API na nuvem** (Render, Railway, VPS) ao invés de local — mais estável, mas exige manter outro serviço no ar.
- Qualquer outro proxy reverso com HTTPS (Nginx + domínio próprio, ngrok pago para URL fixa, etc).

Sem isso, campanhas no canal "WhatsApp Normal" vão falhar com erro de conexão ao tentar disparar a partir do backend hospedado.

## 3. Configurar variáveis de ambiente no backend

No Render, vá em **Environment** do serviço `disparador-fradema-backend` e preencha:

| Variável | Descrição |
|---|---|
| `EVOLUTION_API_URL` | URL pública da sua Evolution API (ex: `https://seu-tunnel.trycloudflare.com`) |
| `EVOLUTION_API_KEY` | Valor de `AUTHENTICATION_API_KEY` do `.env` da Evolution API |

Rodando local, coloque as mesmas variáveis no `backend/.env`.

## 4. Cadastrar o número no Disparador

Na tela **Números**, clique em "Novo número", escolha o canal **WhatsApp Normal** e informe:

- Label (nome interno, ex: "Fradema RJ - Comercial")
- Nome da instância (o mesmo do passo 1)

Pronto — esse número já aparece como opção ao criar uma campanha no canal "WhatsApp Normal".

## Limitações conhecidas dessa primeira versão

- Não há rastreamento automático de entrega/leitura para esse canal (webhooks da Evolution API não estão conectados ainda) — as mensagens ficam marcadas como "Enviado" ou "Erro", sem `DELIVERED`/`READ`.
- Não há suporte a mídia (imagem/documento), só texto.
