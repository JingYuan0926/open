// telegram-bot/bot.ts — OpenClaw Telegram bot powered by 0G Compute Network.
//
// Standalone Node 20+ script. Runs on a vanilla EC2 instance.
//
// Long-polls Telegram for messages → routes through 0G Compute (decentralized
// GPU inference) → returns reply. In-memory per-chat history (last 10 turns).
//
// Mirrors lib/0g-compute.ts + pages/api/0g/inft-infer.ts from the parent repo
// so the same 0G_PRIVATE_KEY / funded ledger work here unchanged.

import "dotenv/config";

// 0G SDK (and its axios dep) reference window.location at module-load time.
// On Node we shim it so the import doesn't blow up.
{
  const g = globalThis as { window?: unknown };
  if (typeof g.window === "undefined") {
    g.window = {
      location: { protocol: "https:", host: "localhost", href: "https://localhost" },
    };
  }
}

import { Bot } from "grammy";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

// ────────────────────────────────────────────────────────────────────────────
// Config

const BOT_TOKEN = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
const ZG_PRIVATE_KEY =
  process.env["0G_PRIVATE_KEY"] ?? process.env.ZG_PRIVATE_KEY;
const ZG_RPC = process.env.ZG_RPC ?? "https://evmrpc-testnet.0g.ai";
const ZG_EXPLORER =
  process.env.ZG_EXPLORER ?? "https://chainscan-galileo.0g.ai";
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT ?? "10", 10);
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.REQUEST_TIMEOUT_MS ?? "60000",
  10
);
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ??
  "You are OpenClaw, a friendly AI agent running on a private EC2 instance. " +
    "You were deployed by Right-Hand AI's coordinator agents over Gensyn AXL " +
    "(decentralized P2P), and your replies are powered by 0G Compute Network's " +
    "verifiable GPU inference. Keep responses concise and helpful.";

if (!BOT_TOKEN) {
  console.error("✗ Missing BOT_TOKEN. Add it to .env or export it.");
  process.exit(1);
}
if (!ZG_PRIVATE_KEY) {
  console.error("✗ Missing 0G_PRIVATE_KEY. Add it to .env or export it.");
  process.exit(1);
}

// 0G Compute testnet providers (run `./node_modules/.bin/tsx check.ts` to refresh).
// Cheapest chat model first; failures fall through to any others. Currently
// qwen is the only live chat model on the 0G testnet — the broker's listService
// returns only it (and an image-edit model which is irrelevant for a chat bot).
const ZG_COMPUTE_PROVIDERS = [
  {
    address: "0xa48f01287233509FD694a22Bf840225062E67836",
    label: "qwen/qwen-2.5-7b-instruct",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// 0G Compute broker (single shared promise, lazy-init on first message)

const wallet = new ethers.Wallet(
  ZG_PRIVATE_KEY,
  new ethers.JsonRpcProvider(ZG_RPC)
);

// Capture every on-chain tx the wallet sends — we surface these as
// hyperlinks in the Telegram reply footer so users can see the actual
// 0G chain activity behind each inference call (mostly the one-time
// acknowledgeProviderSigner tx on first use of each provider).
type SentTx = { hash: string; ts: number };
const sentTxs: SentTx[] = [];
const _origSend = wallet.sendTransaction.bind(wallet);
wallet.sendTransaction = async (tx) => {
  const result = await _origSend(tx);
  sentTxs.push({ hash: result.hash, ts: Date.now() });
  console.log(`[tx] ${result.hash}`);
  return result;
};
// The 0G SDK's bundled ethers types come from its CommonJS build; ours come
// from ESM. Same runtime, mismatched declaration files, so cast through
// unknown to bypass the structural mismatch on the private brand check.
const brokerPromise = createZGComputeNetworkBroker(
  wallet as unknown as Parameters<typeof createZGComputeNetworkBroker>[0]
);

type ChatMessage = { role: "user" | "assistant"; content: string };

async function chat(history: ChatMessage[]): Promise<{
  reply: string;
  model: string;
  provider: string;
  chatId?: string;
  newTxs: string[];
}> {
  const broker = await brokerPromise;
  const lastUserText = history[history.length - 1]?.content ?? "";

  const txCountBefore = sentTxs.length;

  let lastErr: Error | null = null;
  for (const p of ZG_COMPUTE_PROVIDERS) {
    try {
      const acked = await broker.inference.acknowledged(p.address);
      if (!acked) {
        await broker.inference.acknowledgeProviderSigner(p.address);
      }

      const { endpoint, model } = await broker.inference.getServiceMetadata(
        p.address
      );
      const headers = await broker.inference.getRequestHeaders(
        p.address,
        lastUserText
      );

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      let resp: Response;
      try {
        resp = await fetch(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...history,
            ],
            max_tokens: 512,
            temperature: 0.7,
          }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(
          `${p.label} returned ${resp.status}: ${errText.slice(0, 200)}`
        );
      }

      const data = (await resp.json()) as {
        id?: string;
        choices?: { message?: { content?: string } }[];
      };
      const reply = data.choices?.[0]?.message?.content ?? "(no response)";

      // Settle billing — don't block on failure (some providers reject this).
      try {
        await broker.inference.processResponse(p.address, data.id, reply);
      } catch {
        /* non-critical */
      }

      const newTxs = sentTxs.slice(txCountBefore).map((t) => t.hash);
      return {
        reply,
        model,
        provider: p.address,
        chatId: data.id,
        newTxs,
      };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[0g] ${p.label} failed: ${lastErr.message}`);
    }
  }
  throw new Error(`All 0G providers failed. Last: ${lastErr?.message}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Telegram bot

const history = new Map<number, ChatMessage[]>();

const bot = new Bot(BOT_TOKEN);

bot.command("start", async (ctx) => {
  history.delete(ctx.chat.id);
  await ctx.reply(
    "👋 Hi! I'm OpenClaw, an AI agent running on a private EC2 instance.\n\n" +
      "Powered by 0G Compute Network — every reply is GPU inference on a decentralized provider.\n\n" +
      "Send me anything to chat. /reset clears the conversation, /help lists commands."
  );
});

bot.command("reset", async (ctx) => {
  history.delete(ctx.chat.id);
  await ctx.reply("✅ Memory cleared.");
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "/start  — greet & reset history\n" +
      "/reset  — clear conversation memory\n" +
      "/help   — this message\n\n" +
      "Anything else is sent to 0G Compute."
  );
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return; // unknown command — ignore

  const chatId = ctx.chat.id;

  // Show typing indicator while we wait for 0G inference. Telegram clears it
  // automatically after ~5s, so we re-trigger every 4s until the reply lands.
  await ctx.replyWithChatAction("typing").catch(() => {});
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  try {
    const msgs = history.get(chatId) ?? [];
    msgs.push({ role: "user", content: text });
    // Bound history to last N turns (each turn = user + assistant pair).
    const max = HISTORY_LIMIT * 2;
    if (msgs.length > max) msgs.splice(0, msgs.length - max);

    const { reply, model, provider, chatId: receiptId, newTxs } =
      await chat(msgs);

    msgs.push({ role: "assistant", content: reply });
    history.set(chatId, msgs);

    const html = renderReplyHtml({ reply, model, provider, receiptId, newTxs });
    await ctx.reply(html, {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message.message_id },
      link_preview_options: { is_disabled: true },
    });
    console.log(
      `[chat ${chatId}] ${model}: ${truncate(text, 60)} → ${truncate(reply, 60)}` +
        (newTxs.length ? ` [tx: ${newTxs.join(",")}]` : "")
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[chat ${chatId}] ✗ ${msg}`);
    await ctx
      .reply(`⚠️ 0G Compute call failed:\n\n${msg}`)
      .catch(() => {});
  } finally {
    clearInterval(typingInterval);
  }
});

bot.catch((err) => {
  console.error("[bot] uncaught:", err.error ?? err);
});

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shortAddr(a: string): string {
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function modelShort(m: string): string {
  // "qwen/qwen-2.5-7b-instruct" → "qwen-2.5-7b-instruct"; cap length too
  const tail = m.includes("/") ? m.split("/").slice(1).join("/") : m;
  return tail.length > 32 ? tail.slice(0, 32) + "…" : tail;
}

function txUrl(hash: string): string {
  return `${ZG_EXPLORER}/tx/${hash}`;
}
function addrUrl(a: string): string {
  return `${ZG_EXPLORER}/address/${a}`;
}

// Build the HTML reply: model output + a small footer of explorer links.
// Telegram caps messages at 4096 chars — we leave ~400 for the footer.
function renderReplyHtml(opts: {
  reply: string;
  model: string;
  provider: string;
  receiptId?: string;
  newTxs: string[];
}): string {
  const MAX_BODY = 3600;
  const body = opts.reply.length > MAX_BODY
    ? opts.reply.slice(0, MAX_BODY) + "…"
    : opts.reply;

  const parts: string[] = [];
  parts.push(
    `↗ via 0G Compute · ` +
      `<a href="${addrUrl(opts.provider)}">${escapeHtml(modelShort(opts.model))}</a>`
  );
  if (opts.newTxs.length > 0) {
    const txLinks = opts.newTxs
      .map(
        (h) =>
          `<a href="${txUrl(h)}">${escapeHtml(shortAddr(h))}</a>`
      )
      .join(", ");
    parts.push(`⛓ on-chain tx${opts.newTxs.length > 1 ? "s" : ""}: ${txLinks}`);
  }

  return `${escapeHtml(body)}\n\n<i>${parts.join(" · ")}</i>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Boot — OpenClaw-style staged init.

const COLOR = {
  red: "\x1b[1;31m",
  yellow: "\x1b[1;33m",
  cyan: "\x1b[1;36m",
  green: "\x1b[1;32m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

const BOOT_STEPS = 5;

function bootLine(n: number, label: string): void {
  const tag = `[ ${n}/${BOOT_STEPS} ]`;
  const visible = `${tag}  ▸ ${label} `;
  const dotted = visible.padEnd(54, ".");
  process.stdout.write(
    `${COLOR.dim}${dotted}${COLOR.reset} `
  );
}
function bootOk(detail = ""): void {
  process.stdout.write(
    `${COLOR.green}✓${COLOR.reset}` +
      (detail ? ` ${COLOR.dim}${detail}${COLOR.reset}` : "") +
      "\n"
  );
}
function bootFail(detail: string): void {
  process.stdout.write(`${COLOR.red}✗ ${detail}${COLOR.reset}\n`);
}

function fmtEther(v: bigint): string {
  const s = ethers.formatEther(v);
  // trim to 4 decimal places for the boot screen
  const dot = s.indexOf(".");
  return dot === -1 ? s : s.slice(0, dot + 5);
}

(async () => {
  bootLine(1, "loading 0g compute broker");
  // Silence the SDK's chatty boot logs so they don't break our progress line.
  const _log = console.log;
  const _err = console.error;
  console.log = () => {};
  console.error = () => {};
  const broker = await brokerPromise;
  console.log = _log;
  console.error = _err;
  bootOk();

  bootLine(2, "probing 0g testnet");
  const gasBalance = await wallet.provider!.getBalance(wallet.address);
  bootOk(`gas ${fmtEther(gasBalance)} 0G · chain 16602`);

  bootLine(3, "reading ledger");
  let ledgerSummary = "no ledger";
  try {
    const ledger = (await broker.ledger.getLedger()) as unknown[];
    // Ledger is returned as a tuple; balance is one of the bigint slots.
    let totalRaw: bigint | null = null;
    for (const v of ledger) {
      if (typeof v === "bigint" || /^\d{6,}$/.test(String(v))) {
        const n = BigInt(String(v));
        if (totalRaw === null || n > totalRaw) totalRaw = n;
      }
    }
    if (totalRaw !== null && totalRaw > 0n) {
      ledgerSummary = `${fmtEther(totalRaw)} 0G allocated`;
    }
  } catch {
    /* keep "no ledger" */
  }
  bootOk(ledgerSummary);

  bootLine(4, "acknowledging providers");
  const ackResults: string[] = [];
  for (const p of ZG_COMPUTE_PROVIDERS) {
    try {
      const acked = await broker.inference.acknowledged(p.address);
      if (!acked) {
        await broker.inference.acknowledgeProviderSigner(p.address);
        ackResults.push(`${p.label.split("/").pop()} (fresh)`);
      } else {
        ackResults.push(`${p.label.split("/").pop()}`);
      }
    } catch (err) {
      ackResults.push(
        `${p.label.split("/").pop()} ✗(${err instanceof Error ? err.message.slice(0, 20) : "err"})`
      );
    }
  }
  bootOk(ackResults.join(", "));

  bootLine(5, "pairing telegram channel");
  bot.start({
    onStart: (info) => {
      bootOk(`@${info.username}`);
      console.log("");
      console.log(
        `    ${COLOR.green}${COLOR.bold}EXFOLIATE!${COLOR.reset} ${COLOR.green}OpenClaw is online.${COLOR.reset}`
      );
      console.log(
        `    ${COLOR.dim}→ https://t.me/${info.username}${COLOR.reset}`
      );
      console.log(
        `    ${COLOR.dim}wallet:  ${wallet.address}${COLOR.reset}`
      );
      console.log(
        `    ${COLOR.dim}history: ${HISTORY_LIMIT} turns/chat · timeout ${REQUEST_TIMEOUT_MS}ms${COLOR.reset}`
      );
      console.log("");
      console.log(
        `    ${COLOR.dim}listening for messages — ${COLOR.reset}${COLOR.yellow}Ctrl+C${COLOR.reset} ${COLOR.dim}to stop.${COLOR.reset}`
      );
      console.log("");
    },
  });
})().catch((err) => {
  bootFail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

// Graceful shutdown so PM2 / systemd / nohup&kill behaves.
const shutdown = () => {
  console.log(
    `\n${COLOR.dim}─ shutting down — the lobster sleeps 🦞${COLOR.reset}`
  );
  bot.stop();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
