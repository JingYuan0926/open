import type { NextApiRequest, NextApiResponse } from "next";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import os from "os";
import { encrypt } from "@/lib/encrypt";

const RPC_URL = "https://evmrpc-testnet.0g.ai";
const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const privateKey = process.env.ZG_STORAGE_PRIVATE_KEY;
  if (!privateKey) {
    return res.status(500).json({
      success: false,
      error: "Missing ZG_STORAGE_PRIVATE_KEY in .env.local",
    });
  }

  const { content, encrypted: shouldEncrypt } = req.body;
  if (!content || typeof content !== "string") {
    return res.status(400).json({
      success: false,
      error: "Provide 'content' as a string in the request body",
    });
  }

  // Optionally encrypt content before uploading
  const finalContent = shouldEncrypt ? encrypt(content) : content;

  // Write content to a temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `spark-upload-${Date.now()}.txt`);

  try {
    fs.writeFileSync(tmpFile, finalContent, "utf-8");

    // Create signer
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(privateKey, provider);

    // Create ZgFile from temp path
    const zgFile = await ZgFile.fromFilePath(tmpFile);
    const [merkleTree, treeErr] = await zgFile.merkleTree();

    if (treeErr || !merkleTree) {
      return res.status(500).json({
        success: false,
        error: "Failed to generate merkle tree: " + String(treeErr),
      });
    }

    const rootHash = merkleTree.rootHash();

    // Upload to 0G Storage
    const indexer = new Indexer(INDEXER_RPC);
    const [uploadResult, uploadErr] = await indexer.upload(zgFile, RPC_URL, signer);

    if (uploadErr) {
      return res.status(500).json({
        success: false,
        error: "Upload failed: " + String(uploadErr),
      });
    }

    return res.status(200).json({
      success: true,
      rootHash,
      txHash: "txHash" in uploadResult ? uploadResult.txHash : uploadResult.txHashes[0],
      encrypted: !!shouldEncrypt,
      contentLength: content.length,
      message: shouldEncrypt
        ? "Encrypted content uploaded to 0G Storage (AES-256-GCM)"
        : "Content uploaded to 0G Storage (immutable, content-addressed)",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}
