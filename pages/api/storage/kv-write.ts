import type { NextApiRequest, NextApiResponse } from "next";
import { Indexer } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const RPC_URL = "https://evmrpc-testnet.0g.ai";
const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const privateKey = process.env["0G_PRIVATE_KEY"];
  if (!privateKey) {
    return res.status(500).json({
      success: false,
      error: "Missing 0G_PRIVATE_KEY in .env.local",
    });
  }

  const { key, value } = req.body;
  if (!key || !value) {
    return res.status(400).json({
      success: false,
      error: "Provide 'key' and 'value' in the request body",
    });
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(INDEXER_RPC);

    // For KV store, we encode key-value as JSON content and upload as file
    const content = JSON.stringify({
      sparkKey: key,
      sparkValue: value,
      timestamp: new Date().toISOString(),
      type: "knowledge-item",
    });

    // Write to temp file and upload
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const tmpFile = path.join(os.tmpdir(), `spark-kv-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, content, "utf-8");

    const { ZgFile } = await import("@0gfoundation/0g-ts-sdk");
    const zgFile = await ZgFile.fromFilePath(tmpFile);
    const [merkleTree, treeErr] = await zgFile.merkleTree();

    if (treeErr || !merkleTree) {
      fs.unlinkSync(tmpFile);
      return res.status(500).json({
        success: false,
        error: "Merkle tree generation failed: " + String(treeErr),
      });
    }

    const rootHash = merkleTree.rootHash();
    const [uploadResult, uploadErr] = await indexer.upload(zgFile, RPC_URL, signer);

    fs.unlinkSync(tmpFile);

    if (uploadErr) {
      return res.status(500).json({
        success: false,
        error: "KV upload failed: " + String(uploadErr),
      });
    }

    return res.status(200).json({
      success: true,
      key,
      rootHash,
      txHash: "txHash" in uploadResult ? uploadResult.txHash : uploadResult.txHashes[0],
      message: "Key-value pair stored on 0G Storage",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
