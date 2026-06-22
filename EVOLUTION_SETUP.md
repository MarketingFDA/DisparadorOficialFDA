# Checklist — Configuração do canal "WhatsApp Normal" (Evolution API)

Esse canal usa a **Evolution API** (automação não-oficial sobre o WhatsApp Web/Baileys) para disparar mensagens de números comuns, sem precisar de template aprovado pela Meta. É o canal "WhatsApp Normal" nas telas de Números e Nova campanha.

## Leia antes de usar

- Esse canal **não é o WhatsApp Business Platform oficial**. O WhatsApp pode banir o número a qualquer momento se detectar padrão de disparo em massa — a pausa adaptativa entre mensagens (configurada em `backend/src/whatsapp/dispatch-queue.service.ts`) reduz o risco, mas **não elimina**.
- Use só com contatos que já têm relacionamento com a Fradema (clientes, leads que pediram contato). Não é recomendado para listas frias.
- Se o número cadastrado for usado por alguém no dia a dia (WhatsApp Web aberto, app no celular), evite rodar disparos simultâneos — pode gerar conflito de sessão.

## Status atual (22/06/2026): infraestrutura de túnel já configurada

O túnel público e as variáveis no Render **já foram configurados** nesta máquina. Não é preciso repetir os passos 2 e 3 abaixo a menos que algo pare de funcionar.

- Ferramenta usada: **ngrok** (não Cloudflare Tunnel — testamos e a rede aqui bloqueia a porta 7844 que o Cloudflare Tunnel exige; ngrok usa TLS real na porta 443 e passa).
- URL pública estável: `https://legwarmer-ascend-sprinkler.ngrok-free.dev` (conta free do ngrok, domínio ficou fixo entre reinícios — não é aleatório a cada restart).
- Processo rodando em background nesta máquina (`ngrok http 8080`) + LaunchAgent registrada em `~/Library/LaunchAgents/com.fradema.evolution-tunnel.plist` (label `com.fradema.evolution-tunnel`) para tentar subir sozinho em reinícios/login do Mac. **Não testamos um reboot real** — se o canal parar de responder depois de reiniciar o Mac, rode manualmente: `ngrok http 8080 --log=stdout` (log fica em `~/Library/Logs/ngrok.log`).
- `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` já estão setados no serviço `disparador-fradema-backend` no Render (configurado via API, não pelo painel) e o backend já foi redeployado com eles.
- Validado ponta a ponta: requisição HTTPS através do túnel chega na Evolution API local e retorna resposta da aplicação (não erro de rede).

**Risco conhecido:** conta free do ngrok permite só 1 sessão de túnel simultânea. Se alguém rodar `ngrok` de novo nessa mesma conta em outra máquina/processo, o túnel atual cai.

## 1. Ter uma instância da Evolution API rodando e conectada

Isso ainda **não foi feito** — é a única coisa que falta para o canal funcionar de verdade, e só dá pra fazer com o celular físico do número que vai disparar:

1. Acesse o manager em `http://localhost:8080/manager` (ou `POST /instance/create` direto na API) e crie uma instância.
2. Escaneie o QR Code com o número de WhatsApp normal que vai disparar as mensagens.
3. Anote o **nome da instância** — é o que você vai cadastrar na tela "Números" do Disparador.
4. Cadastre o número na tela **Números** do Disparador (canal "WhatsApp Normal" + nome da instância) — ver passo abaixo.

## 2. Expor a instância publicamente (referência — já feito, ver "Status atual")

Opções caso o túnel atual precise ser refeito do zero, da mais simples à mais robusta:

- **ngrok** (o que está em uso): `ngrok http 8080` — grátis, sem cartão, mas exige conta (authtoken em dashboard.ngrok.com) e tem limite de 1 sessão simultânea no free tier.
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8080` — grátis e sem limite de sessão, mas exige porta 7844 (TCP+UDP) liberada de saída; **não funcionou na rede em que isso foi configurado** por bloqueio de firewall.
- **Deploy da própria Evolution API na nuvem** (Render, Railway, VPS) ao invés de local — elimina a necessidade de túnel, mas exige manter outro serviço no ar e reconectar a instância (novo QR Code).

## 3. Variáveis de ambiente no backend (referência — já feito, ver "Status atual")

| Variável | Descrição |
|---|---|
| `EVOLUTION_API_URL` | URL pública da Evolution API |
| `EVOLUTION_API_KEY` | Valor de `AUTHENTICATION_API_KEY` do `.env` da Evolution API |

Configurado no Render em **Environment** do serviço `disparador-fradema-backend`. Rodando local, coloque as mesmas variáveis no `backend/.env`.

## 4. Cadastrar o número no Disparador

Na tela **Números**, clique em "Novo número", escolha o canal **WhatsApp Normal** e informe:

- Label (nome interno, ex: "Fradema RJ - Comercial")
- Nome da instância (o mesmo do passo 1)

Pronto — esse número já aparece como opção ao criar uma campanha no canal "WhatsApp Normal".

## Pausa adaptativa entre envios (anti-bloqueio)

O canal Evolution não usa um delay fixo — a pausa entre mensagens cresce conforme o volume já enviado **naquele número, no dia** (contagem zera à meia-noite), por nível:

| Mensagens enviadas hoje (nesse número) | Pausa entre cada envio |
|---|---|
| até 20 | 10-18s |
| 21-50 | 20-30s |
| 51-100 | 35-50s |
| acima de 100 | 60-90s |

Além disso, ao cruzar 20, 50 e 100 mensagens no dia, entra uma pausa extra única ("descanso"): +2-4min em 20, +8-12min em 50, +20-30min em 100 (e a cada 100 adicionais). Os valores têm uma pequena variação aleatória (jitter) para não ficar um padrão robótico idêntico. Tudo isso é por **número** (`whatsAppNumberId`), não por campanha — se duas campanhas usarem o mesmo número, elas dividem a mesma pausa.

Os limiares estão em `EVOLUTION_TIERS`/`EVOLUTION_CHECKPOINTS` no topo de `backend/src/whatsapp/dispatch-queue.service.ts` — são só uma referência inicial conservadora, ajustáveis conforme a experiência de uso real.

## Limitações conhecidas dessa primeira versão

- Não há rastreamento automático de entrega/leitura para esse canal (webhooks da Evolution API não estão conectados ainda) — as mensagens ficam marcadas como "Enviado" ou "Erro", sem `DELIVERED`/`READ`.
- Não há suporte a mídia (imagem/documento), só texto.
