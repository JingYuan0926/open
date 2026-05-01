#!/usr/bin/env tsx
// scripts/axl-send.ts — A2A-based replacement for axl-cc-send.sh.
//
// Usage:
//   npm run axl:send -- <target-role> "<message text>"
//   e.g. npm run axl:send -- agent-c "hello from agent-b"
//
// What it does:
//   1. Reads MACHINE_ROLE from .axl/role.
//   2. Looks up target.pubkey + spectator.pubkey from axl/peers.json.
//   3. For each destination peer, fetches the remote agent card via
//      GET http://127.0.0.1:9002/a2a/{peerId} (AXL forwards to remote /.well-known/agent-card.json).
//   4. Overrides the card's url to AXL's forward endpoint so the SDK posts through AXL.
//   5. Uses @a2a-js/sdk's ClientFactory to send the A2A message/send call.
//   6. Tags the message with metadata.fromRole = MY_ROLE so the receiver can label it,
//      and metadata.cc = true on the spectator copy.
//
// CC pattern: every send goes to (target, spectator) — two A2A calls per logical message.

import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { AgentCard, MessageSendParams } from "@a2a-js/sdk";

type PeersFile = Record<
  string,
  { lanIp: string; apiPort: number; pubkey: string }
>;

function die(msg: string): never {
  console.error(`\x1b[31m[send]\x1b[0m ${msg}`);
  process.exit(1);
}

function say(msg: string): void {
  console.log(`\x1b[36m[send]\x1b[0m ${msg}`);
}

// ---------- args + config ----------
const [, , targetRole, ...rest] = process.argv;
const message = rest.join(" ");

if (!targetRole || !message) {
  die(
    `Usage: npm run axl:send -- <target-role> "<message>"
  target-role: spectator | agent-b | agent-c
  example:     npm run axl:send -- agent-c "hello from agent-b"`
  );
}

const rolePath = resolve(".axl/role");
if (!existsSync(rolePath)) {
  die("Run 'npm run axl:setup' first (.axl/role missing).");
}
const myRole = readFileSync(rolePath, "utf8").trim();
if (myRole === "spectator") {
  die("Spectator is receive-only by design. Use this from an agent role.");
}

const peers: PeersFile = JSON.parse(readFileSync("axl/peers.json", "utf8"));
const myEntry = peers[myRole];
if (!myEntry) die(`MACHINE_ROLE '${myRole}' not found in peers.json.`);

const targetEntry = peers[targetRole];
if (!targetEntry) die(`Target role '${targetRole}' not in peers.json.`);
if (!targetEntry.pubkey) {
  die(
    `Target '${targetRole}' has no pubkey in peers.json yet. Has the target run 'npm run axl:start'?`
  );
}

const spectatorEntry = peers["spectator"];
const ccSpectator =
  targetRole !== "spectator" &&
  !!spectatorEntry &&
  !!spectatorEntry.pubkey &&
  spectatorEntry.pubkey.length > 0;

// ---------- send ----------
async function sendOne(
  destPubkey: string,
  destLabel: string,
  isCc: boolean
): Promise<void> {
  const axlUrl = `http://127.0.0.1:${myEntry.apiPort}/a2a/${destPubkey}`;

  // 1. Discovery: AXL's GET /a2a/{peer_id} forwards to remote /.well-known/agent-card.json.
  const cardRes = await fetch(axlUrl);
  if (!cardRes.ok) {
    throw new Error(
      `Card fetch failed for ${destLabel} (${destPubkey.slice(0, 12)}…): HTTP ${cardRes.status} — ${await cardRes.text()}`
    );
  }
  const remoteCard = (await cardRes.json()) as AgentCard;

  // 2. Override card.url → AXL's forward endpoint, so the SDK POSTs through AXL.
  const routedCard: AgentCard = { ...remoteCard, url: axlUrl };

  // 3. Build A2A client + sendMessage.
  const client = await new ClientFactory().createFromAgentCard(routedCard);
  const params: MessageSendParams = {
    message: {
      kind: "message",
      messageId: randomUUID(),
      role: "user",
      parts: [{ kind: "text", text: message }],
      metadata: { fromRole: myRole, cc: isCc },
    },
  };
  const result = await client.sendMessage(params);

  // Pretty-print the reply.
  const replyText = extractReplyText(result);
  const tag = isCc ? "cc → " : "→ ";
  console.log(
    `\x1b[2m${new Date().toISOString()}\x1b[0m \x1b[1;32m${tag}${destLabel}\x1b[0m  reply: ${replyText}`
  );
}

function extractReplyText(result: unknown): string {
  // The SDK returns { kind: "message", parts: [{ kind: "text", text: "..." }], ... }
  // depending on version. Best-effort string extraction.
  try {
    const r = result as { parts?: Array<{ kind?: string; text?: string }> };
    if (r?.parts) {
      const text = r.parts
        .filter((p) => p.kind === "text" && typeof p.text === "string")
        .map((p) => p.text!)
        .join(" ");
      if (text) return text;
    }
  } catch {
    /* fall through */
  }
  return JSON.stringify(result).slice(0, 120);
}

(async () => {
  try {
    await sendOne(targetEntry.pubkey, targetRole, false);
    if (ccSpectator) {
      await sendOne(spectatorEntry!.pubkey, "spectator", true);
    } else if (targetRole !== "spectator" && spectatorEntry && !spectatorEntry.pubkey) {
      say("Spectator has no pubkey in peers.json — sent without CC.");
    }
  } catch (e) {
    die((e as Error).message);
  }
})();
