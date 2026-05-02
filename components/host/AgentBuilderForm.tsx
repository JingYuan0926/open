"use client";

import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon } from "@/components/ui/Icon";
import {
  useParentStatus,
  useRegisterSpecialist,
} from "@/lib/ens/SpecialistRegistrar";
import { isValidLabel } from "@/lib/ens-registry";
import type { SpecialistRecords } from "@/lib/networkConfig";

const DEFAULT_AXL_PUBKEY = "0x" + "00".repeat(32);
const DEFAULT_TOKEN_ID = "1";
const DEFAULT_VERSION = "0.1.0";

function shortAddress(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function ExplorerLink({ hash, label }: { hash: string; label?: string }) {
  if (!hash || hash === "0x") return null;
  return (
    <a
      href={`https://sepolia.etherscan.io/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-700 underline font-mono text-[11.5px] break-all"
    >
      {label ? `${label}: ` : ""}
      {hash.slice(0, 10)}…{hash.slice(-8)}
    </a>
  );
}

export function AgentBuilderForm() {
  const [name, setName] = React.useState("Migration Specialist");
  const [skill, setSkill] = React.useState("Database migrations");
  const [desc, setDesc] = React.useState(
    "Plans and previews schema migrations with reversible defaults. Will not apply destructive changes without an approval card.",
  );
  const [price, setPrice] = React.useState("0.16");
  const [runtime, setRuntime] = React.useState("Node 20 · isolated VM");
  const [axlPubkey, setAxlPubkey] = React.useState(DEFAULT_AXL_PUBKEY);
  const [tokenId, setTokenId] = React.useState(DEFAULT_TOKEN_ID);
  const [version, setVersion] = React.useState(DEFAULT_VERSION);

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agent";
  const labelValid = isValidLabel(slug);

  const status = useParentStatus();
  const { step, error, result, txHash, register, reset, isBusy } =
    useRegisterSpecialist();

  const fullName = `${slug}.${status.parentDomain}`;
  const workspaceUri = `0g://ws/agents/${slug}/v1`;

  const records: SpecialistRecords = React.useMemo(
    () => ({
      axlPubkey,
      skills: skill,
      workspaceUri,
      tokenId,
      price,
      version,
    }),
    [axlPubkey, skill, workspaceUri, tokenId, price, version],
  );

  const onPublish = () => {
    if (!labelValid) return;
    register(slug, records);
  };

  const showResetButton = step === "success" || step === "error";

  const headerBadge =
    step === "success" ? (
      <Badge variant="success" dot>
        Registered
      </Badge>
    ) : step === "registering" ? (
      <Badge variant="info" dot>
        Awaiting signature
      </Badge>
    ) : step === "confirming" ? (
      <Badge variant="info" dot>
        Confirming
      </Badge>
    ) : step === "error" ? (
      <Badge variant="danger" dot>
        Failed
      </Badge>
    ) : (
      <Badge variant="info">Draft</Badge>
    );

  return (
    <Card>
      <CardHeader icon={<Icon name="plus" size={14} />}>
        <div className="flex items-center gap-2.5">
          <span className="flex-1">Publish a new specialist</span>
          {headerBadge}
        </div>
      </CardHeader>
      <div className="p-4 grid grid-cols-[1.4fr_1fr] gap-4 max-[1080px]:grid-cols-1">
        <div className="grid gap-3.5">
          <Field
            label="Agent name"
            hint="Shown to users when this specialist is summoned. Slugified into the ENS label."
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            {!labelValid && (
              <div className="text-[11.5px] text-red-700">
                Slug “{slug}” is invalid — needs 3–63 chars of lowercase
                letters, digits, hyphens.
              </div>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Skill category" hint="Comma-separated for multiple.">
              <Input value={skill} onChange={(e) => setSkill(e.target.value)} />
            </Field>
            <Field label="Price per call" hint="In 0G tokens.">
              <div className="flex items-center gap-1.5">
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </Field>
          </div>
          <Field
            label="Persona / description"
            hint="Off-chain — not part of the ENS records (lives in the 0G profile)."
          >
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
            />
          </Field>
          <Field label="Runtime">
            <Input
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
            />
          </Field>

          <Disclosure title="Advanced — on-chain text records" icon="settings">
            <div className="grid gap-2.5">
              <Field
                label="axl_pubkey"
                hint="32-byte ed25519 pubkey for AXL traffic. Default = zero bytes (placeholder)."
              >
                <Input
                  value={axlPubkey}
                  onChange={(e) => setAxlPubkey(e.target.value)}
                  className="font-mono text-[12px]"
                />
              </Field>
              <Field label="0g_token_id" hint="iNFT token id on 0G Chain.">
                <Input
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  className="font-mono text-[12px]"
                />
              </Field>
              <Field label="version" hint="semver, e.g. 0.1.0">
                <Input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="font-mono text-[12px]"
                />
              </Field>
            </div>
          </Disclosure>
        </div>

        <div className="grid gap-3 content-start">
          <div className="text-[12.5px] font-medium text-ink-2">
            Identity preview
          </div>
          <Disclosure
            title="ENS subname"
            icon="globe"
            defaultOpen
            right={
              <Badge variant={labelValid ? "info" : "warn"} mono>
                {labelValid ? "resolves" : "invalid slug"}
              </Badge>
            }
          >
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">
                // Specialists are discoverable via ENS
              </div>
              {fullName}
            </div>
          </Disclosure>
          <Disclosure title="0G Storage URI" icon="database" defaultOpen>
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">// Encrypted memory + task logs</div>
              {workspaceUri}
            </div>
          </Disclosure>
          <Disclosure title="AXL public key" icon="key">
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">
                // Used for inter-agent traffic auth
              </div>
              {axlPubkey.length > 26
                ? `${axlPubkey.slice(0, 18)}…${axlPubkey.slice(-8)}`
                : axlPubkey}
            </div>
          </Disclosure>
          <Disclosure title="iNFT identity" icon="cube">
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">
                // Ownership, memory pointer, payment rules
              </div>
              iNFT #{tokenId} · owner:{" "}
              {shortAddress(status.connectedAddress ?? null)}
            </div>
          </Disclosure>

          {!status.connectedAddress ? (
            <div className="text-[11.5px] text-ink-3 mt-1">
              Connect a wallet to publish — it will own the new ENS subname.
            </div>
          ) : status.isLoading ? (
            <div className="text-[11.5px] text-ink-3">
              Checking parent-domain approval…
            </div>
          ) : !status.canRegister ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900 break-words">
              {status.reason ?? "Registrar is not ready."}
            </div>
          ) : null}

          <div className="flex gap-2 mt-1">
            {!status.connectedAddress ? (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => (
                  <Button
                    variant="primary"
                    icon="arrow-up-right"
                    onClick={openConnectModal}
                    disabled={!mounted}
                  >
                    Connect wallet
                  </Button>
                )}
              </ConnectButton.Custom>
            ) : (
              <Button
                variant="primary"
                icon="arrow-up-right"
                onClick={onPublish}
                disabled={!labelValid || isBusy || !status.canRegister}
              >
                {step === "registering"
                  ? "Sign in wallet…"
                  : step === "confirming"
                    ? "Confirming…"
                    : "Publish Specialist"}
              </Button>
            )}
            <Button variant="secondary" icon="play">
              Preview
            </Button>
            {showResetButton && (
              <Button variant="ghost" onClick={reset}>
                Reset
              </Button>
            )}
          </div>

          {txHash && (
            <div>
              <ExplorerLink hash={txHash} label="register tx" />
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 break-words">
              {error.message}
            </div>
          )}
          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 space-y-0.5">
              <div className="font-medium">✓ {result.fullName} registered</div>
              <div>
                Owner:{" "}
                <span className="font-mono">{shortAddress(result.owner)}</span>
              </div>
            </div>
          )}

          <div className="text-[11.5px] text-ink-3">
            Publishing mints a wrapped ENS subname under {status.parentDomain},
            sets six text records, and transfers it to your wallet — one
            signature.
          </div>
        </div>
      </div>
    </Card>
  );
}
