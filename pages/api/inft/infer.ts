import type { NextApiRequest, NextApiResponse } from "next";
import { createPublicClient, http } from "viem";
import { SPARKINFT_ADDRESS, SPARKINFT_ABI } from "@/lib/sparkinft-abi";
import { Indexer } from "@0gfoundation/0g-ts-sdk";
import { readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { decrypt } from "@/lib/encrypt";
import { getComputeBroker } from "@/lib/0g-compute";

const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

const zgTestnet = {
  id: 16602 as const,
  name: "0G-Galileo-Testnet" as const,
  nativeCurrency: { name: "0G" as const, symbol: "0G" as const, decimals: 18 as const },
  rpcUrls: { default: { http: [ZG_RPC] } },
} as const;

const viemClient = createPublicClient({
  chain: zgTestnet,
  transport: http(),
});

// Provider endpoint mapping
const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
};

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  deepseek: "deepseek-chat",
};

// 0G Compute testnet providers
const ZG_COMPUTE_PROVIDERS = [
  { address: "0xa48f01287233509FD694a22Bf840225062E67836", model: "qwen/qwen-2.5-7b-instruct" },
  { address: "0x8e60d466FD16798Bec4868aa4CE38586D5590049", model: "openai/gpt-oss-20b" },
  { address: "0x69Eb5a0BD7d0f4bF39eD5CE9Bd3376c61863aE08", model: "google/gemma-3-27b-it" },
];

/**
 * Call LLM via 0G Compute Network (decentralized GPU)
 */
async function callVia0GCompute(
  systemPrompt: string,
  message: string,
  maxTokens = 500
): Promise<{ reply: string; model: string; provider: string }> {
  const broker = await getComputeBroker();

  // Try each provider until one works
  let lastError: Error | null = null;
  for (const p of ZG_COMPUTE_PROVIDERS) {
    try {
      // Acknowledge provider if not already done
      const acked = await broker.inference.acknowledged(p.address);
      if (!acked) {
        await broker.inference.acknowledgeProviderSigner(p.address);
      }

      const { endpoint, model } = await broker.inference.getServiceMetadata(p.address);
      const headers = await broker.inference.getRequestHeaders(p.address, message);

      const resp = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`0G Compute ${p.model}: ${errText}`);
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || "No response";

      // Process response for billing
      try {
        await broker.inference.processResponse(p.address, data.id, reply);
      } catch { /* billing settle can fail silently */ }

      return { reply, model, provider: p.address };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`[0g-compute] Provider ${p.model} failed: ${lastError.message}`);
    }
  }
  throw new Error(`All 0G Compute providers failed. Last: ${lastError?.message}`);
}

interface AgentConfig {
  botId?: string;
  modelProvider: string;
  apiKey: string;
  encrypted?: boolean;
  systemPrompt: string;
  memory?: Record<string, unknown>;
  persona?: string;
  domainTags?: string;
  serviceOfferings?: string;
}

/**
 * Fetch agent config from 0G Storage using the rootHash from dataDescription
 */
async function fetchConfigFromStorage(
  dataDescription: string
): Promise<AgentConfig | null> {
  try {
    const rootHash = dataDescription.startsWith("0g://storage/")
      ? dataDescription.replace("0g://storage/", "")
      : null;
    if (!rootHash) return null;

    const indexer = new Indexer(ZG_INDEXER);
    const tmpPath = join(tmpdir(), `inft-download-${Date.now()}.json`);

    const err = await indexer.download(rootHash, tmpPath, true);
    if (err) return null;

    const content = readFileSync(tmpPath, "utf-8");
    unlinkSync(tmpPath);
    return JSON.parse(content) as AgentConfig;
  } catch {
    return null;
  }
}

/**
 * Call OpenAI-compatible API (OpenAI, Groq, DeepSeek)
 */
async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  message: string,
  maxTokens = 500
): Promise<string> {
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API error: ${errText}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "No response";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { tokenId, message, userAddress, maxTokens } = req.body;

  if (!tokenId || !message) {
    return res
      .status(400)
      .json({ error: "Missing tokenId or message" });
  }

  const callerAddress = userAddress || "0x0000000000000000000000000000000000000000";

  try {
    // 1. On-chain authorization check
    let owner: string | null = null;
    let isAuthorizedUser = false;

    try {
      const [ownerResult, authResult] = await Promise.all([
        viemClient.readContract({
          address: SPARKINFT_ADDRESS,
          abi: SPARKINFT_ABI,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        }),
        viemClient.readContract({
          address: SPARKINFT_ADDRESS,
          abi: SPARKINFT_ABI,
          functionName: "isAuthorized",
          args: [BigInt(tokenId), callerAddress as `0x${string}`],
        }),
      ]);
      owner = ownerResult as string;
      isAuthorizedUser = authResult as boolean;
    } catch {
      return res.status(404).json({
        error: `Token #${tokenId} does not exist. Mint an iNFT first.`,
      });
    }

    const isOwner = owner.toLowerCase() === callerAddress.toLowerCase();

    // Inference is public — log for audit but don't block
    if (!isOwner && !isAuthorizedUser) {
      console.log(`[infer] Public access: ${callerAddress} for token #${tokenId}`);
    }

    // 2. Read IntelligentData from on-chain (ERC-7857)
    const [intelligentDatas, profile] = await Promise.all([
      viemClient.readContract({
        address: SPARKINFT_ADDRESS,
        abi: SPARKINFT_ABI,
        functionName: "intelligentDatasOf",
        args: [BigInt(tokenId)],
      }),
      viemClient.readContract({
        address: SPARKINFT_ADDRESS,
        abi: SPARKINFT_ABI,
        functionName: "getAgentProfile",
        args: [BigInt(tokenId)],
      }),
    ]);

    const iDatas = intelligentDatas as {
      dataDescription: string;
      dataHash: string;
    }[];
    const p = profile as {
      botId: string;
      domainTags: string;
      serviceOfferings: string;
    };

    // 3. Fetch agent config from 0G Storage
    let agentConfig: AgentConfig | null = null;
    console.log(`[infer] tokenId=${tokenId}, iDatas count=${iDatas.length}`);
    if (iDatas.length > 0) {
      console.log(`[infer] dataDescription: ${iDatas[0].dataDescription}`);
      console.log(`[infer] dataHash: ${iDatas[0].dataHash}`);
    }
    if (iDatas.length > 0 && iDatas[0].dataDescription) {
      agentConfig = await fetchConfigFromStorage(iDatas[0].dataDescription);
      console.log(`[infer] agentConfig fetched: ${!!agentConfig}, provider: ${agentConfig?.modelProvider}, hasKey: ${!!agentConfig?.apiKey}, encrypted: ${agentConfig?.encrypted}`);
    }

    // 4a. If provider is 0G Compute — use decentralized GPU network (no API key needed)
    if (agentConfig && agentConfig.modelProvider?.toLowerCase() === "0g-compute") {
      const systemPrompt = agentConfig.systemPrompt || `You are ${p.botId}.`;
      const tokens = maxTokens || 500;

      try {
        const result = await callVia0GCompute(systemPrompt, message, tokens);
        return res.status(200).json({
          success: true,
          tokenId,
          agent: p.botId,
          response: result.reply,
          source: "0g-compute",
          model: result.model,
          provider: result.provider,
          configOnStorage: true,
        });
      } catch (err) {
        console.error(`[infer] 0G Compute failed:`, err);
        return res.status(502).json({
          error: `0G Compute inference failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // 4b. If we have a stored config with API key — decrypt and call the provider
    if (agentConfig && agentConfig.apiKey && agentConfig.modelProvider) {
      const provider = agentConfig.modelProvider.toLowerCase();
      const systemPrompt = agentConfig.systemPrompt || `You are ${p.botId}.`;
      const model = PROVIDER_DEFAULT_MODELS[provider] || "gpt-4o-mini";
      const tokens = maxTokens || 500;

      // Decrypt the API key (encrypted with AES-256-GCM on upload)
      let realApiKey: string;
      try {
        realApiKey = agentConfig.encrypted
          ? decrypt(agentConfig.apiKey)
          : agentConfig.apiKey;
        console.log(`[infer] Decrypted key OK, provider=${provider}, model=${model}, keyPrefix=${realApiKey.slice(0, 8)}...`);
      } catch (decErr) {
        console.error(`[infer] Decrypt failed:`, decErr);
        return res.status(500).json({
          error: "Failed to decrypt agent API key. Config may be corrupted.",
        });
      }

      const endpoint =
        PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openai;
      const reply = await callOpenAICompatible(
        endpoint,
        realApiKey,
        model,
        systemPrompt,
        message,
        tokens
      );

      return res.status(200).json({
        success: true,
        tokenId,
        agent: p.botId,
        response: reply,
        source: provider,
        configOnStorage: true,
      });
    }

    // 5. Fallback: use 0G Compute for any agent without a stored API key
    {
      const systemPrompt =
        agentConfig?.systemPrompt ||
        `You are ${p.botId}, a SPARK agent specializing in ${p.domainTags}. You offer ${p.serviceOfferings}. Keep responses concise and helpful.`;
      const tokens = maxTokens || 500;

      try {
        const result = await callVia0GCompute(systemPrompt, message, tokens);
        return res.status(200).json({
          success: true,
          tokenId,
          agent: p.botId,
          response: result.reply,
          source: "0g-compute",
          model: result.model,
          provider: result.provider,
          configOnStorage: !!agentConfig,
        });
      } catch (err) {
        console.error(`[infer] 0G Compute fallback failed:`, err);
        return res.status(502).json({
          error: `0G Compute inference failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
