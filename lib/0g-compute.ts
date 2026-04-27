// Polyfill: 0G SDK + axios reference window.location at load time (server-side)
if (typeof globalThis.window === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {
    location: { protocol: "https:", host: "localhost", href: "https://localhost" },
  };
}

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const ZG_RPC = "https://evmrpc-testnet.0g.ai";

let brokerPromise: ReturnType<typeof createZGComputeNetworkBroker> | null = null;

export function getComputeBroker() {
  if (brokerPromise) return brokerPromise;

  const privateKey = process.env.ZG_STORAGE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing ZG_STORAGE_PRIVATE_KEY in .env.local");
  }

  const provider = new ethers.JsonRpcProvider(ZG_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);

  brokerPromise = createZGComputeNetworkBroker(wallet);
  return brokerPromise;
}
