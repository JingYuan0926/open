import Head from "next/head";
import { useState } from "react";

type ApiState = { loading: boolean; ok?: boolean; data?: unknown; error?: string };

async function postJSON(path: string, body: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: r.ok, status: r.status, data };
}

function ResultPanel({ state }: { state: ApiState | null }) {
  if (!state) return null;
  if (state.loading) {
    return <div className="mt-2 text-xs text-zinc-500">Running…</div>;
  }
  if (state.error) {
    return (
      <pre className="mt-2 max-h-64 overflow-auto rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        {state.error}
      </pre>
    );
  }
  return (
    <pre
      className={`mt-2 max-h-64 overflow-auto rounded p-2 text-xs ${
        state.ok
          ? "bg-zinc-100 dark:bg-zinc-900"
          : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
      }`}
    >
      {JSON.stringify(state.data, null, 2)}
    </pre>
  );
}

function Card({
  title,
  endpoint,
  children,
}: {
  title: string;
  endpoint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <code className="truncate text-[10px] text-zinc-500">POST {endpoint}</code>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        {...props}
        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
    </label>
  );
}

function TextArea({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-zinc-600 dark:text-zinc-400">{label}</span>
      <textarea
        {...props}
        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
    </label>
  );
}

function RunButton({ onClick, loading, children }: { onClick: () => void; loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      {loading ? "Running…" : children}
    </button>
  );
}

function useApi() {
  const [state, setState] = useState<ApiState | null>(null);
  async function run(path: string, body: unknown) {
    setState({ loading: true });
    try {
      const { ok, data } = await postJSON(path, body);
      setState({ loading: false, ok, data });
    } catch (e) {
      setState({ loading: false, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return [state, run] as const;
}

function ListServicesCard() {
  const [state, run] = useApi();
  return (
    <Card title="List inference services" endpoint="/api/0g/compute-list-services">
      <RunButton loading={state?.loading} onClick={() => run("/api/0g/compute-list-services", {})}>
        List
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function SetupAccountCard() {
  const [state, run] = useApi();
  const [action, setAction] = useState("get-balance");
  const [amount, setAmount] = useState("0.5");
  const [provider, setProvider] = useState("");
  const [service, setService] = useState("inference");
  return (
    <Card title="Ledger / sub-account" endpoint="/api/0g/compute-setup-account">
      <label className="block text-xs">
        <span className="mb-1 block text-zinc-600 dark:text-zinc-400">action</span>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="get-balance">get-balance</option>
          <option value="create-ledger">create-ledger</option>
          <option value="deposit">deposit</option>
          <option value="transfer">transfer</option>
        </select>
      </label>
      {(action === "create-ledger" || action === "deposit" || action === "transfer") && (
        <Field label="amount (A0GI)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      )}
      {action === "transfer" && (
        <>
          <Field label="provider address" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="0x..." />
          <label className="block text-xs">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">service</span>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="inference">inference</option>
              <option value="fine-tuning">fine-tuning</option>
            </select>
          </label>
        </>
      )}
      <RunButton
        loading={state?.loading}
        onClick={() =>
          run("/api/0g/compute-setup-account", {
            action,
            amount,
            provider: provider || undefined,
            service,
          })
        }
      >
        Run action
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function InferenceCard() {
  const [state, run] = useApi();
  const [provider, setProvider] = useState("0xa48f01287233509FD694a22Bf840225062E67836");
  const [message, setMessage] = useState("Hello in one sentence.");
  return (
    <Card title="Run inference" endpoint="/api/0g/compute-inference">
      <Field label="provider address" value={provider} onChange={(e) => setProvider(e.target.value)} />
      <TextArea label="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      <RunButton
        loading={state?.loading}
        onClick={() => run("/api/0g/compute-inference", { provider, message })}
      >
        Send
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function StorageUploadCard() {
  const [state, run] = useApi();
  const [content, setContent] = useState("hello 0g storage");
  const [encrypted, setEncrypted] = useState(false);
  return (
    <Card title="Upload to 0G Storage" endpoint="/api/0g/storage-upload">
      <TextArea label="content" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={encrypted} onChange={(e) => setEncrypted(e.target.checked)} />
        encrypt (AES-256-GCM)
      </label>
      <RunButton
        loading={state?.loading}
        onClick={() => run("/api/0g/storage-upload", { content, encrypted })}
      >
        Upload
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function StorageDownloadCard() {
  const [state, run] = useApi();
  const [rootHash, setRootHash] = useState("");
  const [shouldDecrypt, setShouldDecrypt] = useState(false);
  return (
    <Card title="Download from 0G Storage" endpoint="/api/0g/storage-download">
      <Field label="rootHash" value={rootHash} onChange={(e) => setRootHash(e.target.value)} placeholder="0x..." />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={shouldDecrypt} onChange={(e) => setShouldDecrypt(e.target.checked)} />
        decrypt
      </label>
      <RunButton
        loading={state?.loading}
        onClick={() => run("/api/0g/storage-download", { rootHash, decrypt: shouldDecrypt })}
      >
        Download
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function StorageKvWriteCard() {
  const [state, run] = useApi();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  return (
    <Card title="KV write" endpoint="/api/0g/storage-kv-write">
      <Field label="key" value={key} onChange={(e) => setKey(e.target.value)} />
      <TextArea label="value" rows={2} value={value} onChange={(e) => setValue(e.target.value)} />
      <RunButton
        loading={state?.loading}
        onClick={() => run("/api/0g/storage-kv-write", { key, value })}
      >
        Write
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function InftUploadConfigCard() {
  const [state, run] = useApi();
  const [botId, setBotId] = useState("spark-test-bot");
  const [persona, setPersona] = useState("test specialist");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful test specialist.");
  const [modelProvider, setModelProvider] = useState("0g-compute");
  const [apiKey, setApiKey] = useState("");
  const [domainTags, setDomainTags] = useState("");
  const [serviceOfferings, setServiceOfferings] = useState("");
  return (
    <Card title="Upload agent config (iNFT data)" endpoint="/api/0g/inft-upload-config">
      <Field label="botId" value={botId} onChange={(e) => setBotId(e.target.value)} />
      <Field label="persona" value={persona} onChange={(e) => setPersona(e.target.value)} />
      <label className="block text-xs">
        <span className="mb-1 block text-zinc-600 dark:text-zinc-400">modelProvider</span>
        <select
          value={modelProvider}
          onChange={(e) => setModelProvider(e.target.value)}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="0g-compute">0g-compute</option>
          <option value="openai">openai</option>
          <option value="groq">groq</option>
          <option value="deepseek">deepseek</option>
        </select>
      </label>
      {modelProvider !== "0g-compute" && (
        <Field label="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
      )}
      <TextArea label="systemPrompt" rows={3} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      <Field label="domainTags" value={domainTags} onChange={(e) => setDomainTags(e.target.value)} />
      <Field label="serviceOfferings" value={serviceOfferings} onChange={(e) => setServiceOfferings(e.target.value)} />
      <RunButton
        loading={state?.loading}
        onClick={() =>
          run("/api/0g/inft-upload-config", {
            botId,
            persona,
            modelProvider,
            systemPrompt,
            apiKey: apiKey || undefined,
            domainTags,
            serviceOfferings,
          })
        }
      >
        Upload config
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function InftInferCard() {
  const [state, run] = useApi();
  const [tokenId, setTokenId] = useState("1");
  const [message, setMessage] = useState("Hi specialist!");
  const [userAddress, setUserAddress] = useState("");
  const [maxTokens, setMaxTokens] = useState("500");
  return (
    <Card title="iNFT infer" endpoint="/api/0g/inft-infer">
      <Field label="tokenId" value={tokenId} onChange={(e) => setTokenId(e.target.value)} />
      <Field label="userAddress (optional)" value={userAddress} onChange={(e) => setUserAddress(e.target.value)} placeholder="0x..." />
      <Field label="maxTokens" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
      <TextArea label="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      <RunButton
        loading={state?.loading}
        onClick={() =>
          run("/api/0g/inft-infer", {
            tokenId,
            message,
            userAddress: userAddress || undefined,
            maxTokens: Number(maxTokens) || 500,
          })
        }
      >
        Infer
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function InftChatFallbackCard() {
  const [state, run] = useApi();
  const [message, setMessage] = useState("Hello!");
  return (
    <Card title="Chat fallback (env-keyed OpenAI)" endpoint="/api/0g/inft-chat-fallback">
      <TextArea label="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      <RunButton
        loading={state?.loading}
        onClick={() => run("/api/0g/inft-chat-fallback", { message })}
      >
        Chat
      </RunButton>
      <ResultPanel state={state} />
    </Card>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{children}</h2>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export default function ZeroGPlayground() {
  return (
    <>
      <Head>
        <title>0G playground</title>
      </Head>
      <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900 dark:bg-black dark:text-zinc-100">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">0G playground</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Exercise every <code className="text-xs">/api/0g/*</code> route — Compute, Storage, iNFT.
            </p>
          </header>

          <div className="grid gap-8 lg:grid-cols-3">
            <div>
              <SectionTitle hint="0G Compute Network (decentralized inference)">Compute</SectionTitle>
              <div className="space-y-4">
                <ListServicesCard />
                <SetupAccountCard />
                <InferenceCard />
              </div>
            </div>

            <div>
              <SectionTitle hint="0G Storage (content-addressed, optional AES-256-GCM)">Storage</SectionTitle>
              <div className="space-y-4">
                <StorageUploadCard />
                <StorageDownloadCard />
                <StorageKvWriteCard />
              </div>
            </div>

            <div>
              <SectionTitle hint="ERC-7857 SPARK iNFT specialist agents">iNFT</SectionTitle>
              <div className="space-y-4">
                <InftUploadConfigCard />
                <InftInferCard />
                <InftChatFallbackCard />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
