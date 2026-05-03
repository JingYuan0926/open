// Server-only helpers for storing/retrieving chat conversations on 0G Storage.
// Mirrors the pattern from TeeTee-v2: a transcript is uploaded to 0G as a file,
// the returned rootHash + per-wallet metadata is indexed in a local JSON file.
//
// 0G Storage is immutable — every save uploads a fresh file and replaces the
// rootHash on the metadata record. The previous rootHash remains addressable
// on 0G but is no longer surfaced in the index.

import { Indexer, ZgFile } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const RPC_URL = "https://evmrpc-testnet.0g.ai";
const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "chat-sessions.json");

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
};

export type ChatSession = {
  id: string;
  walletAddress: string;
  filename: string;
  preview: string;
  rootHash: string;
  txHash: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type SessionsFile = { sessions: ChatSession[] };

function getPrivateKey(): string {
  const pk = process.env["0G_PRIVATE_KEY"];
  if (!pk) {
    throw new Error("Missing 0G_PRIVATE_KEY in .env.local");
  }
  return pk.startsWith("0x") ? pk : `0x${pk}`;
}

function ensureSessionsFile(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions: [] }, null, 2));
  }
}

function readSessions(): ChatSession[] {
  ensureSessionsFile();
  const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
  const parsed: SessionsFile = JSON.parse(raw);
  return parsed.sessions ?? [];
}

function writeSessions(sessions: ChatSession[]): void {
  ensureSessionsFile();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions }, null, 2));
}

function buildTranscript(messages: ChatMessage[]): string {
  return (
    messages
      .map((m) => {
        const ts = new Date(m.timestamp || Date.now()).toISOString();
        const role = (m.role || "user").toUpperCase();
        const content =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return `[${ts}] ${role}: ${content}`;
      })
      .join("\n") + "\n"
  );
}

const TRANSCRIPT_LINE = /^\[([^\]]+)\]\s+(USER|ASSISTANT|SYSTEM):\s+([\s\S]+)$/;

function parseTranscript(content: string): ChatMessage[] {
  // Messages may contain newlines — fold lines without a [timestamp] prefix
  // into the previous message's content.
  const lines = content.split("\n");
  const out: ChatMessage[] = [];
  for (const line of lines) {
    const match = line.match(TRANSCRIPT_LINE);
    if (match) {
      const [, ts, role, body] = match;
      out.push({
        role: role.toLowerCase() as ChatRole,
        content: body,
        timestamp: new Date(ts).getTime(),
      });
    } else if (line.length > 0 && out.length > 0) {
      out[out.length - 1].content += `\n${line}`;
    }
  }
  return out;
}

async function uploadTranscript(
  transcript: string,
  filename: string,
): Promise<{ rootHash: string; txHash: string }> {
  const tmpFile = path.join(os.tmpdir(), `chat-${Date.now()}-${filename}`);
  fs.writeFileSync(tmpFile, transcript, "utf-8");

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(getPrivateKey(), provider);

    const zgFile = await ZgFile.fromFilePath(tmpFile);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr || !tree) {
      throw new Error(`merkle tree failed: ${String(treeErr)}`);
    }
    const rootHash = tree.rootHash();

    const indexer = new Indexer(INDEXER_RPC);
    const [uploadResult, uploadErr] = await indexer.upload(
      zgFile,
      RPC_URL,
      signer,
    );

    await zgFile.close();

    if (uploadErr) {
      // 0G testnet sometimes returns "Data already exists" when the same
      // bytes were uploaded before — treat as success since the rootHash is
      // already addressable on the network.
      const msg = String(uploadErr);
      if (!msg.toLowerCase().includes("already exists")) {
        throw new Error(`upload failed: ${msg}`);
      }
    }

    const txHash =
      uploadResult && "txHash" in uploadResult
        ? (uploadResult as { txHash: string }).txHash
        : uploadResult && "txHashes" in uploadResult
          ? (uploadResult as { txHashes: string[] }).txHashes[0]
          : "";

    if (!rootHash) throw new Error("rootHash missing after upload");
    return { rootHash, txHash };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

async function downloadTranscript(rootHash: string): Promise<string> {
  const tmpFile = path.join(
    os.tmpdir(),
    `chat-dl-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  try {
    const indexer = new Indexer(INDEXER_RPC);
    const err = await indexer.download(rootHash, tmpFile, true);
    if (err) throw new Error(`download failed: ${String(err)}`);
    return fs.readFileSync(tmpFile, "utf-8");
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

function previewFor(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.content?.trim() ?? "(no user message)";
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export async function saveChatSession(input: {
  walletAddress: string;
  messages: ChatMessage[];
  sessionId?: string;
  filename?: string;
}): Promise<ChatSession> {
  const wallet = input.walletAddress.toLowerCase();
  const filename =
    (input.filename ?? "").trim() || `chat-${Date.now()}.txt`;

  const transcript = buildTranscript(input.messages);
  const { rootHash, txHash } = await uploadTranscript(transcript, filename);

  const sessions = readSessions();
  const now = new Date().toISOString();
  const preview = previewFor(input.messages);

  if (input.sessionId) {
    const idx = sessions.findIndex(
      (s) => s.id === input.sessionId && s.walletAddress === wallet,
    );
    if (idx >= 0) {
      sessions[idx] = {
        ...sessions[idx],
        filename,
        rootHash,
        txHash,
        messageCount: input.messages.length,
        preview,
        updatedAt: now,
      };
      writeSessions(sessions);
      return sessions[idx];
    }
  }

  const newSession: ChatSession = {
    id: randomUUID(),
    walletAddress: wallet,
    filename,
    preview,
    rootHash,
    txHash,
    messageCount: input.messages.length,
    createdAt: now,
    updatedAt: now,
  };
  sessions.push(newSession);
  writeSessions(sessions);
  return newSession;
}

export function listChatSessions(walletAddress: string): ChatSession[] {
  const wallet = walletAddress.toLowerCase();
  return readSessions()
    .filter((s) => s.walletAddress === wallet)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export async function loadChatMessages(rootHash: string): Promise<ChatMessage[]> {
  const transcript = await downloadTranscript(rootHash);
  return parseTranscript(transcript);
}

export function deleteChatSession(
  sessionId: string,
  walletAddress: string,
): boolean {
  const wallet = walletAddress.toLowerCase();
  const sessions = readSessions();
  const next = sessions.filter(
    (s) => !(s.id === sessionId && s.walletAddress === wallet),
  );
  if (next.length === sessions.length) return false;
  writeSessions(next);
  return true;
}
