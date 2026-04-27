import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccountCreateTransaction,
  Hbar,
  PrivateKey,
} from "@hashgraph/sdk";
import { getClient } from "@/lib/hedera";
import { encrypt } from "@/lib/encrypt";

/**
 * Phase 1 of agent registration:
 *   1. Create a new Hedera testnet account (ECDSA key, 10 HBAR)
 *   2. Read AgentBook nonce for the new EVM address
 *   3. Return everything needed for Phase 2 (World ID scan)
 *
 * The encrypted private key is returned so Phase 3 can store it.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    // ── Step 1: Create per-agent Hedera account ─────────────────
    const client = getClient();

    const agentPrivateKey = PrivateKey.generateECDSA();
    const agentPublicKey = agentPrivateKey.publicKey;

    const accountTx = new AccountCreateTransaction()
      .setKey(agentPublicKey)
      .setInitialBalance(new Hbar(10));

    const accountResponse = await accountTx.execute(client);
    const accountReceipt = await accountResponse.getReceipt(client);
    const newAccountId = accountReceipt.accountId!.toString();
    const evmAddress = `0x${agentPublicKey.toEvmAddress()}`;

    client.close();

    // Encrypt the agent's private key for secure storage
    const encryptedAgentKey = encrypt(agentPrivateKey.toStringDer());

    // ── Step 2: Read AgentBook nonce for World ID registration ──
    let agentBookNonce: string | null = null;
    try {
      const { getAgentBookNonce } = await import("@/lib/world-agentkit");
      agentBookNonce = await getAgentBookNonce(evmAddress);
    } catch {
      // World ID packages not available — skip
    }

    return res.status(200).json({
      success: true,
      hederaAccountId: newAccountId,
      evmAddress,
      encryptedAgentKey,
      agentBookNonce,
      agentBookContract: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
      agentBookAppId: "app_a7c3e2b6b83927251a0db5345bd7146a",
      agentBookAction: "agentbook-registration",
    });
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
