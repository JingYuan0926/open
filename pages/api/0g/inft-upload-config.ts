import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { ZgFile, Indexer } from "@0gfoundation/0g-ts-sdk";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { keccak256, toUtf8Bytes } from "ethers";
import { encrypt } from "@/lib/encrypt";

const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const {
    botId,
    domainTags,
    serviceOfferings,
    systemPrompt,
    researchInstructions,
    modelProvider,
    apiKey,
    memory,
    persona,
  } = req.body;

  if (!botId || !systemPrompt) {
    return res.status(400).json({ error: "Missing botId or systemPrompt" });
  }

  if (!modelProvider) {
    return res.status(400).json({ error: "Missing modelProvider" });
  }

  const privateKey = process.env["0G_PRIVATE_KEY"];
  if (!privateKey || privateKey === "YOUR_PRIVATE_KEY_HERE") {
    return res
      .status(500)
      .json({ error: "0G_PRIVATE_KEY not configured in .env.local" });
  }

  try {
    // Build the agent config bundle — stored on 0G Storage
    const agentConfig: Record<string, unknown> = {
      version: "1.0.0",
      botId,
      persona: persona || botId,
      modelProvider, // "0g-compute" | "openai" | "groq" | "deepseek"
      systemPrompt,
      researchInstructions: researchInstructions || "",
      memory: memory || {},
      domainTags: domainTags || "",
      serviceOfferings: serviceOfferings || "",
      metadata: {
        created: new Date().toISOString(),
        type: "spark-agent",
        standard: "ERC-7857",
      },
    };

    // Only encrypt and store API key if provided (not needed for 0g-compute)
    if (apiKey) {
      agentConfig.apiKey = encrypt(apiKey);
      agentConfig.encrypted = true;
    }

    const configJson = JSON.stringify(agentConfig, null, 2);
    const configHash = keccak256(toUtf8Bytes(configJson));

    // Upload to 0G Storage
    const provider = new ethers.JsonRpcProvider(ZG_RPC);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(ZG_INDEXER);

    const tmpPath = join(tmpdir(), `spark-agent-${Date.now()}.json`);
    writeFileSync(tmpPath, configJson);

    const zgFile = await ZgFile.fromFilePath(tmpPath);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr || !tree) {
      throw new Error(`Merkle tree error: ${treeErr}`);
    }

    const rootHash = tree.rootHash();

    const [uploadResult, uploadErr] = await indexer.upload(zgFile, ZG_RPC, signer);
    if (uploadErr) {
      throw new Error(`Upload error: ${uploadErr}`);
    }

    await zgFile.close();
    unlinkSync(tmpPath);

    const dataDescription = `0g://storage/${rootHash}`;

    return res.status(200).json({
      success: true,
      dataDescription,
      dataHash: configHash,
      rootHash,
      txHash: "txHash" in uploadResult ? uploadResult.txHash : uploadResult.txHashes[0],
      // Return config without the API key for frontend display
      config: {
        ...agentConfig,
        ...(apiKey ? { apiKey: `${apiKey.slice(0, 8)}...` } : {}),
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
