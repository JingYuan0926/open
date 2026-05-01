@AGENTS.md

# ENS specialist registry

Each specialist (AI agent) gets a wrapped ENS subname under a parent domain.
The subname carries six text records on the public resolver:

| key                | meaning                              |
|--------------------|--------------------------------------|
| `axl_pubkey`       | Axelar / messaging pubkey            |
| `skills`           | comma-separated skill tags           |
| `0g_workspace_uri` | 0G Storage URI for the agent profile |
| `0g_token_id`      | iNFT token id on 0G Chain            |
| `price`            | per-call price in 0G tokens          |
| `version`          | semver, e.g. `0.1.0`                 |

Network: **Sepolia**. Parent: **`righthand.eth`** (wrapped in NameWrapper, owned by `0x7dEC10140F6a10DBDC0b9b4d8ba4D468B1B8E6E6`).

## On-chain components

| contract                | address (Sepolia)                              | role                                                      |
|-------------------------|------------------------------------------------|-----------------------------------------------------------|
| ENS NameWrapper         | `0x0635513f179D50A207757E05759CbD106d7dFcE8`   | wraps ENS names as ERC-1155, mints subnames               |
| ENS Public Resolver     | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5`   | stores `text(node, key)` records                          |
| `SpecialistRegistrar`   | `0x03e69a73090A7E8392bC54BC24316a326020B128`   | one-tx subname mint + records + transfer to caller       |

The parent owner has called `NameWrapper.setApprovalForAll(SpecialistRegistrar, true)`, so the registrar can mint subnames of `righthand.eth` on anyone's behalf. If you redeploy the contract you must re-run that approval (see `contracts/scripts/approve-registrar.ts`).

## Two registration paths

The page `/ens-test` exposes both via a "Signer" radio. They share the records form and the read panel.

### A. Frontend wallet via `SpecialistRegistrar` (default)

- Any connected wallet calls `register(label, records)` on the registrar.
- The contract `setSubnodeRecord(parent, label, address(this), resolver, 0, 0, parentExpiry)`, then 6× `setText`, then `safeTransferFrom(this, msg.sender, …)`. **One signature, one tx, caller pays gas, caller becomes owner.**
- Hook: [`lib/ens/useRegisterSpecialist.ts`](lib/ens/useRegisterSpecialist.ts) — `useWriteContract` + `useWaitForTransactionReceipt`. Step machine: `idle → registering → confirming → success | error`.
- Status hook: [`lib/ens/useParentStatus.ts`](lib/ens/useParentStatus.ts) — reads `isWrapped`, `ownerOf`, and `isApprovedForAll(parentOwner, SPECIALIST_REGISTRAR_ADDRESS)`. `canRegister` is true iff parent is wrapped AND registrar is approved.

### B. Server private-key flow (legacy, still wired)

- Browser POSTs to `/api/ens/register-specialist` with `{label, records, owner?}`.
- Server uses `ENS_REGISTRAR_PRIVATE_KEY` to sign two txs: `setSubnodeRecord` then `multicall([setText × 6])` on the resolver.
- If `owner` is overridden to a non-registrar address, the records-tx is skipped (the new owner must `multicall` themselves) — the response returns `recordsTx: '0x'`.
- Status: `GET /api/ens/status` → `{ registrarAddress, parentOwner, canRegister, ... }`.
- Server module: [`lib/ens-registry.ts`](lib/ens-registry.ts) (`getRegistrar`, `getRegistrarStatus`, `registerSpecialist`).

### Read path (both modes share)

- Server route `GET /api/ens/read-specialist?name=foo.righthand.eth` → `{ isWrapped, owner, records }`.
- Implementation: `readSpecialist(fullName)` in `lib/ens-registry.ts`, viem public client over Sepolia RPC. No private key needed.

## File map

```
contracts/
  contracts/SpecialistRegistrar.sol          # one-tx registrar, ERC1155Receiver
  ignition/modules/SpecialistRegistrar.ts    # Ignition deploy module
  scripts/approve-registrar.ts               # parent owner → setApprovalForAll
lib/
  networkConfig.ts                           # chains + ENS addresses + parent domain
  abis/
    NameWrapper.ts                           # subset: setSubnodeRecord, ownerOf, isWrapped, set/isApprovedForAll
    PublicResolver.ts                        # subset: setText, text, multicall
    SpecialistRegistrar.ts                   # register(label, Records), parentNode, event
  ens-registry.ts                            # server reads + private-key writes + shared encoders
  ens/
    useParentStatus.ts                       # wagmi: parent + registrar approval
    useRegisterSpecialist.ts                 # wagmi: contract.register() with step machine
  providers.tsx                              # RainbowKit + wagmi + react-query wrapper
components/
  Navbar.tsx                                 # ConnectButton.Custom with useEnsName/useEnsAvatar
pages/
  _app.tsx                                   # wraps Component in <Providers>
  ens-test.tsx                               # mode toggle + register form + read form
  api/ens/
    status.ts                                # server-mode registrar status
    register-specialist.ts                   # server-mode write (private key)
    read-specialist.ts                       # public read (no key)
```

## Required environment (`.env.local`)

| var                                   | scope                | purpose                                                  |
|---------------------------------------|----------------------|----------------------------------------------------------|
| `NEXT_PUBLIC_ENS_PARENT_DOMAIN`       | client + server      | parent domain (`righthand.eth`); read by viem `namehash` |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL`         | client (wagmi)       | wallet transport / wagmi reads                           |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`| client               | optional; injected wallets work without it               |
| `ENS_REGISTRAR_PRIVATE_KEY`           | server only          | required for server-mode signing; not used by wallet mode |
| `SEPOLIA_RPC_URL`                     | server fallback      | used by `lib/ens-registry.ts` viem `publicClient`        |
| `ENS_PARENT_DOMAIN`                   | server fallback      | only consulted if `NEXT_PUBLIC_ENS_PARENT_DOMAIN` unset  |

The contract address is hardcoded in `lib/networkConfig.ts` (`SPECIALIST_REGISTRAR_ADDRESS`), not env-driven — it's a deployment artifact, not a secret.

For the contracts package, `contracts/.env` needs `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` (Hardhat reads via `dotenv` + `configVariable`).

## Redeploy procedure

The contract is approved on NameWrapper by address. If you redeploy, the previous approval is meaningless — the new contract instance must be re-approved.

1. Edit the contract.
2. Compile: `cd contracts && ./node_modules/.bin/hardhat compile`.
3. Compute parentNode: `node -e "import('viem').then(v=>console.log(v.namehash('righthand.eth')))"`.
4. Deploy:
   ```bash
   yes | ./node_modules/.bin/hardhat ignition deploy ignition/modules/SpecialistRegistrar.ts \
     --network sepolia \
     --parameters '{"SpecialistRegistrarModule":{"parentNode":"0x..."}}'
   ```
5. Approve from parent owner: `set -a && source .env && set +a && REGISTRAR_ADDRESS=0x... npx tsx scripts/approve-registrar.ts`.
6. Update `SPECIALIST_REGISTRAR_ADDRESS` in `lib/networkConfig.ts`.

If the parent domain itself changes you also need to redeploy — `parentNode` is `immutable` in the contract.

## Gotchas

- **Subname squat is currently possible.** `register(label, …)` does not check if `label` is already taken. Because the contract is approved on the *parent*, NameWrapper's auth check passes regardless of the subname's existing owner — a second `register("alice", …)` overwrites the original owner's record and transfers the wrapped token away. Fix is one line: `if (nameWrapper.isWrapped(subnode)) revert AlreadyRegistered();` in `register()`. Requires a redeploy + re-approval.
- **Records-only update isn't supported.** The contract only mints+writes. To edit an existing subname's records, the current owner has to call `multicall` on the resolver themselves (or you add an `updateRecords` path).
- **Subname expiry inherits parent.** The contract passes `parentExpiry` to `setSubnodeRecord`; if the parent's registration lapses, all subnames lapse with it.
- **Wallet mode requires `NEXT_PUBLIC_ENS_PARENT_DOMAIN` to match the contract's `parentNode`.** They're independent values today — keep them in sync, or move to reading `parentNode` off-chain via `useReadContract` and stop relying on the env var.
- **ENS resolution uses `ENS_CHAIN_ID` (Sepolia), not mainnet.** `useEnsName`/`useEnsAvatar` in [Navbar.tsx](components/Navbar.tsx) only resolve names registered on Sepolia ENS. Drop the `chainId` arg or add `mainnet` to `chains` if you want mainnet primary names.
- **Discovery is event-based.** The contract emits `SpecialistRegistered(node, owner, label)` but does not store an enumerable list. To list all specialists: `eth_getLogs` on the registrar, or the ENS subgraph for "subdomains of righthand.eth".
- **Don't trust string-equality on addresses.** Always lower-case both sides before comparing (`a.toLowerCase() === b.toLowerCase()`); checksummed strings differ otherwise.
