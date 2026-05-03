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

The production publish flow on `/host` populates two of these records automatically: `0g_token_id` from the iNFT minted just-in-time on 0G Galileo, and `0g_workspace_uri` from that iNFT's chainscan URL (`https://chainscan-galileo.0g.ai/nft/<contract>/<tokenId>`). The `/ens-test` page is the bare-wallet harness that lets you write whatever you like into all six.

## On-chain components

| contract                | address (Sepolia)                              | role                                                      |
|-------------------------|------------------------------------------------|-----------------------------------------------------------|
| ENS NameWrapper         | `0x0635513f179D50A207757E05759CbD106d7dFcE8`   | wraps ENS names as ERC-1155, mints subnames               |
| ENS Public Resolver     | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5`   | stores `text(node, key)` records                          |
| `SpecialistRegistrar` (v2) | `0xE8E40daf718010e3B5d07cd4A0b22333757D77Dd` | one-tx subname mint + records + transfer to caller; on-chain `getOwned(address)` mapping |

Plus on **0G Galileo testnet (chainId 16602)**:

| contract           | address (0G Galileo)                           | role                                            |
|--------------------|------------------------------------------------|-------------------------------------------------|
| `SPARKiNFT`        | `0xe457A01ce326977Ed7A56a02a9cA8a9C4468074A`   | ERC-721 iNFT minted before each ENS register   |

The parent owner has called `NameWrapper.setApprovalForAll(SpecialistRegistrar, true)` against the v2 contract, so the registrar can mint subnames of `righthand.eth` on anyone's behalf. If you redeploy the contract you must re-run that approval (see `contracts/scripts/approve-registrar.ts`). The previous v1 deployment at `0x03e6…0B128` is still approved by the parent owner — older subnames registered through it still work, they're just not visible to v2's `getOwned` view.

## Registration paths

Three flows exist, in increasing order of "how the product is meant to be used":

### A. Frontend wallet via `SpecialistRegistrar` (the dev harness — `/ens-test`)

- Any connected wallet calls `register(label, records)` on the registrar.
- The contract `setSubnodeRecord(parent, label, address(this), resolver, 0, 0, parentExpiry)`, then 6× `setText`, then `safeTransferFrom(this, msg.sender, …)`, then pushes the registration into `_ownedByCaller[msg.sender]`. **One signature, one tx, caller pays gas, caller becomes owner.**
- Hooks live in [`lib/ens/SpecialistRegistrar.ts`](lib/ens/SpecialistRegistrar.ts):
  - `useRegisterSpecialist` — `useWriteContract` + `useWaitForTransactionReceipt`. Step machine: `idle → registering → confirming → success | error`.
  - `useParentStatus` — reads `isWrapped`, `ownerOf`, and `isApprovedForAll(parentOwner, SPECIALIST_REGISTRAR_ADDRESS)`. `canRegister` is true iff parent is wrapped AND registrar is approved.
  - `useMySpecialists` — calls v2's `getOwned(address)` for the connected wallet, then batches the six `text(node, key)` reads through Multicall3. Drives the "Your specialists" grid in the host dashboard. Wrapped in `useQuery` with a 30 s `staleTime`.

### A2. Production publish — iNFT-then-ENS (the host dashboard — `/host`)

The [`AgentBuilderForm`](components/host/AgentBuilderForm.tsx) on `/host` is the canonical "publish a new specialist" UI. It runs **a server-side iNFT mint first, then the wallet's ENS register** so the user signs only once (Sepolia):

1. **Mint iNFT** (server-signed). POST `/api/0g/mint-inft` with `{ to: connectedAddress, botId: slug, domainTags: skill, serviceOfferings: desc }`. The server signs `SPARKiNFT.mintAgent(...)` on 0G Galileo with `0G_PRIVATE_KEY` and returns `{ tokenId, txHash }`. This works because `mintAgent` has no auth modifier; user pays no 0G gas and never switches chain.
2. **Register ENS** (user signs). The form then calls `useRegisterSpecialist().register(slug, { …, tokenId, workspaceUri: inftUrl(tokenId) })` where `inftUrl(id) = "https://chainscan-galileo.0g.ai/nft/" + SPARKINFT_ADDRESS + "/" + id`. The user's wallet signs the Sepolia tx, the contract pushes into `_ownedByCaller[msg.sender]`, and `useMySpecialists` picks it up on the next read.

Card-header badge tracks the combined state: `Draft → Minting iNFT → Awaiting signature → Confirming → Registered` (or `Failed`). There is no `0g_token_id` input field — it is derived from the mint's receipt event.

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
  contracts/SpecialistRegistrar.sol          # one-tx registrar, ERC1155Receiver,
                                             # _ownedByCaller mapping + getOwned/ownedCount views
  ignition/modules/SpecialistRegistrar.ts    # Ignition deploy module
  scripts/approve-registrar.ts               # parent owner → setApprovalForAll
lib/
  networkConfig.ts                           # chains + ENS addresses + parent domain
  sparkinft-abi.ts                           # SPARKINFT_ADDRESS (0G Galileo) + ABI
  abis/
    NameWrapper.ts                           # subset: setSubnodeRecord, ownerOf, isWrapped, set/isApprovedForAll
    PublicResolver.ts                        # subset: setText, text, multicall
    SpecialistRegistrar.ts                   # register, getOwned, ownedCount, parentNode, event
  ens-registry.ts                            # server reads + private-key writes + shared encoders
  ens/
    SpecialistRegistrar.ts                   # wagmi hooks: useParentStatus + useRegisterSpecialist + useMySpecialists
  providers.tsx                              # RainbowKit + wagmi + react-query wrapper
components/
  Navbar.tsx                                 # ConnectButton.Custom with useEnsName/useEnsAvatar
  layout/
    HostDashboard.tsx                        # /host overview — uses useMySpecialists for "Your specialists" grid
    TopBar.tsx                               # has a compact RainbowKit ConnectButton (replaces old static pill)
  host/
    AgentBuilderForm.tsx                     # production publish UI: server-mint iNFT → wallet ENS register
pages/
  _app.tsx                                   # wraps Component in <Providers>
  ens-test.tsx                               # bare-wallet harness: mode toggle + register form + read form
  host.tsx                                   # AppShell + HostDashboard
  api/ens/
    status.ts                                # server-mode registrar status
    register-specialist.ts                   # server-mode write (private key)
    read-specialist.ts                       # public read (no key)
  api/0g/
    mint-inft.ts                             # server-side mintAgent on 0G Galileo (uses 0G_PRIVATE_KEY)
```

## Required environment (`.env.local`)

| var                                   | scope                | purpose                                                  |
|---------------------------------------|----------------------|----------------------------------------------------------|
| `NEXT_PUBLIC_ENS_PARENT_DOMAIN`       | client + server      | parent domain (`righthand.eth`); read by viem `namehash` |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL`         | client (wagmi)       | wallet transport / wagmi reads                           |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`| client               | optional; injected wallets work without it               |
| `ENS_REGISTRAR_PRIVATE_KEY`           | server only          | required for server-mode signing; not used by wallet mode |
| `0G_PRIVATE_KEY`                      | server only          | signs `SPARKiNFT.mintAgent` on 0G Galileo for `/api/0g/mint-inft` (and the rest of `pages/api/0g/*`). Square-bracket env access only — name starts with a digit |
| `SEPOLIA_RPC_URL`                     | server fallback      | used by `lib/ens-registry.ts` viem `publicClient`        |
| `ENS_PARENT_DOMAIN`                   | server fallback      | only consulted if `NEXT_PUBLIC_ENS_PARENT_DOMAIN` unset  |

The contract address is hardcoded in `lib/networkConfig.ts` (`SPECIALIST_REGISTRAR_ADDRESS`), not env-driven — it's a deployment artifact, not a secret.

For the contracts package, `contracts/.env` needs `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` (Hardhat reads via `dotenv` + `configVariable`).

## Redeploy procedure

The contract is approved on NameWrapper by address. If you redeploy, the previous approval is meaningless — the new contract instance must be re-approved. Ignition keeps a per-deployment journal under `contracts/ignition/deployments/chain-11155111/`, so always pass a fresh `--deployment-id` or it'll think the existing artifact is still current and skip the deploy.

1. Edit the contract.
2. Compile: `cd contracts && ./node_modules/.bin/hardhat compile`.
3. Compute parentNode: `node -e "import('viem').then(v=>console.log(v.namehash('righthand.eth')))"`. For `righthand.eth` it's `0xfecdb4e9ca322d8347b5f7d2d7e087c7ff92e026e4b1b8e15aaa23e71af7f4f4`.
4. Deploy:
   ```bash
   yes | ./node_modules/.bin/hardhat ignition deploy ignition/modules/SpecialistRegistrar.ts \
     --network sepolia \
     --deployment-id specialist-registrar-vN \
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
- **Per-owner discovery is on-chain in v2; cross-owner discovery still isn't.** v2 stores `mapping(address => Registration[]) _ownedByCaller` and exposes `getOwned(address)` / `ownedCount(address)` — `useMySpecialists` calls these directly, no event scan. But this is **registration history**, not live ownership: if a wrapped subname is later transferred elsewhere on NameWrapper, the registrar can't observe it and the entry stays in the list. To enumerate every specialist across every owner you still need to scan `SpecialistRegistered` logs (or use the ENS subgraph for "subdomains of righthand.eth").
- **iNFT mint is server-signed.** `/api/0g/mint-inft` uses `0G_PRIVATE_KEY` to call `SPARKiNFT.mintAgent(to=connectedAddress, …)` on 0G Galileo, so the user signs only the Sepolia register tx — no chain switch, no 0G gas paid by the user. Works because `mintAgent` has no auth modifier; anyone can mint to any address. To make the user sign the mint themselves you'd need to add chain 16602 to wagmi's `chains` and switch via `useSwitchChain` twice.
- **Don't trust string-equality on addresses.** Always lower-case both sides before comparing (`a.toLowerCase() === b.toLowerCase()`); checksummed strings differ otherwise.

---

# ENS task marketplace

`TaskMarket` is an escrow-backed task board where every task is **also a wrapped ENS subname** at `task-{id}.righthand.eth` carrying records that describe it. The contract owns the subname for the task's lifetime so it can update the `status` record on lifecycle transitions. Budget is held in escrow at post time and split equally among everyone who signs on at complete time, with pull-pattern withdrawals.

Each task subname carries six records on the public resolver:

| key           | value                                                                |
|---------------|----------------------------------------------------------------------|
| `description` | the human-readable goal                                              |
| `skills`      | comma-separated skill tags (matches the specialist `skills` record)  |
| `budget`      | wei amount as a decimal string                                       |
| `deadline`    | unix seconds as a decimal string                                     |
| `creator`     | creator address as 0x… hex string                                    |
| `status`      | `open` → `completed` or `cancelled`                                  |

## On-chain components

| contract     | address (Sepolia)                              | role                                                  |
|--------------|------------------------------------------------|-------------------------------------------------------|
| `TaskMarket` | `0x940883516834A5e14036fA86AA0f5Ec649BfAdf9`   | escrow + per-task ENS subname mint + records + status |

The parent owner (`0x7dEC1014…`) has called `NameWrapper.setApprovalForAll(TaskMarket, true)`. This is **independent** of the `SpecialistRegistrar` approval — both contracts are operators on the same parent. Use `contracts/scripts/approve-registrar.ts` with `REGISTRAR_ADDRESS=0x...` to (re-)approve either contract.

## Lifecycle

1. **`postTask(description, skillTags, deadline, maxSpecialists) payable`** — caller locks `msg.value` as the budget. Contract checks its own approval, computes `task-{id}`, refuses with `LabelAlreadyTaken` if that subname is already wrapped, `setSubnodeRecord` to itself using `parentExpiry`, writes the six text records, pushes a `Task` (with `ensNode`), emits `TaskPosted(taskId, creator, ensNode, label)`.
2. **`signOn(taskId)`** — any address. Reverts on `TaskNotOpen`, `DeadlinePassed`, `TaskFull`, `AlreadySignedOn`. No skill check on-chain — the UI filters.
3. **`completeTask(taskId)`** — only the creator. Splits `budget / N` to each signed-on specialist's `withdrawable` balance; rounding dust returns to creator. Status flips to `Completed` and the `status` record is rewritten on the resolver.
4. **`cancelTask(taskId)`** — only the creator, only while no specialists have signed on. Refunds budget to creator's `withdrawable`; status → `cancelled` on resolver.
5. **`withdraw()`** — anyone with a positive `withdrawable` balance. CEI-ordered (zero balance, then `.call{value:…}("")`); a reverting recipient can't DoS anyone else.

## Frontend

| file                                                       | role                                                                                                                            |
|------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| [`pages/tasks.tsx`](pages/tasks.tsx)                       | post-task form + paginated task cards (status, budget, deadline, slots, signed-on list) + per-role buttons + withdraw card     |
| [`lib/ens/TaskMarket.ts`](lib/ens/TaskMarket.ts)           | `useTasks` (batched `useReadContracts`), `usePostTask`, `useSignOnTask`, `useCompleteTask`, `useCancelTask`, `useWithdraw`, `useWithdrawable` |
| [`lib/abis/TaskMarket.ts`](lib/abis/TaskMarket.ts)         | ABI + `TASK_STATUS` enum (`Open=0, Completed=1, Cancelled=2`)                                                                   |

Each task card links its ENS name to `/api/ens/read-specialist?name=task-{id}.righthand.eth` so the resolver records can be inspected immediately.

## Files added on top of the specialist registry

```
contracts/
  contracts/TaskMarket.sol               # escrow + per-task subname + status updates
  ignition/modules/TaskMarket.ts         # Ignition deploy module (parentNode param)
lib/
  abis/TaskMarket.ts                     # ABI + TASK_STATUS enum
  ens/
    TaskMarket.ts                        # wagmi hooks: useTasks + usePostTask + useSignOnTask + useCompleteTask + useCancelTask + useWithdraw + useWithdrawable
pages/
  tasks.tsx                              # /tasks UI
```

**Convention:** every smart contract has one ABI file (`lib/abis/<Contract>.ts`) and one wagmi-hooks file (`lib/ens/<Contract>.ts`). Co-locate all hooks for a contract in its file; only split a hook into its own file once it grows large enough to justify it (none currently do).

`TASK_MARKET_ADDRESS` is hardcoded in `lib/networkConfig.ts` (deployment artifact, same convention as `SPECIALIST_REGISTRAR_ADDRESS`).

## Gotchas

- **TaskMarket and SpecialistRegistrar share the parent (`righthand.eth`).** Specialist labels are free-form, task labels are `task-{id}` — they shouldn't normally collide. But `SpecialistRegistrar` still lacks the `isWrapped` check, so a specialist could deliberately register `task-1234` and block that future task post (`TaskMarket` reverts with `LabelAlreadyTaken`). Fix when you redeploy `SpecialistRegistrar`, or move tasks to a separate parent like `tasks.righthand.eth`.
- **Status records are point-in-time, written only on create/complete/cancel.** `signOn` does **not** rewrite the resolver — the live specialist roster lives on-chain via `getTaskSpecialists(taskId)`. Adding a `setText` per signOn is ~30k extra gas for marginal off-chain value.
- **No deadline enforcement on `completeTask`.** Creator can complete after the deadline; specialists who signed on have no on-chain recourse if the creator stays silent. A `claimAfterDeadline` would fix this.
- **Equal-split, all-or-nothing payout.** No partial completion, no weighted payouts. Off-chain coordination decides who does what; on-chain just splits the pot.
- **Creator-vs-specialist guard is UI-only.** The contract does not block creators from `signOn`'ing their own task; the page does (`!isCreator`). A direct contract call from the creator's wallet would succeed.
- **Posting is expensive (~400k+ gas).** One `setSubnodeRecord` + six `setText` calls per post. Acceptable on testnet; consider trimming or chain choice for mainnet.

---

# AXL transport layer (Phase 1, working)

A 3-Mac demo proving Right-Hand AI's P2P transport works across machines. Each Mac runs an AXL node + an Express A2A agent server (`@a2a-js/sdk`). All 3 peer to **Gensyn's public bootstrap nodes**, join the global Yggdrasil mesh, and address each other by ed25519 pubkey. No LAN coordination, no firewall fights, no IP commits — works across any networks with internet access.

## Roles (3 symmetric Macs)

| role      | purpose                                                                        |
|-----------|--------------------------------------------------------------------------------|
| `user`    | "the human's machine" in the eventual product. Receives CC of agent traffic; can also send directly to either agent. |
| `agent-b` | OpenClaw specialist #1. Echoes received text. Sends to `agent-c`, CCs `user`.  |
| `agent-c` | OpenClaw specialist #2. Same shape as `agent-b`, mirror of it.                 |

The role naming is the **production-aligned vocabulary** — `user` is what the chat-first UI eventually targets; the two `agent-*` roles are the swarm.

## Public-bootstrap topology

```
agent-b ──┐
          ├──> tls://34.46.48.224:9001     (Gensyn bootstrap)
agent-c ──┤    tls://136.111.135.206:9001  (Gensyn bootstrap)
          │
user    ──┘
```

All 3 nodes peer outbound to Gensyn's bootstrap. Yggdrasil routes mesh traffic transparently between them by pubkey. Discovery between our nodes happens via the bootstrap relays — no direct LAN connection needed.

**Why public-bootstrap and not LAN star:** the original star topology (one Mac as listener, two dialers) failed in practice on hackathon WiFi with AP isolation, separate VLANs, and Mac firewall surprises. The Gensyn team's [johnnyd9720](#) noted this is the canonical pattern; the only caveat is that `/topology` shows other AXL users' peers (we ignore them — we always address by pubkey, never by topology rank).

## A2A flow with CC pattern

Every "agent says X" event is **two A2A `message/send` calls** via `@a2a-js/sdk`:

1. To the actual conversation target (e.g. `agent-b → agent-c`)
2. CC'd to the `user` so its terminal shows the conversation in real time

CC suppression rules:

- `myRole === "user"` → no self-CC (user never sends to itself)
- `targetRole === "user"` → no CC (target IS the user, redundant)

Each send embeds `metadata.fromRole` so the receiver labels output `[agent-b → agent-c]` in the agent.ts log.

## Files

```
axl/
  peers.json                    # source of truth — 3 roles + pubkeys, NO IPs
                                # (public bootstrap means LAN IPs aren't needed)
  agent.ts                      # Express A2A server (tsx). Reads .axl/role,
                                # picks agent-card (User/Echo) and reply behaviour
                                # (user role ACKs "received"; agents echo).
  axl.ts                        # getTopology, AXLTopology types, matchesPeer
                                # (handles AXL's truncated X-From-Peer-Id quirk)
  node-config.json              # generated per-Mac, gitignored.
                                # Peers: [tls://34.46.48.224:9001, tls://136.111.135.206:9001]
  private.pem                   # ed25519 keypair, gitignored.
  SETUP.md                      # 1-page runbook + troubleshooting.

scripts/
  setup-axl.sh                  # macOS-only: brew install Go/jq/openssl,
                                # GOTOOLCHAIN=go1.25.5 (gvisor/go1.26 incompat),
                                # clone+build gensyn-ai/axl into .axl/,
                                # generate keypair, write node-config.json,
                                # persist MACHINE_ROLE to .axl/role.
  axl-start.sh                  # pre-flight kill orphans, start AXL node +
                                # tsx axl/agent.ts, write our pubkey back into
                                # peers.json, polling-wait on both processes.
  axl-send.ts                   # @a2a-js/sdk client. Fetches remote agent-card
                                # via GET /a2a/{peer}, overrides card.url to the
                                # local AXL forward endpoint, calls sendMessage().
                                # CC pattern: target + user (with suppression).
  axl-listen.sh                 # raw /recv polling loop (debug fallback;
                                # agent.ts is the primary listener).
  resolve-peer.ts               # tsx utility: stdin = X-From-Peer-Id header,
                                # stdout = matched role from peers.json via
                                # axl/axl.ts:matchesPeer().

.axl/                           # gitignored — cloned AXL repo + built node binary +
                                # role file
```

## npm scripts

| command                                    | purpose                                                    |
|--------------------------------------------|------------------------------------------------------------|
| `MACHINE_ROLE=<role> npm run axl:setup`    | one-time per Mac: install deps, build, generate config     |
| `npm run axl:start`                        | run AXL node + A2A agent server, write pubkey to peers.json |
| `npm run axl:send -- <target> "<msg>"`     | A2A send to target role, auto-CC `user`                    |
| `npm run axl:listen`                       | raw /recv polling (debug — agent.ts already prints inbound) |

## AXL gotchas worth knowing

- **GOTOOLCHAIN=go1.25.5 is required.** AXL's `gvisor` dep redeclares constants on Go 1.26; the setup script forces Go 1.25.5 via toolchain auto-download.
- **`a2a_port` in node-config is ignored.** AXL's `cmd/node/config.go` `applyOverrides` doesn't copy A2APort. AXL forwards inbound A2A to hardcoded `:9004`. Express bound to 9004 always.
- **`X-From-Peer-Id` is truncated**, not the full pubkey. It's ~28 hex chars + `f` padding. `matchesPeer()` strips trailing `f`s and prefix-matches against `peers.json`.
- **A2A discovery flow:** sender `GET /a2a/{peer}` → AXL forwards to remote `/.well-known/agent-card.json` → sender overrides `card.url` to its own AXL forward URL → SDK posts through AXL.
- **Public-mesh `/topology` has noise.** Other random AXL users will appear. Always address by pubkey, never by topology position.
- **Re-running setup is safe.** Keypair preserved, only `node-config.json` regenerates. Pubkey persistence via `peers.json` survives across runs.

---

# Phase 2a — AXL/MCP routing (wired and working) + local demo scripts

Phase 1 proved transport. Phase 2a runs the demo *over the AXL mesh*: a remote agent on Mac B/C calls into the user's Mac, the user's Mac auto-approves, runs the demo scripts, and live-narrates progress + dialogue back to every connected terminal as colour-coded chat. The standalone scripts still work for solo dev.

## What's working today (standalone, on the user's machine)

The demo is a sequence of URL opens in the user's default Chrome, paced with auto-advance (browser does fast pages) and a pause-for-Enter where the user actually has to act (typing AWS credentials).

### npm scripts (all in `scripts/` as `tsx` files)

| command | what it does |
|---------|--------------|
| `npm run test:browser` | self-contained 5-URL walk. Step 2 pauses for credentials; rest auto-advance. Pure `cmd.exe /c start chrome <url>` (or `open` on macOS). No setup. |
| `npm run demo:before` | half 1: AWS landing → sign-in URL. Pauses on sign-in for user to type credentials, exits when they hit Enter. |
| `npm run demo:after` | half 2: EC2 dashboard → launch wizard → Instances dashboard. 7s between each. Run after `demo:before` returns. |
| `npm run demo:cdp` | full flow with auto-click. Connects to debug Chrome, navigates by CDP, clicks `#root_account_signin`, polls URL until sign-in detected, continues. Requires `chrome:debug` first. |
| `npm run demo:popup` | walks 4 URLs then spawns a separate Windows Terminal / Terminal.app window that runs `demo:cli-only` (the SDK execution part) — "hacker movie" two-window aesthetic. |
| `npm run demo:final` | **all-in-one demo (macOS)**: walks 3 EC2 console pages, then `osascript` spawns Terminal.app running `demo:cli-aws`. Wired into the chat UI via `/api/demo/start`. Uses pure `aws` CLI + system `ssh` — no `@aws-sdk` or `ssh2` deps required. |
| `npm run demo:cli-aws` | the AI-execution half of `demo:final`: `aws sts get-caller-identity` → ensure keypair (`openclaw-demo-key`, PEM at `axl/openclaw-demo-key.pem`) → ensure SG (`openclaw-demo-sg`, SSH 22 from anywhere) → resolve latest AL2023 AMI via SSM → `run-instances` (t3.micro) → wait running → wait sshd 30s → `ssh -tt` interactive session that prints `/etc/motd`, fakes a `[ec2-user@host ~]$` prompt before each command, installs `git nodejs npm`, `git clone https://github.com/derek2403/openclaw.git`, drops `.env` (base64-piped from the local Mac's `.env`), runs `bash start.sh`. Writes the `OPENCLAW_DEMO_MARKER` file at the end. |
| `npm run demo:aws-1` | **3-step alternative — step 1**: open AWS landing + sign-in pages in Chrome, pause for Enter. User signs in at their pace, then runs `demo:aws-2`. |
| `npm run demo:aws-2` | **step 2**: provision EC2 (identity → keypair → SG → run-instances → wait running + sshd ~30s) and STOP. Saves `{instanceId, publicIp, region, keyPath}` to `$TMPDIR/openclaw-demo-state.json` so `demo:openclaw` can pick it up without an arg. |
| `npm run demo:openclaw` | **step 3**: outer mode reads the state file (or accepts `PUBLIC_IP=…` / a positional arg), spawns Terminal.app re-running itself with `OPENCLAW_INNER=1`. Inner mode SSHes into the box, installs `git nodejs npm pm2`, clones the repo, pastes `.env`, then `pm2 start ./start.sh --name openclaw --interpreter bash` + `pm2 save` so the bot survives the SSH exit. Reattach with `ssh -i axl/openclaw-demo-key.pem ec2-user@<ip>` then `pm2 logs openclaw`. |
| `npm run chrome:debug` | one-time per session: launches Chrome with `--remote-debugging-port=9222` + dedicated user-data-dir (`C:\temp\rh-demo-chrome` on WSL/Win, `~/.rh-demo-chrome` on macOS). User logs into AWS once in this Chrome; cookies persist. |
| `npm run capture-urls` | scrapes fresh AWS OAuth + sign-in URLs from the running debug Chrome via CDP. Prints in shell-eval format. |

### Two ways to run the demo

The same EC2-launch + OpenClaw-install outcome is reachable two ways. Pick based on whether you need the chat-UI integration or just want to step through manually.

| | `demo:final` (one-shot, chat-driven) | `demo:aws-1` / `aws-2` / `openclaw` (3 manual steps) |
|---|---|---|
| Trigger | `npm run demo:final` (or the chat UI's Start button → `/api/demo/start`) | three separate `npm run` invocations |
| Browser walk | yes — 3 EC2 console pages auto-open | no — only `aws-1` opens the sign-in page |
| User pauses | none — runs straight through | between `aws-1` and `aws-2` (sign in to AWS); between `aws-2` and `openclaw` (review provisioning) |
| Process supervisor on EC2 | none — `bash start.sh` runs in foreground inside the SSH session | **PM2** — survives SSH exit, reattach with `pm2 logs openclaw` |
| State handoff | env var (`OPENCLAW_DEMO_MARKER`) propagated through `osascript` | `$TMPDIR/openclaw-demo-state.json` written by `aws-2`, read by `openclaw` |
| Best for | live stage demo, hands-off | debugging, iterating on individual steps, or when you want PM2 long-running supervision |

Both paths converge on the same `OPENCLAW_DEMO_MARKER` file at the end, so the chat UI's `/api/demo/status` poll works whichever you ran (as long as you set `OPENCLAW_DEMO_MARKER` to match for the 3-step path — the chat UI default uses `$TMPDIR/openclaw-demo-done.flag`).

### Browser opener: cross-platform

[`axl/mcp-servers/aws-helpers/browser.ts`](axl/mcp-servers/aws-helpers/browser.ts) — single `openUrl(url)` that detects platform:
- macOS: `open -a "Google Chrome" <url>`
- WSL / Win32: `cmd.exe /c start "" chrome <url>` (uses Windows App Paths registry to find Chrome)
- Linux desktop: `google-chrome <url>` (or `xdg-open` with `BROWSER=default`)

Override with `BROWSER=msedge|firefox|default` env var.

### CDP client (no Playwright)

[`scripts/cdp-helper.ts`](scripts/cdp-helper.ts) — minimal Chrome DevTools Protocol client over `WebSocket` (Node 21+ built-in, no `ws` package needed). Methods: `connect()`, `navigate(url)`, `click(selector)`, `waitForSelector(selector)`, `evaluate(expr)`, `getCurrentUrl()`, `getNavigationHistory()`. ~120 lines total. Used by `demo:cdp` and `capture-urls`.

### URL handling

The default sign-in URL is `https://signin.aws.amazon.com/console` (generic — AWS regenerates a fresh PKCE code_challenge on every visit). Don't try to hardcode the long `/oauth?...&code_challenge=...` deep-links: they're single-use, AWS invalidates them after one OAuth round-trip, every reuse returns `400 invalid_request`. This bit us multiple times during dev.

If you want the actual deep-link URLs displayed for narrative, run `eval $(npm run --silent capture-urls)` to populate `SIGNIN_OAUTH_URL` / `SIGNIN_FORM_URL` env vars from the live AWS session, then run `npm run test:browser`.

### Demo flow (default `test:browser` — no setup needed)

```
1. https://aws.amazon.com/free/                                  [auto, 7s]
2. https://signin.aws.amazon.com/console                          [WAIT]   ← user signs in
3. https://us-east-1.console.aws.amazon.com/console/home?…#       [auto, 7s]
4. https://us-east-1.console.aws.amazon.com/ec2/home?…#Home:      [auto, 7s]
5. https://us-east-1.console.aws.amazon.com/ec2/home?…#LaunchInstances:   [done]
```

After step 5, the launch-wizard page is open in Chrome. The narrative is "AI navigated to the wizard; instead of clicking through it manually, it'll call AWS RunInstances directly via SDK." That SDK call lives in `demo:cli-only` / `test:aws launch` (currently parked — see below).

## What's built but not currently runnable

[`axl/mcp-servers/aws.ts`](axl/mcp-servers/aws.ts), [`aws-helpers/ec2.ts`](axl/mcp-servers/aws-helpers/ec2.ts), [`aws-helpers/ssh.ts`](axl/mcp-servers/aws-helpers/ssh.ts) and [`scripts/test-aws-direct.ts`](scripts/test-aws-direct.ts) / [`scripts/demo-cli-only.ts`](scripts/demo-cli-only.ts) / [`scripts/demo-full.ts`](scripts/demo-full.ts) implement the SDK side: real EC2 RunInstances + ssh2 install + terminate. They imported `@aws-sdk/client-ec2` + `ssh2` which were dropped from `package.json`. To re-enable:

```bash
npm install --legacy-peer-deps @aws-sdk/client-ec2@^3 ssh2@^1.16 @types/ssh2
```

Plus AWS access key in `~/.aws/credentials`, EC2 keypair `nanoclaw-key` saved as `axl/nanoclaw-key.pem` (chmod 600). Defaults: us-east-1, t2.micro, AMI `ami-0c02fb55956c7d316`.

**The CLI-based path (`demo:final` / `demo:cli-aws`) is the working alternative** — same outcome (real EC2 launch + remote install) without any `@aws-sdk` or `ssh2` deps, since it shells out to the system `aws` and `ssh` binaries. If you only need the demo flow, prefer this path. If you need programmatic SDK access from inside the AXL/MCP server (e.g. for `aws.ts` to be reachable over the mesh), you still need to reinstall the SDK deps as above.

### Gotchas for the demo scripts (apply to both paths)

- **Required IAM permissions.** The IAM user needs `AmazonEC2FullAccess` + `AmazonSSMReadOnlyAccess` (or a custom policy with `ec2:CreateKeyPair`, `ec2:RunInstances`, `ec2:Describe*`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:CreateTags`, `ec2:TerminateInstances`, `ssm:GetParameter`). Without SSM access the AMI lookup fails.
- **AWS Free Plan only allows specific instance types.** New accounts (post-2024 Free Plan) reject `t2.micro` with `InvalidParameterCombination`. The scripts default to `t3.micro`. If even that's rejected, run `aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true --region us-east-1` to see what's allowed.
- **Default VPC must exist** in the chosen region. `aws ec2 describe-vpcs --filters Name=isDefault,Values=true --region us-east-1` should return a VPC. If it doesn't, the script needs `--subnet-id`.
- **`.env` is base64-piped, not scp'd.** The local `.env` is read on Mac, base64-encoded, and inlined inside the install script's bash payload. Decoded on EC2, written to `~/openclaw/.env`, chmod 600. Sidesteps shell-escape issues with newlines/quotes/specials in secrets. Logs never contain the decoded content because the install script runs over an interactive `ssh -tt` session.
- **Keypair recovery.** If the AWS keypair `openclaw-demo-key` exists but the local PEM at `axl/openclaw-demo-key.pem` is missing, the scripts abort (can't re-mint a PEM for an existing key). Recover with `aws ec2 delete-key-pair --key-name openclaw-demo-key --region us-east-1` then re-run.
- **`demo:cli-aws` runs `start.sh` in the foreground** — SSH stays open until you exit. Good for a live demo (audience sees the bot logs); bad if you want to disconnect. Either type `~.` in the SSH session or use the 3-step path which uses PM2 instead.
- **`demo:openclaw` uses PM2 for survival.** `pm2 start ./start.sh --name openclaw --interpreter bash` + `pm2 save` daemonizes the bot under PM2's supervisor. Survives SSH disconnect; **does NOT survive instance reboot** unless you also run `pm2 startup` and follow the sudo command it prints. The script intentionally skips `pm2 startup` because we can't auto-respond to its sudo prompt.
- **State file handoff between `aws-2` and `openclaw`.** `aws-2` writes `$TMPDIR/openclaw-demo-state.json` with `{ instanceId, publicIp, region, keyPath }`. `openclaw` (outer mode) reads it. If you skip `aws-2` (e.g. you provisioned the box some other way), pass the IP explicitly: `npm run demo:openclaw -- 1.2.3.4` or `PUBLIC_IP=1.2.3.4 npm run demo:openclaw`.

## The AXL/MCP integration (wired and working)

End-to-end flow: agent on Mac B/C calls `npm run mcp:demo:<step>` → AXL routes through Yggdrasil to user's Mac → `mcp-router.py` (port 9003) dispatches → `aws.ts` (port 9100) auto-approves → spawns the corresponding `tsx scripts/demo-*.ts` as a child process → progress + dialogue stream back to every peer's `axl:start` terminal as live chat.

### MCP service: `aws` (3 tools, each wraps a demo script)

[`axl/mcp-servers/aws.ts`](axl/mcp-servers/aws.ts) exposes:

| tool | spawns | runtime | demo step |
|---|---|---|---|
| `aws_signin` | `tsx scripts/demo-aws-1.ts` | ~3 s | open AWS sign-in pages on user's Chrome |
| `provision_ec2` | `tsx scripts/demo-aws-2.ts` | ~60–80 s | always-fresh EC2 (terminates the previous demo instance first), keypair + SG + run-instances + wait running + 30s sshd; writes state file |
| `install_openclaw` | `tsx scripts/demo-openclaw.ts` | ~3 s outer + ~2 min inner | outer: spawns Terminal.app on user's Mac and exits; inner: SSH-installs OpenClaw under PM2 + opens Telegram bot URL on user's browser |

Wrappers in [`scripts/mcp-demo.sh`](scripts/mcp-demo.sh) → `npm run mcp:demo:signin` / `:provision` / `:install`. Sender resolves target pubkey from `axl/peers.json`, posts to local AXL `/mcp/<pubkey>/aws`. None of `@aws-sdk/client-ec2` / `ssh2` are needed — the demo scripts shell out to system `aws` and `ssh`.

### Live demo dialogue (the chat that plays across all 3 axl:start terminals)

Each MCP call produces a scripted multi-machine conversation rendered in real time. Driven by:

- **Per-tool flavour text** in [`scripts/mcp-call.ts`](scripts/mcp-call.ts): `startingText()`, `ackText()`, `directiveText()` give each of the 3 tools its own announcement strings. Bodies are bare ("starting EC2 provision") — no role-name prefix, no prescriptive "you do X" directives.
- **Per-role auto-replies** in [`axl/agent.ts`](axl/agent.ts) `CHAT_RULES`: each role responds to specific incoming kind/tool/pattern matches with a delayed broadcast. Examples: agent-c on `starting:aws_signin` (delay 1.5 s) → "ok, fetching the Telegram bot ID + token while you log in"; agent-c on `starting:provision_ec2` (delay 10 s) → "got the bot token ready, waiting on you"; agent-b matches the regex `/got the bot token/` (delay 2 s) → "still provisioning, almost there". Reply chains capped at depth 2 to prevent loops.
- **Real-time progress pings** in `aws.ts`: while a long-running tool runs, parses the script's stdout (matches `━━ [N/M] step`, `→ arrow`, `✓ ok`, `✗ fail`) and broadcasts each transition within 1 s, plus a 20 s heartbeat for AXL session warmth. So `provision_ec2`'s 6 steps reach every peer's screen near-instantly instead of waiting for the call to return.
- **Deferred truthful announcements**: the "@user OpenClaw deploy complete — Telegram bot is live at <URL>" line is broadcast from `demo-openclaw.ts` *inner* mode (after the SSH install + `openUrl` actually succeeded), not from the outer-mode MCP ack — so the announcement is never premature.

### Per-terminal POV + colour scheme

Each Mac's `axl:start` log renders the same A2A traffic from its own first-person POV. Local role is always "me" (magenta); other roles keep stable colours so the audience can scan three side-by-side terminals at a glance.

| role | colour |
|---|---|
| me (local) | magenta / purple |
| user | green |
| agent-b | yellow |
| agent-c | blue |
| **bystander** (overheard directive between two other roles) | bright cyan |

Three categories of line:

| metadata | rendered as | example |
|---|---|---|
| `internal: true` | `[me] doing X` (no arrow) | local-only AI monologue, never broadcast |
| `directed: true, target: <role>` | sender's screen `[me → <target>]`, target's screen `[<sender> → me]`, bystander's screen `[<sender> → <target>]` cyan | `mcp-call.ts` `sendDirective()` blasts to ALL peers; agent.ts checks `meta.target` to pick the right rendering |
| no `target` (broadcast) | `[me → all]` on sender, `[<sender> → me]` on others | progress pings, starting/ack |

Auto-reply broadcasts from `agent.ts` set `metadata.replyDepth` so the rule engine caps chains at 2 hops without needing an `autoReply` blacklist.

### Script terminal vs axl:start terminal — the rule

**Hard rule**: the script terminal where you ran `mcp:demo:*` shows only the call URL + `✓ done` or `✗ <reason>`. All chat (own outbound, others' inbound, progress pings, auto-reply triggers) lands in the **axl:start** terminal. Each terminal has one job — script does action, axl:start narrates conversation.

This is enforced in `mcp-call.ts`: it broadcasts (so other peers see the message) but doesn't `console.log` the chat lines locally. To make sender's *own* outbound also appear in their local axl:start, broadcasts loop through their own pubkey too — local AXL forwards back to local agent.ts on port 9004, which logs it as `[me → all]`.

### Auto-approve and timeout config

- **Auto-approve is the default** in [`axl/mcp-servers/permission.ts`](axl/mcp-servers/permission.ts). No keystroke required. Set `MCP_REQUIRE_APPROVAL=1` to bring back the y/n prompt for filming the gate.
- **Router forward timeout = 600 s** ([`axl/mcp-router.py`](axl/mcp-router.py), bumped from upstream's 30 s). Covers the ~60 s `provision_ec2` runtime end-to-end.
- **AXL's own per-socket idle timeout is ~60 s** (`Connection read timeout: 1m0s` from the node startup log). For `provision_ec2`, this is right at the edge — the call can still 502 at the AXL transport layer even though the script succeeded on user's Mac. The per-step progress broadcasts (1 s cadence) keep traffic flowing and mitigate this in practice; the state file is the source of truth for `install_openclaw` regardless of whether cedric's terminal got its JSON-RPC ack.

### `mcp-call.ts` polling endpoint

[`axl/agent.ts`](axl/agent.ts) keeps an in-memory ring of the last 200 inbound A2A messages and exposes `GET /messages?since=<seq>`. Currently unused by `mcp-call.ts` (we keep the script terminal silent), but available for any future UI subscriber that wants a live tail of the chat.

### Verified MCP request shape

Sender:
```
POST http://127.0.0.1:9002/mcp/<peer-pubkey>/aws
{ "jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{"name":"...","arguments":{...}} }
```
AXL forwards to `router_addr:router_port` (`http://127.0.0.1:9003/route`):
```
{ "service":"aws", "request": <jsonrpc-above>, "from_peer_id":"<28hex>" }
```
Router POSTs the inner `request` body to the registered service's `/mcp` endpoint with headers `X-From-Peer-Id` (truncated to ~28 hex; use `matchesPeer()` from [`axl/axl.ts`](axl/axl.ts)), `X-Service`. Service auto-approves, runs the tool, returns:
```
{ "jsonrpc":"2.0", "id":1, "result":{ "content":[{"type":"text","text":"<json-stringified result>"}] } }
```
Router wraps as `{response: <jsonrpc>, error: null}` and the response propagates back through AXL to the sender.

### Gotchas (Phase 2a-specific)

- **`peers.json` is the discovery source for broadcasts.** A stale agent-c pubkey on cedric's side silently kills cedric → agent-c broadcasts (Yggdrasil routes to a dead pubkey, fetch times out, error swallowed by abort timeout). Diagnostic: `curl -s http://127.0.0.1:9002/topology | jq -r .our_public_key` on each Mac and compare against `axl/peers.json`.
- **`axl/node-config*.json` and `axl/*.pem` are now gitignored** (broadened from just `axl/node-config.json`). Two stale loopback configs (`node-config1.json`, `node-config2.json`) were untracked. Each Mac regenerates these locally via `npm run axl:setup`.
- **GossipSub is *not* a built-in AXL HTTP API.** The `gensyn-ai/axl` repo ships a Python *example* (`examples/python-client/gossipsub/gossipsub.py`) that implements the meshsub algorithm on top of AXL's basic `POST /send` / `GET /recv`. To adopt: port ~300 lines to TS, OR vendor the Python as a sidecar. For 3 fixed peers + known pubkeys (current state), per-peer A2A POSTs work fine. Reconsider for Phase 2b's dynamic-peer scenarios.

---

# Telegram bot — OpenClaw on 0G Compute (Phase 2a EC2 payload)

The standalone Telegram bot that gets deployed onto the user's EC2 box once `launch_instance` succeeds. Long-polls Telegram, routes inbound messages through 0G Compute Network's `qwen-2.5-7b-instruct` provider, returns replies with provider/tx hyperlinks in an HTML footer.

Lives in [`telegram-bot/`](telegram-bot/) as its own npm project — designed to clone+run on any Linux box with Node 20+, no parent-repo deps.

## Why this matters

Phase 2a's narrative is "agents on Mac B/C deploy a working AI service onto the user's EC2." Until this bot existed, the demo ended at "EC2 instance is running" — abstract. With the bot installed, the user opens Telegram on their phone, finds **@RightHandAI_OpenClaw**, and chats with an LLM that lives on their just-launched EC2 and pays for inference from a 0G testnet ledger — concrete, visible, real.

## Files

```
telegram-bot/
  bot.ts            # grammy long-poll → 0G compute (qwen-2.5-7b) → reply.
                    # HTML footer with provider-address explorer link
                    # + on-chain ack tx hash when one fires.
                    # In-memory per-chat history (10 turns), /start /reset /help.
  start.sh          # OpenClaw-style launcher: red lobster banner ("EXFOLIATE!"),
                    # auto-installs deps on first run, exec npm start.
  check.ts          # dev utility: prints wallet balance, ledger,
                    # provider list with prices, per-provider sub-account state.
                    # Run with: `./node_modules/.bin/tsx check.ts`
  package.json      # CommonJS Node 20+, deps:
                    #   grammy + @0glabs/0g-serving-broker + ethers + dotenv
  tsconfig.json     # CommonJS / Node resolution (NOT NodeNext — see gotchas)
  .env.example      # template — BOT_TOKEN + 0G_PRIVATE_KEY
  .gitignore        # node_modules, .env, *.log
  README.md         # setup, PM2/systemd recipes, troubleshooting
```

## How it integrates with Phase 2a

The bot lives at [github.com/derek2403/openclaw](https://github.com/derek2403/openclaw) as its own repo (extracted from `telegram-bot/` for distribution). The **working integration path is `demo:cli-aws`** ([`scripts/demo-cli-aws.ts`](scripts/demo-cli-aws.ts)), which does the equivalent of:

```bash
sudo dnf install -y git nodejs npm
git clone https://github.com/derek2403/openclaw.git ~/openclaw
cd ~/openclaw
cat <<'EOF' > .env   # base64-piped from the local Mac's .env
BOT_TOKEN=…
0G_PRIVATE_KEY=…
EOF
chmod 600 .env
bash start.sh
```

…all over a single `ssh -tt` session that streams the remote AL2023 motd + a faked `[ec2-user@host ~]$ <cmd>` prompt before each command, so the audience watches it run live in the popup terminal. The `.env` is base64-encoded on the Mac, inlined into the install script, and decoded on EC2 — no scp, no leaked secrets in logs.

The `install_telegram_bot` MCP tool in [`axl/mcp-servers/aws.ts`](axl/mcp-servers/aws.ts) (still to be wired) is the AXL-routed equivalent: same SSH calls, but invoked as a JSON-RPC tool over the AXL mesh + MCP router instead of from a local Mac terminal. When it's wired, it should `child_process.spawn('tsx', ['scripts/demo-cli-aws.ts'])` rather than re-implementing the SSH dance.

After install, the user opens [t.me/RightHandAI_OpenClaw](https://t.me/RightHandAI_OpenClaw), sends `/start`, and chats. Every reply is qwen inference billed against the 0G ledger.

## 0G Compute integration

Mirrors the `callVia0GCompute()` function in [`pages/api/0g/inft-infer.ts`](pages/api/0g/inft-infer.ts) exactly — same broker setup (`createZGComputeNetworkBroker(wallet)`), same env var (`0G_PRIVATE_KEY`), same provider call sequence. The bot uses **only the qwen-2.5-7b provider** because it's the only chat model registered on 0G testnet right now (run `tsx check.ts` to confirm).

Per-message flow:
1. `broker.inference.acknowledged(provider)` — read, free
2. `broker.inference.acknowledgeProviderSigner(provider)` — **on-chain tx** on first call to a new provider; cached after
3. `broker.inference.getServiceMetadata(provider)` — read endpoint + model name
4. `broker.inference.getRequestHeaders(provider, message)` — signs request off-chain
5. `fetch(endpoint + "/chat/completions", { headers })` — actual inference (OpenAI-compatible)
6. `broker.inference.processResponse(provider, chatID, reply)` — billing settle (silent on failure)

The bot hooks `wallet.sendTransaction` to capture step 2's tx hash and surfaces it as a hyperlink in the reply footer when present.

## Boot UI

The branded boot is in two layers:

1. **`start.sh`** prints the red-bordered lobster banner before launching node.
2. **`bot.ts`** then runs a 5-step staged init that runs *real* on-chain probes and prints each as a dotted leader line:
   ```
   [ 1/5 ]  ▸ loading 0g compute broker .................  ✓
   [ 2/5 ]  ▸ probing 0g testnet ........................  ✓ gas 12.85 0G · chain 16602
   [ 3/5 ]  ▸ reading ledger ............................  ✓ 7.49 0G allocated
   [ 4/5 ]  ▸ acknowledging providers ...................  ✓ qwen-2.5-7b-instruct
   [ 5/5 ]  ▸ pairing telegram channel ..................  ✓ @RightHandAI_OpenClaw
   ```
3. Finishes with `EXFOLIATE! OpenClaw is online.` Shutdown gets `─ shutting down — the lobster sleeps 🦞`.

The vibe is borrowed from [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw) (their tagline, lobster mascot, CLI-first aesthetic).

## Gotchas

- **0G SDK ESM build is broken** as of `@0glabs/0g-serving-broker@0.7.8` — exports a missing `'C'` constant. The bot is CommonJS (no `"type": "module"` in `package.json`) so it pulls the working CJS build. Don't add `"type": "module"` back.
- **`0G_PRIVATE_KEY` starts with a digit.** JS can't access via `process.env.0G_PRIVATE_KEY` directly — always use `process.env["0G_PRIVATE_KEY"]` (square-bracket form). Matches the parent monorepo.
- **Bot username is auto-detected at runtime** via grammy's `getMe()`. Don't hardcode `@RightHandAI_OpenClaw` anywhere except docs/banners; if you rename via @BotFather, the boot screen reflects it on next restart.
- **On-chain tx per call only fires on first ack.** After that, all communication goes through the broker's off-chain HTTP path. Subsequent replies still link the provider contract address — that's a real on-chain artifact, just not per-call.
- **`.env.example` and `package-lock.json` are force-tracked.** The parent `.gitignore` excludes `.env*` and `package-lock.json` repo-wide; the bot dir overrides via `git add -f` (one-time at initial commit). When adding new bot files matching parent-ignored patterns, may need `git add -f` again.
- **In-memory chat history wipes on restart.** Persist to Redis if you need durability; PM2/nohup don't preserve it.
- **One Telegram polling consumer per bot token.** If you migrate machines or run a duplicate, the second one fails with `409 Conflict`. To clear: `curl https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook`.
- **The 0G SDK references `window.location` at module-load.** `bot.ts` shims `globalThis.window` before importing the SDK — don't reorder those imports.

---

# Chat UI (Right-Hand workspace + host console + agents marketplace)

The user-facing front of Right-Hand AI. Three live pages drive the demo end-to-end: `/landing` (the chat), `/agents` (the public ENS registry), `/host` (the host console). The chat doesn't simulate agents anymore — `TaskCreationCard` posts a real task to `TaskMarket` on Sepolia, then `DemoFlow` calls back into the local Next.js API to actually launch EC2, SSH in, install OpenClaw, and tell the user when it's done.

## Pages

| route               | purpose                                                                                                       |
|---------------------|---------------------------------------------------------------------------------------------------------------|
| `/`                 | original AXL transport demo — preserved from Phase 1                                                          |
| `/landing`          | the chat — `Welcome` prompt picker → `TaskCreationCard` (posts to `TaskMarket`) → `DemoFlow` (drives the demo)|
| `/host`             | host console — `EarningsPanel` × 4 + `AgentBuilderForm` (publish flow) + `useMySpecialists` grid + invocations |
| `/agents`           | public registry — every specialist ever registered, via `useAllSpecialists` + Multicall3                      |
| `/agents/[id]`      | mock agent detail — identity, runtime logs, task history, pricing rules (still mocked from `HOSTED_AGENTS`)   |
| `/marketplace`      | task feed — sign-on / withdraw via wagmi hooks against `TaskMarket`                                           |
| `/ens-test`         | bare-wallet harness for `SpecialistRegistrar` — register + read forms                                         |
| `/tasks`            | bare `TaskMarket` UI — post / sign-on / complete / cancel / withdraw                                          |

## File map (live components only)

```
components/
  ui/         — primitives: Button, Badge, Card, Input, Tabs, Disclosure, Icon, Modal
  layout/     — AppShell (sidebar+topbar grid), Sidebar, TopBar, HostDashboard
  chat/       — ChatInterface (no sidebar, no mode picker), Welcome, ChatInput,
                TaskCreationCard, DemoFlow
  host/       — AgentCard, AgentBuilderForm, AgentStatusTable, EarningsPanel
  agents/     — AgentsRegistry (the /agents grid), AgentProfile, AgentRuntimePanel, AgentSkillTags
  marketplace/— Marketplace (the /marketplace task feed)
lib/
  mock-data.ts          — EXAMPLE_PROMPTS, MODES, NAV_*, HISTORY (HOSTED_AGENTS still seeds /agents/[id])
  ens/SpecialistRegistrar.ts  — useParentStatus + useRegisterSpecialist + useMySpecialists + useAllSpecialists
  ens/TaskMarket.ts     — useTasks + usePostTask + useSignOnTask + useCompleteTask + useCancelTask + useWithdraw
  x402/payAgent.ts      — usePayAgent() — drives the "Pay X 0G via x402" button on each /agents card
pages/api/demo/         — start.ts (kicks off the demo), status.ts (polled by DemoFlow), login.ts/run.ts (legacy)
```

**Stale / unused** (kept on disk but no longer imported by anything live): `lib/task-runner.ts`, `lib/build-script.ts`, `components/chat/{ChatMessage,ClarifyCard,ModePicker,TaskProgressPanel}.tsx`. Earlier prototype of an animated mock orchestration — replaced when the chat became real-action-driven via `TaskCreationCard` + `DemoFlow`. Safe to delete; left in place for reference.

## How `/landing` actually flows

```
1. User picks an example prompt or types one.
   ↓
2. ChatInterface appends a "user" bubble + a "draft" item.
   The draft renders TaskCreationCard with the prompt as the
   description, mode-derived maxSpecialists, and a default 24h deadline.
   ↓
3. User clicks "Post on Sepolia".
   wagmi → TaskMarket.postTask(description, skillTags, deadline, max) payable.
   The contract escrows the budget, mints task-{id}.righthand.eth, and
   writes 6 text records (description, skills, budget, deadline,
   creator, status=open).
   ↓
4. On confirmed receipt, TaskCreationCard.onPosted({label, taskId}) fires.
   ChatInterface inserts a "demo" item right after the draft, rendering
   <DemoFlow taskLabel={label} />.
   ↓
5. DemoFlow animates two specialists "signing on" (AWS Provisioning +
   OpenClaw Deployment, hardcoded for the demo) over ~2s.
   ↓
6. User clicks "Confirm & run" → modal listing 5 steps → click "Start".
   POST /api/demo/start. The endpoint:
     a. clears any stale $TMPDIR/openclaw-demo-done.flag
     b. opens AWS landing + sign-in URLs in Chrome
     c. spawns `npm run demo:final` detached
     d. returns { ok, pid, marker } immediately
   Modal closes; inline running indicator with a live mm:ss timer.
   ↓
7. DemoFlow polls GET /api/demo/status every 5s. The endpoint returns
   { done: existsSync(MARKER_PATH) }. demo-cli-aws.ts writes that marker
   when its install finishes. UI auto-advances to the "Demo complete"
   modal (with a 6-min timeout fallback). No clicks needed in between.
```

## Marker-file completion handshake

The chat UI has no IPC channel into the popup Terminal.app. Bridge it via a fixed file path:

- `pages/api/demo/start.ts` exports `DEMO_DONE_MARKER = join(tmpdir(), "openclaw-demo-done.flag")`, deletes any existing file, and propagates the path as `OPENCLAW_DEMO_MARKER` env var into the spawned `npm run demo:final` so child terminals inherit it.
- `scripts/demo-cli-aws.ts` (and `scripts/demo-openclaw.ts`) write `JSON.stringify({ instanceId, publicIp, region, at })` to that marker at the end of the install.
- `pages/api/demo/status.ts` is a tiny `existsSync(DEMO_DONE_MARKER)` check.
- `DemoFlow` polls every 5s with a 6-min timeout fallback. The done-modal links to `t.me/RightHandAI_OpenClaw` and prints the manual cleanup command.

## Agents page — copy-on-press + x402 pay button

[`components/agents/AgentsRegistry.tsx`](components/agents/AgentsRegistry.tsx) is the live grid driven by `useAllSpecialists()` (calls `SpecialistRegistrar.getAll()` then batches the 6 text-record reads through Multicall3). Two reusable patterns live here:

- **`Copyable`** — wraps any value with a click-to-copy button: `aria-label`, `cursor: copy`, always-visible copy icon, on-click halts every propagation phase (`preventDefault` + `stopPropagation` + `nativeEvent.stopImmediatePropagation` + `onPointerDown` stop) so wallet extensions that scan for hex addresses can't hijack the click. Applied to the ENS name, owner address, iNFT token id, and AXL pubkey on each card.
- **`PayAgentControl`** — uses [`usePayAgent`](lib/x402/payAgent.ts) to fire the x402 flow against the agent. Step machine: `idle → requesting → got-402 → paying → success | error`. On success the card shows `Sent {amount} 0G to {payTo} on {network}` plus a basescan link to the on-chain tx. Reset button clears the state so the user can pay again. Note: routes through the same Base-Sepolia x402 flow documented in the **x402 payments** section — the "0G" label is cosmetic (the actual settlement is USDC on Base Sepolia).

## Tailwind setup

The repo runs **Tailwind v4** (`@import "tailwindcss"` in `globals.css`, `@tailwindcss/postcss` plugin). Custom theme tokens live in a `@theme` block in [`styles/globals.css`](styles/globals.css), **not a `tailwind.config.ts`**. Tokens: `bg-bg`, `bg-surface{,-2,-3}`, `text-ink{,-2,-3,-4}`, `border-border{,-strong}`, `bg-accent{,-soft,-fg}`, `shadow-{xs,sm,md}`, `text-2xs`. Fonts: Inter + JetBrains Mono via Google Fonts import in the same file.

## Gotchas

- **`/agents/[id]` is still mocked.** Pulls from `HOSTED_AGENTS` in `lib/mock-data.ts`, not from ENS. Only the registry list at `/agents` is real (via `useAllSpecialists`). The detail page should be rewritten against `useReadSpecialist(name)` if you want it to match production data.
- **`pages/api/demo/login.ts` and `pages/api/demo/run.ts` are dead** — superseded by `start.ts`. Kept around for individual-step debugging but not called by the UI.
- **`AppShell`'s grid item children need `h-full` to span row height.** Any aside-style panel under `AppShell` must have `h-full` on its outermost container — otherwise content collapses to its natural height while the wrapper grid cell stays full-height, leaving an unstyled gap below.
- **Path alias is `@/*` from repo root.** Imports look like `@/components/chat/DemoFlow`. Configured in `tsconfig.json`.
- **The chat UI is not at `/`.** When it landed, the original AXL transport demo at `/` was preserved; the new chat lives at `/landing`. If you ever want to promote the chat to `/`, move the AXL demo to a sub-route first — don't overwrite.
- **`_app.tsx` wraps everything in `<Providers>` (RainbowKit/wagmi/react-query) AND `<Head>`** with title + viewport. Don't drop either when editing.
- **macOS Terminal.app permission prompts on first call.** First time `/api/demo/start` runs, macOS pops "Node wants to control Terminal.app". Click Allow. Same with first `openUrl` call — "Node wants to use Google Chrome". Both are one-time grants per dev-server start.

---

# x402 payments (working, CLI-only)

Canonical Coinbase x402 wired against the public hosted facilitator at `https://x402.org/facilitator`. Settles **USDC on Base Sepolia (eip155:84532)** using the `exact` scheme + EIP-3009 `transferWithAuthorization`. The client signs an off-chain authorization, the facilitator pays the gas — the user's wallet only needs USDC, no ETH.

Status: **server gate works, CLI client works, on-chain settlement verified**. Not exposed in the React UI yet — invoked from the terminal.

## Why Base Sepolia, not Sepolia / 0G

The public facilitator at `x402.org/facilitator` only supports these networks:

```
exact  eip155:84532        ← Base Sepolia  (the one we use)
upto   eip155:84532
exact  solana / algorand / aptos / stellar testnets
```

Ethereum Sepolia (`eip155:11155111`) is **not** supported, and neither is 0G Galileo. To use those you'd have to self-host a facilitator — the chains are EVM, the asset would still need to be EIP-3009-compliant USDC. We chose to keep chains split: **Sepolia for ENS, 0G Galileo for iNFTs, Base Sepolia for x402**. The same `0G_PRIVATE_KEY` works on all three (it's just an EVM secp256k1 keypair), so the user identity is unified even though the chains differ.

## File map

```
proxy.ts                         # root-level Next 16 proxy (renamed from middleware.ts).
                                 # Gates GET /api/x402/news, registers ExactEvmScheme on
                                 # eip155:84532, points the resource server at the public
                                 # x402.org/facilitator. payTo defaults to vitalik.eth so
                                 # tests visibly transfer to a non-payer address — override
                                 # via X402_PAY_TO=0x… env var (requires dev server restart).
pages/api/x402/news.ts           # the gated resource handler. By the time control reaches
                                 # it, the facilitator has already verified + settled.
                                 # Body is a stub for the demo.
scripts/x402-pay.ts              # CLI client. Reads 0G_PRIVATE_KEY, derives the address,
                                 # uses @x402/fetch + ExactEvmScheme(client) + a viem
                                 # local account. Prints three roundtrips: plain GET (402),
                                 # wrapped GET (200), and the decoded PAYMENT-RESPONSE
                                 # header carrying the on-chain Base Sepolia tx hash.
```

## npm script

| command | purpose |
|---|---|
| `npm run x402:pay` | end-to-end test against `http://localhost:3000`. Override host via `X402_TARGET=https://… npm run x402:pay`. |

## Wire shape (verified end-to-end)

1. **`GET /api/x402/news`** with no payment header → `proxy.ts` returns **HTTP 402** with header `payment-required: <base64 JSON>`. Decoded body:
   ```json
   {
     "x402Version": 2,
     "error": "Payment required",
     "resource": { "url": "…/api/x402/news", "description": "…" },
     "accepts": [{
       "scheme": "exact",
       "network": "eip155:84532",
       "amount": "10000",                                                      // 0.01 USDC (6 decimals)
       "asset":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",                 // Base Sepolia USDC
       "payTo":  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",                 // vitalik.eth (default)
       "maxTimeoutSeconds": 300,
       "extra":  { "name": "USDC", "version": "2" }
     }]
   }
   ```

2. **`@x402/fetch`** in [scripts/x402-pay.ts](scripts/x402-pay.ts) catches the 402, signs the EIP-712 EIP-3009 `TransferWithAuthorization` typed data with the viem `LocalAccount` derived from `0G_PRIVATE_KEY`, base64-encodes `{scheme, network, payload:{signature, authorization}}`, and resubmits as `payment-signature: <base64>`.

3. **`proxy.ts` calls the facilitator** at `x402.org/facilitator` — `POST /verify` (signature recovers, balance ≥ value, nonce unused, validBefore not passed) then `POST /settle`. The facilitator broadcasts `USDC.transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)` from its own wallet (`0xd407e409E34E0b9afb99EcCeb609bDbcD5e7f1bf`) and pays the gas.

4. **Forwards to `pages/api/x402/news.ts`**, returning HTTP 200 + a `payment-response: <base64 JSON>` header:
   ```json
   { "success": true, "payer": "0x9787…A8f1",
     "transaction": "0xb1c76e1c91dfb3b77bc49a3984b0408efc406ffcabda9d3d73b448e5bf81792b",
     "network": "eip155:84532" }
   ```
   That tx hash is real — verify on [sepolia.basescan.org](https://sepolia.basescan.org/tx/0xb1c76e1c91dfb3b77bc49a3984b0408efc406ffcabda9d3d73b448e5bf81792b). Block 40991527, status success, 2 events: `Transfer` + EIP-3009 `AuthorizationUsed`.

## Required setup

| thing | how to get it |
|---|---|
| Base Sepolia USDC in the `0G_PRIVATE_KEY` wallet | [faucet.circle.com](https://faucet.circle.com) — pick Base Sepolia, paste your address. Each call costs $0.01 USDC. |
| Base Sepolia ETH for gas | **not needed** — facilitator pays gas. That's the whole point of EIP-3009. |
| `0G_PRIVATE_KEY` in `.env` | already used everywhere else (0G iNFT mint, 0G Compute) — same key, works on Base Sepolia because all EVM chains share secp256k1 keypairs. |

## Gotchas

- **Hosted facilitator only does Base Sepolia for EVM.** Querying `https://www.x402.org/facilitator/supported` confirms it: `exact eip155:84532` is the only EVM testnet entry. To use Sepolia or 0G Galileo you'd have to self-host a facilitator — that's a separate Next.js route holding a wallet that pays gas, calling `transferWithAuthorization` directly on the chain's USDC contract. Doable, ~80 lines, but a wallet to keep funded.
- **`proxy.ts` is the new `middleware.ts`.** Next.js 16 deprecated/renamed the file convention to `proxy.ts` and the export from `middleware` to `proxy`. The old name still works as a deprecation alias — DIVE's repo on Next 16.2.2 still uses it — but don't add new code under the old name.
- **Same key as DIVE's hardcoded demo `payTo`.** This repo's `0G_PRIVATE_KEY` derives to `0x9787cfF89D30bB6Ae87Aaad9B3a02E77B5caA8f1`, which happens to be the address DIVE hardcoded as their default `payTo` in their middleware. Coincidence (probably copy-paste lineage somewhere). The default `PAY_TO` in our [proxy.ts](proxy.ts) is now vitalik.eth so tests transfer to a different address — change via `X402_PAY_TO=0x…` env var if you want a real recipient. **And rotate this key before mainnet anything** — if the same key is ever funded on a public chain, anyone with the repo can drain it.
- **`payTo` change requires dev server restart**, despite Next.js hot-reloading. The proxy reads `process.env.X402_PAY_TO` at module-load time and the facilitator sync (the `syncFacilitatorOnStart` step) caches the registration. Edit `.env` → restart `npm run dev`.
- **`@x402/*` packages need `--legacy-peer-deps`** to install in this repo. `@0gfoundation/0g-ts-sdk@1.2.8` pins `ethers@6.13.1` as a peer dep; `@x402/*` doesn't conflict directly but the resolver still trips. Use `npm install --legacy-peer-deps @x402/next @x402/core @x402/evm @x402/fetch`.
- **The PAYMENT-REQUIRED is a header, not a body.** The 402 response body is `{}`; all the payment requirements live in the `payment-required` base64 header. Likewise the on-chain receipt comes back in `payment-response`. Don't look in the body for either.
- **No frontend.** Deliberately CLI-only — see [scripts/x402-pay.ts](scripts/x402-pay.ts). To add a UI later, the cleanest path is `wrapFetchWithPayment(fetch, x402Client)` from `@x402/fetch` driven by the connected wagmi wallet (need to add Base Sepolia to the chains array in [lib/networkConfig.ts](lib/networkConfig.ts)).

---

# Phase 2b — ENS task marketplace + royalties (next)

Phase 2a wires execution. Phase 2b turns the demo into the real product flow: **a user posts a task on ENS, OpenClaw specialists bid/sign in, the elected swarm coordinates over AXL, and MCP performs the actual work on the user's machine.**

## End-to-end target flow

```
1. User types a goal in chat                e.g. "install OpenClaw and run sample agent"
        │
        ▼
2. Task posted to ENS                       new ENS subname or text record under the
                                            user's own domain — describes the task,
                                            required skills, max budget, deadline
        │
        ▼
3. OpenClaw bots discover & opt in          listening to ENS task events; specialists
                                            with matching `skills` text records sign
                                            (on-chain or signed-message) to claim
                                            participation. Auto-elected by skill match
                                            + reputation + price.
        │
        ▼
4. Swarm assembled                          coordinator + N specialists, each on its
                                            own AXL node. The user's machine joins as
                                            the `user` role.
        │
        ▼
5. AXL coordination                         coordinator orchestrates via /a2a/{peer}.
                                            Specialists collaborate, share state on
                                            0G Storage workspace, log results. (This
                                            is what Phase 1's CC-pattern proves.)
        │
        ▼
6. MCP control of user's machine            specialists invoke approved tools on the
                                            user's PC via /mcp/{user-peer}/{service}.
                                            Each call surfaces a permission prompt;
                                            user approves before any local action runs.
        │
        ▼
7. Royalties paid                           per-call fees in 0G tokens (or x402/USDC)
                                            to each participating iNFT owner, plus a
                                            mint-time license fee for any user who
                                            chooses to run a local instance.
```

## What needs building (Phase 2b scope)

> **Note:** `TaskMarket` is now shipped — see the **ENS task marketplace** section above. The bullets below are what's still pending.

- **Specialist subscription daemon.** Each OpenClaw specialist runs a watcher (background process or AXL-registered hook) that filters `TaskPosted` events by skill match. On match, it auto-signs.
- **Coordinator selection.** First-N-to-sign-on, or weighted by reputation/price. Probably runs as one of the agent roles in the AXL mesh — same agent.ts shape, different agent card.
- **More MCP services beyond `aws`.** Phase 2a only ships the `aws` service. Add `filesystem`, `terminal`, `git`, etc. — each a sibling of `axl/mcp-servers/aws.ts` that self-registers with the router.
- **Web-based permission UI.** Phase 2a uses a terminal y/n prompt. Phase 2b should pop a modal in the user's chat UI: "Specialist `postgres-debug` wants to run `psql -c '\\l'`. [Approve] [Deny]." Bundled into the local connector binary.
- **Royalty router.** Each successful task call triggers an on-chain payment to the iNFT owner (looked up via the `0g_token_id` ENS text record). Could route through the existing `SpecialistRegistrar` contract or a new `RoyaltyRouter`.

## File map (Phase 2b — to be created)

```
contracts/
  contracts/RoyaltyRouter.sol            # per-call payment splits
axl/
  coordinator.ts                         # agent role variant: orchestrates swarm
  specialists/
    postgres-debug.ts                    # example skill-specialised agent.ts
    openclaw-setup.ts
  mcp-servers/                           # Phase 2a already ships `aws.ts`; add more siblings:
    filesystem.ts                        # local tool: file read/write with approval
    terminal.ts                          # local tool: shell exec with approval
connector/                               # the eventual single-binary connector
  permission-ui.tsx                      # Electron/Tauri permission UI
  bundle.json                            # AXL + MCP servers + UI packaging
```

## Key design notes

- **Tasks live on ENS, not in a centralised DB.** Each task is an ENS subname (or a text record on the user's own domain) with structured skill/budget/deadline fields. This composes naturally with the existing specialist registry — both are ENS records, both are discoverable the same way.
- **Sign-on is on-chain.** Specialists "sign" by calling a contract method, not by a centralised auction. This makes the swarm formation auditable and makes ownership claims unambiguous (whoever called `signOn` first wins the slot).
- **MCP is the execution moat.** Phase 1 proves transport (`/send`, `/a2a`); Phase 2 proves *execution on the user's machine* — that's what Right-Hand AI sells. The CC pattern from Phase 1 carries forward as the user's per-action approval log.
- **One iNFT per specialist, registered as ENS subname.** The existing `SpecialistRegistrar` contract already handles this. Phase 2 adds the *task* contract alongside.
- **Phase 1 demo is the foundation.** The `axl/agent.ts` echo flow becomes the coordinator-↔-specialist handshake. The `axl-send.ts` CC pattern becomes the user-visible audit trail of agent traffic. The `peers.json` pubkey roster generalises to "any specialist that signed on for this task."
