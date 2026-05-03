// scripts/test-full-publish.ts
//
// End-to-end test of the /host registration flow, server-signed (no wallet
// UI). Uses 0G_PRIVATE_KEY for both:
//   1. mintAgent on 0G Galileo (chainId 16602) → RightHandAIINFT
//   2. register on Sepolia → SpecialistRegistrar (anyone can call;
//      contract is pre-approved by the parent owner)
//
// Run:
//   npx tsx scripts/test-full-publish.ts <slug>
//   e.g.:
//   npx tsx scripts/test-full-publish.ts my-test-bot
//
// Prints both tx hashes + the ENS subname + iNFT token id.

import { ethers } from "ethers";
import { RIGHTHAND_INFT_ADDRESS, RIGHTHAND_INFT_ABI } from "@/lib/righthand-inft-abi";
import { SPECIALIST_REGISTRAR_ABI } from "@/lib/abis/SpecialistRegistrar";
import {
  ENS_PARENT_DOMAIN,
  SPECIALIST_REGISTRAR_ADDRESS,
} from "@/lib/networkConfig";

const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const slugArg = process.argv[2];
if (!slugArg) {
  console.error("usage: tsx scripts/test-full-publish.ts <slug>");
  process.exit(64);
}
const slug = slugArg.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
const skill = process.env.SKILL ?? "demo,smoke-test,e2e";
const desc =
  process.env.DESC ?? "End-to-end smoke-test specialist created via API.";
const price = process.env.PRICE ?? "0.10";
const version = process.env.VERSION ?? "0.1.0";
const axlPubkey = process.env.AXL_PUBKEY ?? "0x" + "00".repeat(32);

const pk = process.env["0G_PRIVATE_KEY"];
if (!pk) {
  console.error("Missing 0G_PRIVATE_KEY in env / .env");
  process.exit(1);
}

function inftUrl(tokenId: string): string {
  return `https://chainscan-galileo.0g.ai/nft/${RIGHTHAND_INFT_ADDRESS}/${tokenId}`;
}

(async () => {
  const cyan = "\x1b[36m";
  const green = "\x1b[32m";
  const yellow = "\x1b[1;33m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";

  console.log(`${cyan}━━ test-full-publish ━━${reset}`);
  console.log(`${dim}slug:${reset} ${slug}`);
  console.log(`${dim}parent domain:${reset} ${ENS_PARENT_DOMAIN}`);
  console.log(`${dim}iNFT contract:${reset} ${RIGHTHAND_INFT_ADDRESS} (0G Galileo)`);
  console.log(`${dim}registrar:${reset} ${SPECIALIST_REGISTRAR_ADDRESS} (Sepolia)`);

  // ────────────────────────────────────────────────────────────────
  // 1. mint iNFT on 0G Galileo
  // ────────────────────────────────────────────────────────────────
  console.log(`\n${yellow}[1/2]${reset} mint iNFT on 0G Galileo`);
  const zg = new ethers.JsonRpcProvider(ZG_RPC);
  const zgWallet = new ethers.Wallet(pk, zg);
  console.log(`${dim}  caller:${reset} ${zgWallet.address}`);

  const inft = new ethers.Contract(
    RIGHTHAND_INFT_ADDRESS,
    RIGHTHAND_INFT_ABI,
    zgWallet,
  );

  const mintTx = await inft.mintAgent(
    zgWallet.address, // to: same wallet owns the iNFT
    slug,
    skill,
    desc,
    [],
  );
  console.log(`${dim}  mint tx:${reset} ${mintTx.hash}`);
  const mintReceipt = await mintTx.wait();

  // Pull tokenId from AgentMinted event
  const iface = new ethers.Interface(RIGHTHAND_INFT_ABI);
  let tokenId: string | null = null;
  for (const log of mintReceipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "AgentMinted") {
        tokenId = parsed.args[0].toString();
        break;
      }
    } catch {
      /* not from this contract */
    }
  }
  if (!tokenId) throw new Error("AgentMinted event not found in receipt");
  console.log(`${green}  ✓${reset} token id: ${tokenId}`);
  console.log(`${dim}  view:${reset} ${inftUrl(tokenId)}`);

  // ────────────────────────────────────────────────────────────────
  // 2. register ENS subname on Sepolia
  // ────────────────────────────────────────────────────────────────
  console.log(`\n${yellow}[2/2]${reset} register ENS subname on Sepolia`);
  const eth = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const ethWallet = new ethers.Wallet(pk, eth);
  console.log(`${dim}  caller:${reset} ${ethWallet.address}`);

  const registrar = new ethers.Contract(
    SPECIALIST_REGISTRAR_ADDRESS,
    SPECIALIST_REGISTRAR_ABI,
    ethWallet,
  );

  const records = {
    axlPubkey,
    skills: skill,
    workspaceUri: inftUrl(tokenId),
    tokenId,
    price,
    version,
  };

  const regTx = await registrar.register(slug, records);
  console.log(`${dim}  register tx:${reset} ${regTx.hash}`);
  const regReceipt = await regTx.wait();
  const fullName = `${slug}.${ENS_PARENT_DOMAIN}`;

  // Pull SpecialistRegistered event
  const regIface = new ethers.Interface(SPECIALIST_REGISTRAR_ABI);
  let registered: { node?: string } | null = null;
  for (const log of regReceipt.logs) {
    try {
      const parsed = regIface.parseLog(log);
      if (parsed?.name === "SpecialistRegistered") {
        registered = { node: parsed.args[2] as string };
        break;
      }
    } catch {
      /* not from this contract */
    }
  }
  console.log(`${green}  ✓${reset} ENS name: ${fullName}`);
  if (registered?.node) console.log(`${dim}  ens node:${reset} ${registered.node}`);

  // ────────────────────────────────────────────────────────────────
  console.log(`\n${green}━━ done ━━${reset}`);
  console.log(`${dim}  ENS:${reset}        ${fullName}`);
  console.log(`${dim}  iNFT:${reset}       #${tokenId}`);
  console.log(`${dim}  mint tx:${reset}    https://chainscan-galileo.0g.ai/tx/${mintTx.hash}`);
  console.log(`${dim}  register tx:${reset} https://sepolia.etherscan.io/tx/${regTx.hash}`);
  console.log(`${dim}  read:${reset}       http://localhost:3000/api/ens/read-specialist?name=${fullName}`);
})().catch((err) => {
  console.error(`\nERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
