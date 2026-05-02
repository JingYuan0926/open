#!/usr/bin/env tsx
// scripts/resolve-peer.ts — map an X-From-Peer-Id header to a role name from peers.json.
//
// Usage:
//   echo "<header>" | tsx scripts/resolve-peer.ts
//   echo "<header>" | tsx scripts/resolve-peer.ts /path/to/peers.json
//
// AXL truncates X-From-Peer-Id to ~28 hex chars + 'f' padding instead of the full
// 64-hex pubkey. We use matchesPeer (in axl/axl.ts) to do prefix matching.
// Prints the matched role on stdout, or "unknown" if no match.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchesPeer } from "../axl/axl.js";

type PeersFile = Record<string, { lanIp: string; apiPort: number; pubkey: string }>;

// Read all of stdin synchronously.
const header = readFileSync(0, "utf8").trim();

const peersPath = resolve(process.argv[2] ?? "axl/peers.json");
const peers: PeersFile = JSON.parse(readFileSync(peersPath, "utf8"));

if (!header) {
  console.log("unknown");
  process.exit(0);
}

for (const [role, entry] of Object.entries(peers)) {
  if (entry.pubkey && matchesPeer(header, entry.pubkey)) {
    console.log(role);
    process.exit(0);
  }
}

console.log("unknown");
