"use client";

import * as React from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ENS_PARENT_DOMAIN } from "@/lib/networkConfig";
import {
  useAllSpecialists,
  type AnySpecialist,
} from "@/lib/ens/SpecialistRegistrar";
import { usePayAgent, type PayStep } from "@/lib/x402/payAgent";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function Copyable({
  value,
  title,
  className,
  children,
}: {
  value: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = React.useState(false);
  const handle = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === "function") {
      e.nativeEvent.stopImmediatePropagation();
    }
    if (!value) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={handle}
      title={copied ? "Copied!" : title ?? `Copy ${value}`}
      aria-label={title ?? `Copy ${value}`}
      className={`inline-flex items-center gap-1 text-left rounded px-1 -mx-1 cursor-copy hover:bg-surface-3 transition-colors ${className ?? ""}`}
    >
      <span className="truncate">{children}</span>
      <Icon
        name={copied ? "check" : "copy"}
        size={11}
        className={`shrink-0 ${copied ? "text-emerald-500" : "text-ink-3"}`}
      />
    </button>
  );
}

function Stat({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: React.ReactNode;
  copyValue?: string;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-md px-2.5 py-1.5">
      <div className="text-[10.5px] text-ink-4 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[12.5px] font-medium tabular-nums text-ink mt-0.5 truncate">
        {copyValue ? (
          <Copyable value={copyValue} title={`Copy ${label.toLowerCase()}`}>
            {value}
          </Copyable>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function PayBadge({ step }: { step: PayStep }) {
  if (step === "requesting")
    return (
      <Badge variant="info" dot>
        requesting 402
      </Badge>
    );
  if (step === "got-402")
    return (
      <Badge variant="info" dot>
        authorizing X-PAYMENT
      </Badge>
    );
  if (step === "paying")
    return (
      <Badge variant="info" dot>
        broadcasting on 0G…
      </Badge>
    );
  if (step === "success")
    return (
      <Badge variant="success" dot>
        paid
      </Badge>
    );
  if (step === "error")
    return (
      <Badge variant="danger" dot>
        failed
      </Badge>
    );
  return null;
}

function PayAgentControl({
  agentName,
  ownerAddress,
  priceOG,
}: {
  agentName: string;
  ownerAddress: string;
  priceOG: string;
}) {
  const { step, error, result, pay, reset, isBusy } = usePayAgent();
  const canPay = Boolean(priceOG) && Number(priceOG) > 0;

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="primary"
          size="sm"
          icon="cube"
          disabled={!canPay || isBusy}
          onClick={() =>
            pay({ agentName, ownerAddress, priceOG })
          }
        >
          {isBusy
            ? "Paying…"
            : canPay
              ? `Pay ${priceOG} USDC via x402`
              : "No price set"}
        </Button>
        <PayBadge step={step} />
        {step !== "idle" && step !== "paying" && step !== "requesting" && (
          <button
            type="button"
            onClick={reset}
            className="text-[11.5px] text-ink-3 hover:text-ink underline"
          >
            reset
          </button>
        )}
      </div>

      {step === "got-402" && (
        <div className="text-[11px] text-ink-3 font-mono leading-relaxed">
          ← 402 Payment Required · resubmitting with X-PAYMENT header…
        </div>
      )}

      {step === "success" && result && (
        <div className="text-[11.5px] text-ink-2 leading-relaxed">
          Sent <span className="font-mono">{result.amount} USDC</span> to{" "}
          <span className="font-mono">{shortAddr(result.payTo)}</span>{" "}
          on {result.network}.{" "}
          <a
            href={result.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline font-mono break-all"
          >
            {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)}
          </a>
        </div>
      )}

      {step === "error" && error && (
        <div className="text-[11.5px] text-red-700 leading-relaxed break-words">
          {error}
        </div>
      )}
    </div>
  );
}

function AgentListItem({
  s,
  isMine,
}: {
  s: AnySpecialist;
  isMine: boolean;
}) {
  const tags = s.records.skills
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const axlShort =
    s.records.axlPubkey && s.records.axlPubkey.length > 14
      ? `${s.records.axlPubkey.slice(0, 8)}…${s.records.axlPubkey.slice(-6)}`
      : s.records.axlPubkey || "—";
  const inftHref = s.records.workspaceUri || "";

  return (
    <Card className="p-4">
      <div className="flex items-start gap-2 mb-1.5 flex-wrap">
        <Copyable
          value={s.fullName}
          title="Copy ENS name"
          className="font-mono text-[13px] text-ink"
        >
          {s.fullName}
        </Copyable>
        {s.records.version && (
          <Badge variant="info" mono>
            v{s.records.version}
          </Badge>
        )}
        {isMine && (
          <Badge variant="success" dot>
            you own this
          </Badge>
        )}
      </div>
      <div className="text-[11.5px] text-ink-3 mb-2.5">
        owned by{" "}
        <Copyable
          value={s.owner}
          title="Copy owner address"
          className="font-mono text-ink-2"
        >
          {shortAddr(s.owner)}
        </Copyable>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-3 text-ink-2 text-[11.5px] font-medium border border-border"
            >
              {t}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-ink-4 italic mb-3">
          (no skills declared)
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 max-[480px]:grid-cols-1 mb-3">
        <Stat
          label="Price / call"
          value={s.records.price ? `${s.records.price} 0G` : "—"}
          copyValue={s.records.price || undefined}
        />
        <Stat
          label="iNFT"
          value={s.records.tokenId ? `#${s.records.tokenId}` : "—"}
          copyValue={s.records.tokenId || undefined}
        />
        <Stat
          label="AXL pubkey"
          value={<span className="font-mono">{axlShort}</span>}
          copyValue={s.records.axlPubkey || undefined}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {inftHref && (
          <a
            href={inftHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md bg-white text-ink border border-border hover:bg-surface-2 hover:border-border-strong transition-colors"
          >
            <Icon name="cube" size={12} />
            View iNFT
          </a>
        )}
        <a
          href={`/api/ens/read-specialist?name=${s.fullName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
        >
          <Icon name="globe" size={12} />
          ENS records
        </a>
      </div>

      <PayAgentControl
        agentName={s.fullName}
        ownerAddress={s.owner}
        priceOG={s.records.price}
      />
    </Card>
  );
}

export function AgentsRegistry() {
  const { address } = useAccount();
  const { data = [], isFetching, refetch, error } = useAllSpecialists();

  return (
    <div className="overflow-y-auto px-8 py-6 pb-16">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-[20px] font-medium tracking-tight m-0">Agents</h1>
          <p className="text-ink-3 text-[13.5px] mt-1">
            Public registry of every specialist ever registered through{" "}
            <span className="font-mono">SpecialistRegistrar</span>. Each entry
            is a wrapped subname under{" "}
            <span className="font-mono">{ENS_PARENT_DOMAIN}</span> with an iNFT
            on 0G Galileo.
          </p>
        </div>
        <Button
          variant="ghost"
          icon="refresh"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="text-[14px] font-medium">All specialists</div>
        <Badge variant="neutral">{data.length} registered</Badge>
        {error && <Badge variant="warn">Couldn&rsquo;t read chain</Badge>}
      </div>

      {isFetching && data.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-10 text-center text-[13px] text-ink-3">
          Loading on-chain registry…
        </div>
      ) : data.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-10 text-center text-[13px] text-ink-3">
          No specialists registered yet. Publish one from the{" "}
          <Link href="/host" className="text-ink underline">
            host console
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
          {data.map((s) => (
            <AgentListItem
              key={s.node}
              s={s}
              isMine={
                !!address &&
                address.toLowerCase() === s.owner.toLowerCase()
              }
            />
          ))}
        </div>
      )}

      <div className="text-[11.5px] text-ink-3 mt-6 flex items-center gap-1.5">
        <Icon name="shield" size={12} />
        Reads from <span className="font-mono">SpecialistRegistrar.getAll()</span>{" "}
        on Sepolia, then batches the six text records per node through
        Multicall3.
      </div>
      <div className="text-[11.5px] text-ink-3 mt-1.5 flex items-center gap-1.5">
        <Icon name="cube" size={12} />
        Pay buttons follow the{" "}
        <span className="font-mono">x402</span> protocol — first request
        receives <span className="font-mono">HTTP 402</span> with payment
        requirements, second request submits an{" "}
        <span className="font-mono">X-PAYMENT</span> header. The server uses{" "}
        <span className="font-mono">0G_PRIVATE_KEY</span> to push native 0G
        on Galileo (chainId 16602).
      </div>
    </div>
  );
}
