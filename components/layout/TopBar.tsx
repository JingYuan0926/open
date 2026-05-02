import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEnsAvatar, useEnsName } from "wagmi";
import { Button } from "@/components/ui/Button";
import { ENS_CHAIN_ID } from "@/lib/networkConfig";
import clsx from "clsx";

export function TopBar({ crumbs, view, onSwitchView }: {
  crumbs: string[]; view: "user" | "host"; onSwitchView: (v: "user" | "host") => void;
}) {
  return (
    <header className="flex items-center gap-3 px-4 border-b border-border bg-white h-[52px]">
      <div className="flex items-center gap-2 text-ink-3 text-[13px]">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-ink-4">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-ink text-[13px]" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="inline-flex bg-surface-2 border border-border rounded-full p-0.5">
          {(["user","host"] as const).map((v) => (
            <button key={v} onClick={() => onSwitchView(v)}
              className={clsx("px-2.5 py-1 rounded-full text-[11.5px] font-medium",
                view === v ? "bg-white text-ink shadow-xs border border-border" : "text-ink-3 hover:text-ink")}>
              {v === "user" ? "User" : "Host"}
            </button>
          ))}
        </div>
        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            const ready = mounted;
            const connected = ready && account && chain;
            return (
              <div
                {...(!ready && {
                  "aria-hidden": true,
                  style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                })}
              >
                {!connected ? (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="rounded-full bg-accent text-accent-fg px-3 py-1 text-[12px] font-medium hover:bg-accent/90 whitespace-nowrap transition-colors"
                  >
                    Connect Wallet
                  </button>
                ) : chain.unsupported ? (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="rounded-full bg-red-600 text-white px-3 py-1 text-[12px] font-medium hover:bg-red-500 whitespace-nowrap transition-colors"
                  >
                    Wrong network
                  </button>
                ) : (
                  <AccountPill
                    address={account.address as `0x${string}`}
                    fallbackLabel={account.displayName}
                    onClick={openAccountModal}
                  />
                )}
              </div>
            );
          }}
        </ConnectButton.Custom>
        <Button variant="ghost" icon="bell" />
      </div>
    </header>
  );
}

function AccountPill({ address, fallbackLabel, onClick }: {
  address: `0x${string}`; fallbackLabel: string; onClick: () => void;
}) {
  const { data: ensName } = useEnsName({ address, chainId: ENS_CHAIN_ID });
  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: ENS_CHAIN_ID,
  });
  const label = ensName ?? fallbackLabel;
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex items-center gap-1.5 rounded-full border border-border bg-white px-1.5 py-1 pr-2.5 text-[12px] font-medium text-ink hover:bg-surface-2 transition-colors"
    >
      {ensAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ensAvatar} alt="" className="h-5 w-5 rounded-full" />
      ) : (
        <span className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500" />
      )}
      <span className="max-w-[140px] truncate">{label}</span>
    </button>
  );
}
