"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEnsAvatar, useEnsName } from "wagmi";
import { ENS_CHAIN_ID } from "@/lib/networkConfig";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "ENS", href: "/ens-test" },
  { label: "Tasks", href: "/tasks" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/60 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-black/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Open
          </Link>
          <nav className="flex items-center gap-5">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <ConnectButton.Custom>
          {({
            account,
            chain,
            openAccountModal,
            openChainModal,
            openConnectModal,
            mounted,
          }) => {
            const ready = mounted;
            const connected = ready && account && chain;

            return (
              <div
                {...(!ready && {
                  "aria-hidden": true,
                  style: {
                    opacity: 0,
                    pointerEvents: "none",
                    userSelect: "none",
                  },
                })}
              >
                {!connected ? (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Connect Wallet
                  </button>
                ) : chain.unsupported ? (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500"
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
      </div>
    </header>
  );
}

function AccountPill({
  address,
  fallbackLabel,
  onClick,
}: {
  address: `0x${string}`;
  fallbackLabel: string;
  onClick: () => void;
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
      className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1 pr-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
    >
      {ensAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ensAvatar}
          alt=""
          className="h-6 w-6 rounded-full"
        />
      ) : (
        <span className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500" />
      )}
      <span className="max-w-[160px] truncate">{label}</span>
    </button>
  );
}
