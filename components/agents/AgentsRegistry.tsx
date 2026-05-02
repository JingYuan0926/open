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

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md px-2.5 py-1.5">
      <div className="text-[10.5px] text-ink-4 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[12.5px] font-medium tabular-nums text-ink mt-0.5 truncate">
        {value}
      </div>
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
        <a
          href={`/api/ens/read-specialist?name=${s.fullName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[13px] text-ink hover:underline truncate"
          title="Read this specialist's ENS records"
        >
          {s.fullName}
        </a>
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
        <span className="font-mono text-ink-2">{shortAddr(s.owner)}</span>
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
        />
        <Stat
          label="iNFT"
          value={s.records.tokenId ? `#${s.records.tokenId}` : "—"}
        />
        <Stat label="AXL pubkey" value={<span className="font-mono">{axlShort}</span>} />
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
    </div>
  );
}
