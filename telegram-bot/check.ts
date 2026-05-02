// check.ts — inspect 0G compute account: balance, ledger, providers + prices.
import "dotenv/config";

{
  const g = globalThis as { window?: unknown };
  if (typeof g.window === "undefined") {
    g.window = {
      location: { protocol: "https:", host: "localhost", href: "https://localhost" },
    };
  }
}

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const KEY = process.env["0G_PRIVATE_KEY"] ?? process.env.ZG_PRIVATE_KEY;
const RPC = process.env.ZG_RPC ?? "https://evmrpc-testnet.0g.ai";
if (!KEY) {
  console.error("Missing 0G_PRIVATE_KEY");
  process.exit(1);
}

const wallet = new ethers.Wallet(KEY, new ethers.JsonRpcProvider(RPC));

function fmtEther(v: bigint | string | undefined): string {
  if (v === undefined) return "?";
  try {
    return ethers.formatEther(typeof v === "string" ? BigInt(v) : v);
  } catch {
    return String(v);
  }
}

(async () => {
  console.log(`wallet:  ${wallet.address}`);
  const ethBal = await wallet.provider!.getBalance(wallet.address);
  console.log(`gas bal: ${ethers.formatEther(ethBal)} 0G (for sending txs)`);

  const broker = await createZGComputeNetworkBroker(
    wallet as unknown as Parameters<typeof createZGComputeNetworkBroker>[0]
  );

  console.log("\n── ledger ──");
  try {
    const ledger = await broker.ledger.getLedger();
    const json = JSON.parse(
      JSON.stringify(ledger, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v
      )
    );
    console.log(JSON.stringify(json, null, 2));
    if (json.totalBalance) {
      console.log(
        `\ntotalBalance:    ${fmtEther(json.totalBalance)} 0G`
      );
    }
    if (json.availableBalance) {
      console.log(
        `availableBalance: ${fmtEther(json.availableBalance)} 0G  (unallocated, can be transferred to providers)`
      );
    }
  } catch (e) {
    console.log(
      `(no ledger yet — error: ${e instanceof Error ? e.message : String(e)})`
    );
    console.log(`→ create one with broker.ledger.addLedger(amount)`);
  }

  console.log("\n── providers (all on 0G testnet) ──");
  const services = await broker.inference.listService();
  // Sort by output price ascending (most users care about output cost)
  const sorted = [...services].sort((a, b) => {
    const ap = BigInt(a.outputPrice.toString());
    const bp = BigInt(b.outputPrice.toString());
    return ap < bp ? -1 : ap > bp ? 1 : 0;
  });

  for (const s of sorted) {
    const inP = BigInt(s.inputPrice.toString());
    const outP = BigInt(s.outputPrice.toString());
    console.log(`  ${s.model}`);
    console.log(`    provider:      ${s.provider}`);
    console.log(`    inputPrice:    ${inP.toString()} neuron / token  (${fmtEther(inP)} 0G)`);
    console.log(`    outputPrice:   ${outP.toString()} neuron / token  (${fmtEther(outP)} 0G)`);
    console.log(`    verifiability: ${s.verifiability}`);
    console.log(`    url:           ${s.url}`);
  }

  console.log("\n── per-provider sub-account balances ──");
  for (const s of sorted) {
    try {
      const acked = await broker.inference.acknowledged(s.provider);
      const acct = acked
        ? await broker.inference
            .getAccount?.(s.provider)
            .catch(() => null)
        : null;
      console.log(
        `  ${s.model.padEnd(36)} acked=${acked}` +
          (acct
            ? `  balance=${JSON.stringify(acct, (_k, v) =>
                typeof v === "bigint" ? v.toString() : v
              )}`
            : "")
      );
    } catch (e) {
      console.log(
        `  ${s.model}: error — ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  console.log("\n── cheapest provider (by outputPrice) ──");
  if (sorted.length > 0) {
    const c = sorted[0];
    console.log(`  ${c.model} @ ${c.provider}`);
    console.log(`  output: ${fmtEther(BigInt(c.outputPrice.toString()))} 0G/token`);
    console.log(`  input:  ${fmtEther(BigInt(c.inputPrice.toString()))} 0G/token`);
  }

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
