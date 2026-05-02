import { useCallback, useEffect, useMemo, useState } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { useParentStatus } from '@/lib/ens/useParentStatus';
import { useRegisterSpecialist } from '@/lib/ens/useRegisterSpecialist';
import type { SpecialistRecords } from '@/lib/networkConfig';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

type SignerMode = 'wallet' | 'server';

type ServerStatus = {
    registrarAddress: string;
    parentDomain: string;
    parentNode: string;
    isWrapped: boolean;
    parentOwner: string | null;
    canRegister: boolean;
    reason?: string;
};

type ServerRegisterResult = {
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
    records: SpecialistRecords;
};

const DEFAULT_RECORDS: SpecialistRecords = {
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

function StepLabel({ step }: { step: ReturnType<typeof useRegisterSpecialist>['step'] }) {
    const map: Record<typeof step, string> = {
        idle: '',
        registering: 'Waiting for signature…',
        confirming: 'Waiting for confirmation…',
        success: '✓ Registered',
        error: 'Error',
    };
    if (!map[step]) return null;
    return <p className="text-xs text-zinc-500">{map[step]}</p>;
}

export default function EnsTestPage() {
    const [mode, setMode] = useState<SignerMode>('wallet');

    const [label, setLabel] = useState('test-specialist');
    const [records, setRecords] = useState<SpecialistRecords>(DEFAULT_RECORDS);

    // ── Wallet (frontend) mode ─────────────────────────────────────────────
    const walletStatus = useParentStatus();
    const {
        step: walletStep,
        error: walletError,
        result: walletResult,
        txHash: walletTxHash,
        register: walletRegister,
        reset: walletReset,
        isBusy: walletBusy,
    } = useRegisterSpecialist();

    // ── Server (private-key) mode ──────────────────────────────────────────
    const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
    const [serverStatusError, setServerStatusError] = useState<string | null>(null);
    const [serverStatusLoading, setServerStatusLoading] = useState(false);
    const [serverOwnerOverride, setServerOwnerOverride] = useState('');
    const [serverRegistering, setServerRegistering] = useState(false);
    const [serverResult, setServerResult] = useState<ServerRegisterResult | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);

    const loadServerStatus = useCallback(async () => {
        setServerStatusLoading(true);
        setServerStatusError(null);
        try {
            const r = await fetch('/api/ens/status');
            const j = await r.json();
            if (!j.success) throw new Error(j.error ?? 'unknown error');
            setServerStatus(j.status);
        } catch (e) {
            setServerStatusError(e instanceof Error ? e.message : String(e));
        } finally {
            setServerStatusLoading(false);
        }
    }, []);

    useEffect(() => {
        if (mode === 'server' && !serverStatus && !serverStatusLoading) {
            loadServerStatus();
        }
    }, [mode, serverStatus, serverStatusLoading, loadServerStatus]);

    // ── Read panel ─────────────────────────────────────────────────────────
    const [readName, setReadName] = useState('');
    const [reading, setReading] = useState(false);
    const [readResult, setReadResult] = useState<ReadResult | null>(null);
    const [readError, setReadError] = useState<string | null>(null);

    // ── Derived values ─────────────────────────────────────────────────────
    const parentDomain =
        mode === 'wallet' ? walletStatus.parentDomain : (serverStatus?.parentDomain ?? '…');

    const fullName = useMemo(
        () => (label ? `${label}.${parentDomain}` : ''),
        [label, parentDomain],
    );
    const validLabel = /^[a-z0-9-]{3,63}$/.test(label);

    const canRegister =
        mode === 'wallet' ? walletStatus.canRegister : Boolean(serverStatus?.canRegister);
    const isBusy = mode === 'wallet' ? walletBusy : serverRegistering;

    useEffect(() => {
        if (walletResult) setReadName(walletResult.fullName);
    }, [walletResult]);
    useEffect(() => {
        if (serverResult) setReadName(serverResult.fullName);
    }, [serverResult]);

    // ── Actions ────────────────────────────────────────────────────────────
    const onRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validLabel) return;

        if (mode === 'wallet') {
            walletRegister(label, records);
            return;
        }

        // server mode
        setServerRegistering(true);
        setServerError(null);
        setServerResult(null);
        try {
            const r = await fetch('/api/ens/register-specialist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label,
                    records,
                    owner: serverOwnerOverride || undefined,
                }),
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error ?? 'unknown error');
            setServerResult(j.result);
        } catch (e) {
            setServerError(e instanceof Error ? e.message : String(e));
        } finally {
            setServerRegistering(false);
        }
    };

    const onResetAfterRun = () => {
        if (mode === 'wallet') walletReset();
        else {
            setServerResult(null);
            setServerError(null);
        }
    };

    const showResetButton =
        (mode === 'wallet' && (walletStep === 'success' || walletStep === 'error')) ||
        (mode === 'server' && (serverResult || serverError));

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
            <Navbar />
            <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-10">
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">ENS Specialist Registry — Sepolia</h1>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Register a specialist subname under a wrapped parent domain. Choose
                        whether the connected wallet signs in your browser, or the server signs
                        with the registrar private key.
                    </p>
                </header>

                {/* Mode toggle */}
                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
                    <h2 className="font-semibold">Signer</h2>
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="radio"
                                name="signer-mode"
                                checked={mode === 'wallet'}
                                onChange={() => setMode('wallet')}
                                className="mt-1"
                            />
                            <span>
                                <span className="block text-sm font-medium">Frontend wallet (via registrar contract)</span>
                                <span className="block text-xs text-zinc-500">
                                    Any wallet can register. One signature, one tx — the
                                    SpecialistRegistrar contract mints, sets records, and
                                    transfers the subname to the caller.
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="radio"
                                name="signer-mode"
                                checked={mode === 'server'}
                                onChange={() => setMode('server')}
                                className="mt-1"
                            />
                            <span>
                                <span className="block text-sm font-medium">Server (private key)</span>
                                <span className="block text-xs text-zinc-500">
                                    Server signs with <code className={geistMono.className}>ENS_REGISTRAR_PRIVATE_KEY</code>. Owner is the
                                    registrar by default, or any address you specify.
                                </span>
                            </span>
                        </label>
                    </div>
                </section>

                {/* Status panel */}
                {mode === 'wallet' ? (
                    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
                        <h2 className="font-semibold">Registrar contract</h2>
                        <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-1 gap-x-4 text-sm">
                            <dt className="text-zinc-500">Connected wallet</dt>
                            <dd className="font-mono break-all">{walletStatus.connectedAddress ?? '—'}</dd>
                            <dt className="text-zinc-500">Parent domain</dt>
                            <dd className="font-mono">{walletStatus.parentDomain}</dd>
                            <dt className="text-zinc-500">Wrapped?</dt>
                            <dd>{walletStatus.isLoading ? '…' : walletStatus.isWrapped ? 'yes' : 'no'}</dd>
                            <dt className="text-zinc-500">Parent owner</dt>
                            <dd className="font-mono break-all">{walletStatus.parentOwner ?? '—'}</dd>
                            <dt className="text-zinc-500">Registrar contract</dt>
                            <dd className="font-mono break-all">{walletStatus.registrarAddress}</dd>
                            <dt className="text-zinc-500">Approved by parent?</dt>
                            <dd>
                                {walletStatus.isLoading
                                    ? '…'
                                    : walletStatus.registrarApproved
                                        ? <span className="text-green-600 dark:text-green-400">yes</span>
                                        : <span className="text-amber-600 dark:text-amber-400">no</span>}
                            </dd>
                            <dt className="text-zinc-500">Can register?</dt>
                            <dd>
                                {walletStatus.isLoading ? (
                                    '…'
                                ) : walletStatus.canRegister ? (
                                    <span className="text-green-600 dark:text-green-400">yes</span>
                                ) : (
                                    <span className="text-amber-600 dark:text-amber-400">
                                        no — {walletStatus.reason}
                                    </span>
                                )}
                            </dd>
                        </dl>
                    </section>
                ) : (
                    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold">Registrar status</h2>
                            <button
                                onClick={loadServerStatus}
                                disabled={serverStatusLoading}
                                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                {serverStatusLoading ? 'Refreshing…' : 'Refresh'}
                            </button>
                        </div>
                        {serverStatusError && (
                            <p className="text-sm text-red-600 dark:text-red-400">{serverStatusError}</p>
                        )}
                        {serverStatus && (
                            <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-1 gap-x-4 text-sm">
                                <dt className="text-zinc-500">Registrar wallet</dt>
                                <dd className="font-mono break-all">{serverStatus.registrarAddress}</dd>
                                <dt className="text-zinc-500">Parent domain</dt>
                                <dd className="font-mono">{serverStatus.parentDomain}</dd>
                                <dt className="text-zinc-500">Wrapped?</dt>
                                <dd>{serverStatus.isWrapped ? 'yes' : 'no'}</dd>
                                <dt className="text-zinc-500">Parent owner</dt>
                                <dd className="font-mono break-all">{serverStatus.parentOwner ?? '—'}</dd>
                                <dt className="text-zinc-500">Can register?</dt>
                                <dd>
                                    {serverStatus.canRegister ? (
                                        <span className="text-green-600 dark:text-green-400">yes</span>
                                    ) : (
                                        <span className="text-amber-600 dark:text-amber-400">
                                            no — {serverStatus.reason}
                                        </span>
                                    )}
                                </dd>
                            </dl>
                        )}
                    </section>
                )}

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
                                    .{parentDomain}
                                </span>
                            </div>
                            {label && !validLabel && (
                                <p className="mt-1 text-xs text-red-600">3–63 chars, lowercase letters / digits / hyphens.</p>
                            )}
                            {fullName && validLabel && (
                                <p className="mt-1 text-xs text-zinc-500">Full name: <span className="font-mono">{fullName}</span></p>
                            )}
                        </div>

                        {mode === 'server' && (
                            <div>
                                <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">
                                    Owner (optional — defaults to registrar wallet)
                                </label>
                                <input
                                    value={serverOwnerOverride}
                                    onChange={(e) => setServerOwnerOverride(e.target.value)}
                                    className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="0x..."
                                />
                                {serverOwnerOverride && (
                                    <p className="mt-1 text-xs text-amber-600">
                                        When owner ≠ registrar, text records are NOT set in this call. The owner must call multicall themselves.
                                    </p>
                                )}
                            </div>
                        )}

                        {mode === 'wallet' && walletStatus.connectedAddress && validLabel && (
                            <p className="text-xs text-zinc-500">
                                Owner will be{' '}
                                <span className="font-mono">{walletStatus.connectedAddress}</span> (the connected wallet).
                            </p>
                        )}

                        <fieldset className="space-y-3">
                            <legend className="text-xs uppercase tracking-wide text-zinc-500">Text records</legend>
                            {(Object.keys(records) as Array<keyof SpecialistRecords>).map((key) => (
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

                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={!validLabel || isBusy || !canRegister}
                                className="flex-1 py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 transition-colors"
                            >
                                {isBusy
                                    ? mode === 'wallet'
                                        ? 'Working…'
                                        : 'Registering…'
                                    : 'Register specialist'}
                            </button>
                            {showResetButton && (
                                <button
                                    type="button"
                                    onClick={onResetAfterRun}
                                    className="px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                                >
                                    Reset
                                </button>
                            )}
                        </div>

                        {/* Wallet-mode progress */}
                        {mode === 'wallet' && (
                            <>
                                <StepLabel step={walletStep} />
                                {walletTxHash && (
                                    <div className="text-sm">
                                        <ExplorerLink hash={walletTxHash} label="register tx" />
                                    </div>
                                )}
                                {walletError && (
                                    <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                                        {walletError.message}
                                    </div>
                                )}
                                {walletResult && (
                                    <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm space-y-1.5">
                                        <p className="font-medium text-green-800 dark:text-green-300">
                                            ✓ {walletResult.fullName} registered
                                        </p>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                            Owner: <span className="font-mono">{walletResult.owner}</span>
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Server-mode result */}
                        {mode === 'server' && (
                            <>
                                {serverError && (
                                    <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                                        {serverError}
                                    </div>
                                )}
                                {serverResult && (
                                    <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm space-y-1.5">
                                        <p className="font-medium text-green-800 dark:text-green-300">
                                            ✓ {serverResult.fullName} registered
                                        </p>
                                        <p>
                                            <ExplorerLink hash={serverResult.subdomainTx} label="subdomain tx" />
                                        </p>
                                        {serverResult.recordsTx && serverResult.recordsTx !== '0x' && (
                                            <p>
                                                <ExplorerLink hash={serverResult.recordsTx} label="records tx" />
                                            </p>
                                        )}
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                            Owner: <span className="font-mono">{serverResult.owner}</span>
                                        </p>
                                    </div>
                                )}
                            </>
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
                                placeholder={`postgres-debug.${parentDomain}`}
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
                                    {(Object.keys(readResult.records) as Array<keyof SpecialistRecords>).map((k) => (
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
                    <p>
                        Set{' '}
                        <code className={geistMono.className}>NEXT_PUBLIC_ENS_PARENT_DOMAIN</code>{' '}
                        and (for server mode){' '}
                        <code className={geistMono.className}>ENS_REGISTRAR_PRIVATE_KEY</code> in{' '}
                        <code className={geistMono.className}>.env.local</code>.
                    </p>
                </footer>
            </main>
        </div>
    );
}
