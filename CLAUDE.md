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

# Phase 2a — local browser demo (working) + AXL/MCP routing (built, not yet wired)

Phase 1 proved transport. Phase 2a is the **demo of what an AI agent does on the user's machine**: walks AWS console pages → user signs in → continues to EC2 launch wizard. This currently runs **standalone on the user's machine** (no AXL involved). The next step is wiring it as an MCP service so a remote agent can trigger it via AXL.

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
| `npm run demo:final` | **the working end-to-end stage demo (macOS)**: walks 3 EC2 console pages, then `osascript` spawns Terminal.app running `demo:cli-aws`. Uses pure `aws` CLI + system `ssh` — no `@aws-sdk` or `ssh2` deps required. |
| `npm run demo:cli-aws` | the AI-execution half: `aws sts get-caller-identity` → ensure keypair (`openclaw-demo-key`, PEM at `axl/openclaw-demo-key.pem`) → ensure SG (`openclaw-demo-sg`, SSH 22 from anywhere) → resolve latest AL2023 AMI via SSM → `run-instances` (t3.micro) → wait running → wait sshd 30s → `ssh -tt` interactive session that prints `/etc/motd`, fakes a `[ec2-user@host ~]$` prompt before each command, installs `git nodejs npm`, `git clone https://github.com/derek2403/openclaw.git`, drops `.env` (base64-piped from the local Mac's `.env`), runs `bash start.sh`. Designed to be spawned by `demo:final` but standalone-runnable. |
| `npm run chrome:debug` | one-time per session: launches Chrome with `--remote-debugging-port=9222` + dedicated user-data-dir (`C:\temp\rh-demo-chrome` on WSL/Win, `~/.rh-demo-chrome` on macOS). User logs into AWS once in this Chrome; cookies persist. |
| `npm run capture-urls` | scrapes fresh AWS OAuth + sign-in URLs from the running debug Chrome via CDP. Prints in shell-eval format. |

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

### Gotchas for `demo:cli-aws`

- **Required IAM permissions.** The IAM user needs `AmazonEC2FullAccess` + `AmazonSSMReadOnlyAccess` (or a custom policy with `ec2:CreateKeyPair`, `ec2:RunInstances`, `ec2:Describe*`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:CreateTags`, `ec2:TerminateInstances`, `ssm:GetParameter`). Without SSM access the AMI lookup fails.
- **AWS Free Plan only allows specific instance types.** New accounts (post-2024 Free Plan) reject `t2.micro` with `InvalidParameterCombination`. The script defaults to `t3.micro`. If even that's rejected, run `aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true --region us-east-1` to see what's allowed.
- **Default VPC must exist** in the chosen region. `aws ec2 describe-vpcs --filters Name=isDefault,Values=true --region us-east-1` should return a VPC. If it doesn't, the script needs `--subnet-id`.
- **`.env` is base64-piped, not scp'd.** The local `.env` is read on Mac, base64-encoded, and inlined inside the install script's bash payload. Decoded on EC2, written to `~/openclaw/.env`, chmod 600. Sidesteps shell-escape issues with newlines/quotes/specials in secrets. Logs never contain the decoded content because the install script runs over an interactive `ssh -tt` session.
- **Keypair recovery.** If the AWS keypair `openclaw-demo-key` exists but the local PEM at `axl/openclaw-demo-key.pem` is missing, the script aborts (it can't re-mint a PEM for an existing key). Recover with `aws ec2 delete-key-pair --key-name openclaw-demo-key --region us-east-1` then re-run.
- **Long-running `start.sh` keeps SSH open.** The interactive `ssh -tt` doesn't return until the remote command exits. If `start.sh` runs a server in the foreground, the popup terminal stays connected — that's good for the demo (audience sees the server log live). To detach cleanly: type `~.` in the SSH session, or have `start.sh` background its server with `nohup … &`.

## What's parked, ready to wire (the AXL/MCP integration)

The full Phase 2a vision was: a remote agent on Mac B (`agent-b`) calls AXL's `/mcp/<user-peer>/aws` endpoint → AXL forwards through Yggdrasil to user's Mac → vendored `mcp-router.py` (port 9003) dispatches → `aws.ts` MCP server (port 9100) prompts approval → runs the demo flow.

These pieces exist:
- [`axl/mcp-router.py`](axl/mcp-router.py) — vendored verbatim from `gensyn-ai/axl/integrations/mcp_routing/`
- [`axl/mcp-servers/aws.ts`](axl/mcp-servers/aws.ts) — Express MCP service exposing 4 tools (`open_console`, `launch_instance`, `show_in_console`, `install_nanoclaw`)
- [`axl/mcp-servers/permission.ts`](axl/mcp-servers/permission.ts) — terminal y/n approval gate (serialised via promise chain so concurrent calls don't race on stdin)
- [`scripts/mcp-call.ts`](scripts/mcp-call.ts) — sender CLI: `npm run mcp:call -- <role> <svc> <tool> '<args>'`
- [`scripts/setup-axl.sh`](scripts/setup-axl.sh) already adds `router_addr` + `router_port=9003` to `node-config.json` for the user role, and pip-installs `aiohttp`
- [`scripts/axl-start.sh`](scripts/axl-start.sh) already background-starts `mcp-router.py` + `aws.ts` on the user role and monitors them in the polling loop

What's missing for the AXL integration to work:
1. The aforementioned `@aws-sdk/client-ec2` + `ssh2` deps so `aws.ts` compiles
2. Replace the hardcoded `aws.ts` tools with calls into the **standalone demo scripts** above (so the AXL-routed flow is the same browser walk + SDK launch + SSH install we already have working locally) — i.e. pivot `aws.ts`'s tool implementations from "do the work directly" to "spawn `tsx scripts/demo-before.ts` etc. as child processes"
3. Confirm the AXL-side wiring on a real 3-Mac mesh: agent-b runs `mcp-call user aws walk_through` → user's Mac shows approval prompt + runs the demo

### Verified MCP request shape (from gensyn-ai/axl/integrations/mcp_routing/mcp_router.py)

Sender:
```
POST http://127.0.0.1:9002/mcp/<peer-pubkey>/aws
{ "jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{"name":"...","arguments":{...}} }
```

AXL forwards to `router_addr:router_port` (`http://127.0.0.1:9003/route`):
```
{ "service":"aws", "request": <jsonrpc-above>, "from_peer_id":"<28hex>" }
```

Router POSTs the inner `request` body to the registered service's `/mcp` endpoint with headers `X-From-Peer-Id` (use `matchesPeer()` from `axl/axl.ts` — header is truncated to ~28 hex), `X-Service`. Service prompts approval, runs the tool, returns:
```
{ "jsonrpc":"2.0", "id":1, "result":{ "content":[{"type":"text","text":"<json-stringified result>"}] } }
```

Router wraps as `{response: <jsonrpc>, error: null}` and the response propagates back through AXL to the sender.

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

# Chat UI prototype (Right-Hand workspace + host console)

The user-facing front of Right-Hand AI: a chat interface that simulates dispatching tasks to ENS-discovered specialists, plus a host console for the seller side. Currently mocked — no real backend wiring. Mock data lives in [`lib/mock-data.ts`](lib/mock-data.ts), the orchestration is a `setTimeout`-driven state machine in [`lib/task-runner.ts`](lib/task-runner.ts). It's the demo narrative layer, not the production runtime.

## Pages

| route               | purpose                                                                                  |
|---------------------|------------------------------------------------------------------------------------------|
| `/`                 | original AXL transport demo — preserved from Phase 1                                     |
| `/landing`          | new chat interface — input + mode picker (Solo / Pair / Swarm / Deep) + progress sidebar |
| `/host`             | host console — agent grid, recent invocations, earnings, builder form                    |
| `/agents/[id]`      | agent detail — identity & infra, runtime logs, task history, pricing rules               |
| `/ens-test`         | (existing) ENS register/read                                                             |
| `/tasks`            | (existing) `TaskMarket` post / sign-on                                                   |

## File map

```
components/
  ui/         — primitives: Button, Badge, Card, Input, Tabs, Disclosure, Icon
  layout/     — AppShell (sidebar+topbar grid), Sidebar, TopBar, HostDashboard
  chat/       — ChatInterface (split: messages + TaskProgressPanel),
                ChatInput, ChatMessage, ModePicker, Welcome, ClarifyCard
  host/       — AgentCard, AgentBuilderForm, AgentStatusTable, EarningsPanel
  agents/     — AgentProfile, AgentRuntimePanel, AgentSkillTags
lib/
  mock-data.ts        — HOSTED_AGENTS, RECENT_INVOCATIONS, EXAMPLE_PROMPTS, MODES, NAV_*, HISTORY
  build-script.ts     — buildScript(prompt, mode): TaskScript — branches by prompt regex
  task-runner.ts      — useTaskRunner() React hook, the mock orchestration state machine
types/index.ts        — shared TS types (HostedAgent, TaskScript, ClarifyState, AssistantMessage, …)
```

## Two interaction patterns inside the chat

**Approve/Deny** (used by Japan / WiFi / AWS-config / default flows): the assistant message renders an `ApprovalCard` showing one shell command. User clicks Approve or Deny. Used when the agent has fully decided and just wants permission for a sensitive action.

**Clarify** (used by the AWS+OpenClaw demo flow): when `script.clarifies` is set, `task-runner` pauses the run mid-flight and renders one [`ClarifyCard`](components/chat/ClarifyCard.tsx) per round. Each card has N multiple-choice questions; the user picks one option per question and clicks Continue. Modeled after Claude Code's `AskUserQuestion`. When all questions in a card are answered, the run resumes — and the final report's `reportItems` get template-interpolated with the picks (`{region}` → `us-east-1`, `{instanceType}` → `t3.micro`, etc.).

The AWS+OpenClaw demo runs **two** clarify rounds, one per specialist:

```
prompt: "Deploy OpenClaw on a fresh EC2 instance"
  ↓
[Resolving specialists via ENS] → [Establishing AXL channels] → [Dispatching to AWS Provisioning]
  ↓
ClarifyCard #1 (AWS Provisioning Specialist):
  Q: Which AWS region?       → us-east-1 / us-west-2 / eu-west-1 / ap-southeast-1
  Q: What instance size?     → t3.micro / t3.small / t3.medium
  ↓ Continue
[Dispatching to OpenClaw Deployment]
  ↓
ClarifyCard #2 (OpenClaw Deployment Specialist):
  Q: Which OpenClaw version? → 0.6.2 / 0.7.0-rc
  Q: Admin password?         → Auto-generated / Prompted on install
  ↓ Continue
[Synthesizing final report]
  ↓
Final report — items interpolated with picks
```

## task-runner state machine

[`useTaskRunner()`](lib/task-runner.ts) returns `{ messages, run, busy, pendingApproval, pendingClarify, submit, resolveApproval, resolveClarify }`.

Two flow paths chosen by whether `script.clarifies` is present:

- **Approval flow**: step animation → approval card → on approve: more step animation → final report.
- **Clarify flow**: step animation → clarify[0] card → on submit: step animation + clarify[1] card → on submit: synthesis step → final report. Handles N clarify rounds (one per specialist).

Timing is `setTimeout`-driven via an `at(ms, fn)` helper. All timers clear on unmount or new submit. Phases progress through the `RunPhase` enum (`routing → discovering → executing → clarify | approval → finishing → done`).

## How prompts route to flows

[`buildScript(prompt, mode)`](lib/build-script.ts) regex-matches the prompt and returns a `TaskScript`:

| prompt regex                                        | flow                                                                  |
|-----------------------------------------------------|-----------------------------------------------------------------------|
| `/openclaw.*ec2|ec2.*openclaw|deploy.*openclaw/i`   | AWS+OpenClaw clarify flow (2 specialists, 2 clarify rounds)           |
| `/japan|trip/i`                                     | Japan trip planner approval flow (3 specialists)                      |
| `/wifi|wi-?fi/i`                                    | WiFi diagnostic approval flow (2 specialists)                         |
| `/aws|cloud/i` (without openclaw)                   | AWS config approval flow (2 specialists)                              |
| (default)                                           | OpenClaw bootstrap approval flow (3 specialists)                      |

`mode` (Solo/Pair/Swarm/Deep) trims or extends the specialist list **after** the branch picks them.

## Tailwind setup

The repo runs **Tailwind v4** (`@import "tailwindcss"` in `globals.css`, `@tailwindcss/postcss` plugin). Custom theme tokens live in a `@theme` block in [`styles/globals.css`](styles/globals.css), **not a `tailwind.config.ts`**. Tokens: `bg-bg`, `bg-surface{,-2,-3}`, `text-ink{,-2,-3,-4}`, `border-border{,-strong}`, `bg-accent{,-soft,-fg}`, `shadow-{xs,sm,md}`, `text-2xs`. Fonts: Inter + JetBrains Mono via Google Fonts import in the same file.

## Gotchas

- **All data is mocked.** `HOSTED_AGENTS` and `RECENT_INVOCATIONS` in `lib/mock-data.ts` are fake — not derived from ENS or any contract. By design — the chat UI is the *narrative* layer; actual agent execution lives in Phase 2a's `axl/` + the `demo:final` pipeline.
- **`AppShell`'s grid item children need `h-full` to span row height.** [`TaskProgressPanel`](components/chat/TaskProgressPanel.tsx)'s `<aside>` has `h-full` on it — without that, the content collapses to its natural height while the wrapper grid cell stays full-height, leaving an unstyled gap below. Same pattern applies to any new aside-style panel under `AppShell`.
- **Per-message clarify state is preserved on the `AssistantMessage`** as `clarifies: ClarifyState[]`. Once answered, the card locks (radio shows the pick, no Continue button) — re-rendering the message later still shows the chosen answers. `pendingClarify` is just an index pointer to the active card.
- **Path alias is `@/*` from repo root.** Imports look like `@/components/chat/ClarifyCard`. Configured in `tsconfig.json`.
- **The chat UI is not at `/`.** When it landed, the original AXL transport demo at `/` was preserved; the new chat lives at `/landing`. If you ever want to promote the chat to `/`, move the AXL demo to a sub-route first — don't overwrite.
- **`_app.tsx` wraps everything in `<Providers>` (RainbowKit/wagmi/react-query) AND `<Head>`** with title + viewport. Don't drop either when editing.

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
