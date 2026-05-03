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
import { SPARKINFT_ADDRESS } from "@/lib/sparkinft-abi";

const DEFAULT_AXL_PUBKEY = "0x" + "00".repeat(32);
const DEFAULT_VERSION = "0.1.0";

function inftUrl(tokenId: string) {
  return `https://chainscan-galileo.0g.ai/nft/${SPARKINFT_ADDRESS}/${tokenId}`;
}

type MintStep = "idle" | "minting" | "minted" | "error";

function shortAddress(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function SepoliaTxLink({ hash, label }: { hash: string; label?: string }) {
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

function ZeroGTxLink({ hash, label }: { hash: string; label?: string }) {
  if (!hash || hash === "0x") return null;
  return (
    <a
      href={`https://chainscan-galileo.0g.ai/tx/${hash}`}
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
  const [version, setVersion] = React.useState(DEFAULT_VERSION);

  // iNFT mint state — populated by /api/0g/mint-inft before ENS register.
  const [mintStep, setMintStep] = React.useState<MintStep>("idle");
  const [mintTokenId, setMintTokenId] = React.useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = React.useState<string | null>(null);
  const [mintError, setMintError] = React.useState<string | null>(null);

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agent";
  const labelValid = isValidLabel(slug);

  const status = useParentStatus();
  const {
    step: registerStep,
    error: registerError,
    result,
    txHash: registerTxHash,
    register,
    reset: resetRegister,
    isBusy: registerBusy,
  } = useRegisterSpecialist();

  const fullName = `${slug}.${status.parentDomain}`;
  // Until the iNFT is minted we don't have a tokenId, so the workspace URI
  // is shown as a placeholder. The actual value written into ENS uses the
  // post-mint tokenId — see `onPublish` below.
  const workspaceUriPreview =
    mintTokenId !== null ? inftUrl(mintTokenId) : "(set after iNFT mint)";

  const isBusy = mintStep === "minting" || registerBusy;
  const isSuccess = registerStep === "success";
  const hasError = mintStep === "error" || registerStep === "error";

  const reset = React.useCallback(() => {
    setMintStep("idle");
    setMintTokenId(null);
    setMintTxHash(null);
    setMintError(null);
    resetRegister();
  }, [resetRegister]);

  const onPublish = async () => {
    if (!labelValid || !status.connectedAddress) return;

    // Step 1: mint iNFT on 0G Galileo (server-signed).
    setMintStep("minting");
    setMintError(null);
    setMintTokenId(null);
    setMintTxHash(null);

    let tokenId: string;
    try {
      const r = await fetch("/api/0g/mint-inft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: status.connectedAddress,
          botId: slug,
          domainTags: skill,
          serviceOfferings: desc,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "iNFT mint failed");
      tokenId = j.tokenId as string;
      setMintTokenId(tokenId);
      setMintTxHash(j.txHash as string);
      setMintStep("minted");
    } catch (e) {
      setMintError(e instanceof Error ? e.message : String(e));
      setMintStep("error");
      return;
    }

    // Step 2: register the ENS subname on Sepolia. The 0g_workspace_uri
    // text record now points at the freshly-minted iNFT on chainscan-galileo
    // (BlockScout-style /token/<contract>/instance/<id>).
    const records: SpecialistRecords = {
      axlPubkey,
      skills: skill,
      workspaceUri: inftUrl(tokenId),
      tokenId,
      price,
      version,
    };
    register(slug, records);
  };

  const showResetButton = isSuccess || hasError;

  const headerBadge = isSuccess ? (
    <Badge variant="success" dot>
      Registered
    </Badge>
  ) : mintStep === "minting" ? (
    <Badge variant="info" dot>
      Minting iNFT
    </Badge>
  ) : registerStep === "registering" ? (
    <Badge variant="info" dot>
      Awaiting signature
    </Badge>
  ) : registerStep === "confirming" ? (
    <Badge variant="info" dot>
      Confirming
    </Badge>
  ) : hasError ? (
    <Badge variant="danger" dot>
      Failed
    </Badge>
  ) : (
    <Badge variant="info">Draft</Badge>
  );

  const buttonLabel =
    mintStep === "minting"
      ? "Minting iNFT…"
      : registerStep === "registering"
        ? "Sign in wallet…"
        : registerStep === "confirming"
          ? "Confirming…"
          : "Publish Specialist";

  const inftPreviewText =
    mintTokenId !== null
      ? `iNFT #${mintTokenId} · owner: ${shortAddress(status.connectedAddress ?? null)}`
      : mintStep === "minting"
        ? "iNFT — minting on 0G Galileo…"
        : `iNFT — minted on publish · to ${shortAddress(status.connectedAddress ?? null)}`;

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
            <Field label="Price per call" hint="In USDC.">
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
            hint="Stored as the iNFT's serviceOfferings on 0G Galileo."
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
              <Field label="version" hint="semver, e.g. 0.1.0">
                <Input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="font-mono text-[12px]"
                />
              </Field>
              <div className="text-[11.5px] text-ink-3">
                <code className="font-mono">0g_token_id</code> is set
                automatically from the iNFT minted on publish.
              </div>
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
              <div className="text-ink-4">{"// Specialists are discoverable via ENS"}</div>
              {fullName}
            </div>
          </Disclosure>
          <Disclosure title="0G iNFT URL" icon="database" defaultOpen>
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">{"// 0g_workspace_uri text record · points at the iNFT on chainscan-galileo"}</div>
              {workspaceUriPreview}
            </div>
          </Disclosure>
          <Disclosure title="AXL public key" icon="key">
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">{"// Used for inter-agent traffic auth"}</div>
              {axlPubkey.length > 26
                ? `${axlPubkey.slice(0, 18)}…${axlPubkey.slice(-8)}`
                : axlPubkey}
            </div>
          </Disclosure>
          <Disclosure
            title="iNFT identity"
            icon="cube"
            defaultOpen={mintTokenId !== null}
            right={
              mintTokenId !== null ? (
                <Badge variant="success" mono dot>
                  #{mintTokenId}
                </Badge>
              ) : mintStep === "minting" ? (
                <Badge variant="info" mono>
                  minting
                </Badge>
              ) : (
                <Badge variant="neutral" mono>
                  pending
                </Badge>
              )
            }
          >
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">{"// ERC-721 on 0G Galileo · ownership, memory, payment rules"}</div>
              {inftPreviewText}
            </div>
          </Disclosure>

          {!status.connectedAddress ? (
            <div className="text-[11.5px] text-ink-3 mt-1">
              Connect a wallet to publish — it will own the new iNFT and the
              ENS subname.
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
                {buttonLabel}
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

          {mintTxHash && (
            <div>
              <ZeroGTxLink hash={mintTxHash} label="iNFT mint tx (0G)" />
            </div>
          )}
          {registerTxHash && (
            <div>
              <SepoliaTxLink hash={registerTxHash} label="ENS register tx" />
            </div>
          )}
          {mintError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 break-words">
              iNFT mint failed: {mintError}
            </div>
          )}
          {registerError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 break-words">
              {registerError.message}
            </div>
          )}
          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 space-y-0.5">
              <div className="font-medium">✓ {result.fullName} registered</div>
              <div>
                Owner:{" "}
                <span className="font-mono">{shortAddress(result.owner)}</span>
              </div>
              {mintTokenId !== null && (
                <div>
                  iNFT: <span className="font-mono">#{mintTokenId}</span>
                </div>
              )}
            </div>
          )}

          <div className="text-[11.5px] text-ink-3">
            Publishing first mints an ERC-721 iNFT on 0G Galileo to your wallet
            (server-signed, no chain switch), then registers the ENS subname
            under {status.parentDomain} on Sepolia with the iNFT&rsquo;s token
            id baked into <code className="font-mono">0g_token_id</code> — one
            wallet signature on Sepolia.
          </div>
        </div>
      </div>
    </Card>
  );
}
