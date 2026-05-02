# OpenClaw — Telegram → 0G Compute bot

A standalone Telegram bot that proxies messages to **0G Compute Network**'s
decentralized GPU inference. Designed to run on a vanilla EC2 instance
(`t2.micro` is enough) but works anywhere with Node 20+.

This dir is what Right-Hand AI's `agent-c` clones onto the user's EC2 box
during the Phase 2a demo: SSH in → `git clone` → fill in `.env` → `./start.sh`.
The user opens Telegram, finds their bot, and chats with it — every reply is
GPU inference on 0G's decentralized network.

## Quick start

```bash
git clone <this-repo> && cd telegram-bot
cp .env.example .env
# edit .env — paste your BOT_TOKEN and 0G_PRIVATE_KEY
./start.sh
```

That's it. `start.sh` auto-runs `npm install` on first boot.

## Setup

### 1. Telegram bot token

1. Open Telegram → message [@BotFather](https://t.me/BotFather)
2. `/newbot` → pick a name and username
3. Copy the token (`123456:AAAAA...`) into `.env` as `BOT_TOKEN`

### 2. 0G Compute wallet

The bot pays for inference from a funded 0G testnet ledger account. If you
already used the parent monorepo's `pages/0g.tsx` page, your existing
`0G_PRIVATE_KEY` works here unchanged — same env var name, same wallet.

If you don't have one yet:

```bash
# 1. Get testnet 0G from https://faucet.0g.ai
# 2. Use the parent repo's UI or API to create a ledger:
curl -X POST http://localhost:3000/api/0g/compute-setup-account \
  -H "Content-Type: application/json" \
  -d '{"action":"create-ledger","amount":0.5}'
# 3. Optionally pre-transfer funds to a provider for faster first response:
curl -X POST http://localhost:3000/api/0g/compute-setup-account \
  -H "Content-Type: application/json" \
  -d '{"action":"transfer","provider":"0xa48f01287233509FD694a22Bf840225062E67836","amount":0.1}'
```

Paste the same private key into `.env` as `0G_PRIVATE_KEY`.

### 3. Start it

```bash
./start.sh
```

You'll see:
```
Starting OpenClaw Telegram bot…
  wallet:  0x...
  RPC:     https://evmrpc-testnet.0g.ai
  history: 10 turns / chat
  timeout: 60000ms
✓ Bot @YourBotName online
  → https://t.me/YourBotName
```

Open the URL on your phone, hit **Start**, send a message.

## Run as a background service

### nohup (simplest)
```bash
nohup ./start.sh > openclaw.log 2>&1 &
disown
tail -f openclaw.log
```

### PM2 (auto-restart on crash, survives reboot)
```bash
sudo npm i -g pm2
pm2 start npm --name openclaw -- start
pm2 save
pm2 startup    # follow the printed command to enable on boot
```

### systemd (production-ish)
```ini
# /etc/systemd/system/openclaw.service
[Unit]
Description=OpenClaw Telegram bot
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/openclaw
EnvironmentFile=/opt/openclaw/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw
sudo journalctl -u openclaw -f
```

## Commands

| command | action                                                     |
|---------|------------------------------------------------------------|
| `/start`| greet & reset conversation history                         |
| `/reset`| clear conversation memory for this chat                    |
| `/help` | show command list                                          |
| any text| sent to 0G Compute → reply returned in chat                |

In-memory history (last 10 turns per chat) — restarts wipe it. Persisting
across restarts is one Redis call away if you need it; out of scope here.

## Architecture

```
┌─ Telegram ────────────────────────────────────────────────┐
│   User on phone ──► /getUpdates long-poll ──► EC2 box     │
└────────────────────────────────────────────────────────────┘
                             │
                             ▼
                       grammy bot.on("message:text")
                             │
                             ├── append to per-chat history
                             │
                             ▼
                       0G Compute broker
                             │
                             ▼
                       qwen/qwen-2.5-7b-instruct
                       (only chat model live on 0G testnet)
                             │
                             ▼
                       reply.text  ───► ctx.reply() ───► Telegram
```

Run `./node_modules/.bin/tsx check.ts` to refresh the provider list — when 0G
adds more models, drop them into `ZG_COMPUTE_PROVIDERS` in `bot.ts` and the
fallback kicks in automatically.

## Where this fits in the larger demo

Phase 2a flow (see parent repo's `CLAUDE.md`):

```
  agent-b's Mac        user's Mac (Mac A)             EC2 (this bot)        Telegram
  ─────────────        ──────────────────             ─────────────        ────────
  walk_before     ─►  approve y/n + Chrome
  walk_after      ─►  approve y/n + Chrome
  launch_instance ─►  approve y/n
                       SDK ec2:RunInstances
                       returns {id, ip}
  ─────────────                                       (instance booting)
  install_telegram_bot ─►  approve y/n
                       SCP this dir + ssh npm install + start
                                                       bot polls Telegram
                                                       (running)
                                                                              user opens chat
                                                                              types "hello"
                                                       received ───► 0G compute
                                                                       │
                                                                       ▼
                                                       reply ──────────────► "Hi!" in chat
```

The user sees their phone receive a reply from a bot that didn't exist 30
seconds ago — proves end-to-end: AXL transport, MCP execution, real EC2,
real LLM inference on a decentralized GPU network, no centralized provider.

## Troubleshooting

**`Bot @… online` but messages don't reply.**
Check `openclaw.log` for `[0g] … failed:` lines. The 3 providers each
fail individually if your ledger isn't funded for that provider. Either
top up via `compute-setup-account` action=`transfer`, or wait — providers
auto-deduct from the ledger if it has unallocated balance.

**`Error: insufficient funds` on the wallet.**
Different from ledger funding. The wallet itself needs gas to call
`acknowledgeProviderSigner` once per provider. Top up from the faucet.

**Bot replies but says "(no response)".**
Provider returned an empty completion. Try `/reset` then send a fresh
message — usually a context-too-long issue.

**`grammy` complains about webhook conflict.**
Only run one instance per token. If you migrated machines, run
`curl https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook` once.
