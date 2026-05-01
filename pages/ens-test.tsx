import { useCallback, useEffect, useState } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

type Status = {
    registrarAddress: string;
    parentDomain: string;
    parentNode: string;
    isWrapped: boolean;
    parentOwner: string | null;
    canRegister: boolean;
    reason?: string;
};

type Records = {
    axlPubkey: string;
    skills: string;
    workspaceUri: string;
    tokenId: string;
    price: string;
    version: string;
};

type RegisterResult = {
    fullName: string;
    subdomainNode: string;
    subdomainTx: string;
    recordsTx: string;
    owner: string;
};

type ReadResult = {
    fullName: string;
    node: string;
    isWrapped: boolean;
    owner: string | null;
    records: Records;
};

const DEFAULT_RECORDS: Records = {
    axlPubkey: '0x' + '00'.repeat(32),
    skills: 'postgres-debug,linux-troubleshoot',
    workspaceUri: '0g://workspace/example',
    tokenId: '1',
    price: '0.05',
    version: '0.1.0',
};

function ExplorerLink({ hash, label }: { hash: string; label?: string }) {
    if (!hash || hash === '0x') return null;
    return (
        <a
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline font-mono text-xs break-all"
        >
            {label ? `${label}: ` : ''}
            {hash.slice(0, 10)}…{hash.slice(-8)}
        </a>
    );
}

export default function EnsTestPage() {
    const [status, setStatus] = useState<Status | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);

    const [label, setLabel] = useState('test-specialist');
    const [owner, setOwner] = useState('');
    const [records, setRecords] = useState<Records>(DEFAULT_RECORDS);

    const [registering, setRegistering] = useState(false);
    const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null);
    const [registerError, setRegisterError] = useState<string | null>(null);

    const [readName, setReadName] = useState('');
    const [reading, setReading] = useState(false);
    const [readResult, setReadResult] = useState<ReadResult | null>(null);
    const [readError, setReadError] = useState<string | null>(null);

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        setStatusError(null);
        try {
            const r = await fetch('/api/ens/status');
            const j = await r.json();
            if (!j.success) throw new Error(j.error ?? 'unknown error');
            setStatus(j.status);
        } catch (e) {
            setStatusError(e instanceof Error ? e.message : String(e));
        } finally {
            setStatusLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const fullName = status && label ? `${label}.${status.parentDomain}` : '';
    const validLabel = /^[a-z0-9-]{3,63}$/.test(label);

    const onRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validLabel) return;
        setRegistering(true);
        setRegisterError(null);
        setRegisterResult(null);
        try {
            const r = await fetch('/api/ens/register-specialist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label,
                    records,
                    owner: owner || undefined,
                }),
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error ?? 'unknown error');
            setRegisterResult(j.result);
            setReadName(j.result.fullName);
        } catch (e) {
            setRegisterError(e instanceof Error ? e.message : String(e));
        } finally {
            setRegistering(false);
        }
    };

    const onRead = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!readName) return;
        setReading(true);
        setReadError(null);
        setReadResult(null);
        try {
            const r = await fetch(`/api/ens/read-specialist?name=${encodeURIComponent(readName)}`);
            const j = await r.json();
            if (!j.success) throw new Error(j.error ?? 'unknown error');
            setReadResult(j.result);
        } catch (e) {
            setReadError(e instanceof Error ? e.message : String(e));
        } finally {
            setReading(false);
        }
    };

    return (
        <div
            className={`${geistSans.className} ${geistMono.variable} min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
        >
            <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-10">
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">ENS Specialist Registry — Sepolia test</h1>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Register a specialist subname under your wrapped parent domain and read its text records back.
                    </p>
                </header>

                {/* Status panel */}
                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">Registrar status</h2>
                        <button
                            onClick={loadStatus}
                            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            disabled={statusLoading}
                        >
                            {statusLoading ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                    {statusError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{statusError}</p>
                    )}
                    {status && (
                        <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-1 gap-x-4 text-sm">
                            <dt className="text-zinc-500">Registrar wallet</dt>
                            <dd className="font-mono break-all">{status.registrarAddress}</dd>
                            <dt className="text-zinc-500">Parent domain</dt>
                            <dd className="font-mono">{status.parentDomain}</dd>
                            <dt className="text-zinc-500">Wrapped?</dt>
                            <dd>{status.isWrapped ? 'yes' : 'no'}</dd>
                            <dt className="text-zinc-500">Parent owner</dt>
                            <dd className="font-mono break-all">{status.parentOwner ?? '—'}</dd>
                            <dt className="text-zinc-500">Can register?</dt>
                            <dd>
                                {status.canRegister ? (
                                    <span className="text-green-600 dark:text-green-400">yes</span>
                                ) : (
                                    <span className="text-amber-600 dark:text-amber-400">
                                        no — {status.reason}
                                    </span>
                                )}
                            </dd>
                        </dl>
                    )}
                </section>

                {/* Register form */}
                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
                    <h2 className="font-semibold">Register a specialist subname</h2>
                    <form onSubmit={onRegister} className="space-y-4">
                        <div>
                            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Label</label>
                            <div className="flex">
                                <input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value.toLowerCase())}
                                    className="flex-1 px-3 py-2 rounded-l-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="postgres-debug"
                                />
                                <span className="px-3 py-2 rounded-r-md border border-l-0 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm">
                                    .{status?.parentDomain ?? '…'}
                                </span>
                            </div>
                            {label && !validLabel && (
                                <p className="mt-1 text-xs text-red-600">3–63 chars, lowercase letters / digits / hyphens.</p>
                            )}
                            {fullName && validLabel && (
                                <p className="mt-1 text-xs text-zinc-500">Full name: <span className="font-mono">{fullName}</span></p>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">
                                Owner (optional — defaults to registrar wallet)
                            </label>
                            <input
                                value={owner}
                                onChange={(e) => setOwner(e.target.value)}
                                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="0x..."
                            />
                            {owner && (
                                <p className="mt-1 text-xs text-amber-600">
                                    Note: when owner ≠ registrar, text records are NOT set in this tx (the owner must call multicall themselves).
                                </p>
                            )}
                        </div>

                        <fieldset className="space-y-3">
                            <legend className="text-xs uppercase tracking-wide text-zinc-500">Text records</legend>
                            {(Object.keys(records) as Array<keyof Records>).map((key) => (
                                <div key={key}>
                                    <label className="block text-xs text-zinc-500 mb-1">{key}</label>
                                    <input
                                        value={records[key]}
                                        onChange={(e) => setRecords({ ...records, [key]: e.target.value })}
                                        className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            ))}
                        </fieldset>

                        <button
                            type="submit"
                            disabled={!validLabel || registering || !status?.canRegister}
                            className="w-full py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 transition-colors"
                        >
                            {registering ? 'Registering…' : 'Register specialist'}
                        </button>

                        {registerError && (
                            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                                {registerError}
                            </div>
                        )}

                        {registerResult && (
                            <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm space-y-1.5">
                                <p className="font-medium text-green-800 dark:text-green-300">
                                    ✓ {registerResult.fullName} registered
                                </p>
                                <p>
                                    <ExplorerLink hash={registerResult.subdomainTx} label="subdomain tx" />
                                </p>
                                {registerResult.recordsTx && registerResult.recordsTx !== '0x' && (
                                    <p>
                                        <ExplorerLink hash={registerResult.recordsTx} label="records tx" />
                                    </p>
                                )}
                                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                    Owner: <span className="font-mono">{registerResult.owner}</span>
                                </p>
                            </div>
                        )}
                    </form>
                </section>

                {/* Read form */}
                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
                    <h2 className="font-semibold">Read a specialist&apos;s records</h2>
                    <form onSubmit={onRead} className="space-y-3">
                        <div className="flex gap-2">
                            <input
                                value={readName}
                                onChange={(e) => setReadName(e.target.value)}
                                placeholder={`postgres-debug.${status?.parentDomain ?? 'righthand.eth'}`}
                                className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="submit"
                                disabled={!readName || reading}
                                className="px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 disabled:opacity-40"
                            >
                                {reading ? 'Reading…' : 'Read'}
                            </button>
                        </div>
                    </form>

                    {readError && (
                        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                            {readError}
                        </div>
                    )}

                    {readResult && (
                        <div className="space-y-2 text-sm">
                            <dl className="grid grid-cols-[140px_1fr] gap-y-1 gap-x-4">
                                <dt className="text-zinc-500">Wrapped?</dt>
                                <dd>{readResult.isWrapped ? 'yes' : 'no'}</dd>
                                <dt className="text-zinc-500">Owner</dt>
                                <dd className="font-mono break-all">{readResult.owner ?? '—'}</dd>
                            </dl>
                            <details open className="mt-2">
                                <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
                                    Text records
                                </summary>
                                <dl className="grid grid-cols-[140px_1fr] gap-y-1 gap-x-4 mt-2">
                                    {(Object.keys(readResult.records) as Array<keyof Records>).map((k) => (
                                        <div key={k} className="contents">
                                            <dt className="text-zinc-500 font-mono text-xs">{k}</dt>
                                            <dd className="font-mono text-xs break-all">
                                                {readResult.records[k] || <span className="text-zinc-400">—</span>}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </details>
                        </div>
                    )}
                </section>

                <footer className="text-xs text-zinc-500 space-y-1">
                    <p>Network: Sepolia · NameWrapper: 0x0635…fCe8 · Public Resolver: 0xE996…E9b5</p>
                    <p>Set <code className={geistMono.className}>ENS_REGISTRAR_PRIVATE_KEY</code> and <code className={geistMono.className}>ENS_PARENT_DOMAIN</code> in <code className={geistMono.className}>.env.local</code>.</p>
                </footer>
            </main>
        </div>
    );
}
