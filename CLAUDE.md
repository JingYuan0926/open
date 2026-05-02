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
- Hooks live in [`lib/ens/SpecialistRegistrar.ts`](lib/ens/SpecialistRegistrar.ts):
  - `useRegisterSpecialist` — `useWriteContract` + `useWaitForTransactionReceipt`. Step machine: `idle → registering → confirming → success | error`.
  - `useParentStatus` — reads `isWrapped`, `ownerOf`, and `isApprovedForAll(parentOwner, SPECIALIST_REGISTRAR_ADDRESS)`. `canRegister` is true iff parent is wrapped AND registrar is approved.

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
    SpecialistRegistrar.ts                   # wagmi hooks: useParentStatus + useRegisterSpecialist
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

# Phase 2a — MCP execution via AXL (working)

Phase 1 proved AXL **transport**. Phase 2a proves AXL **execution**: an agent on Mac B/C invokes a tool on Mac A (the user) via AXL's built-in `/mcp/<peer>/<service>` route. Each call shows a y/n approval prompt on the user's terminal before any action runs. Demo target: `agent-b` provisions an EC2 instance on the user's AWS account, then `agent-c` SSHes in and installs nanoclaw — both via MCP, both gated by user approval.

## Architecture

```
agent-b/c Mac                       user's Mac (4 procs)                   AWS / browser
─────────────                       ─────────────────────                  ──────────────

$ npm run mcp:demo:launch                                                      
  │                                                                            
scripts/mcp-call.ts                                                            
  │                                                                            
  ├─ POST :9002/mcp/<u-pk>/aws ──► AXL node ─Yggdrasil─► AXL on user           
                                                              │                
                                                              ▼                
                                                        mcp-router.py :9003    
                                                              │                
                                                              ▼                
                                                  axl/mcp-servers/aws.ts :9100 
                                                              │                
                                                              ├─ permission prompt (y/n)
                                                              │                
                                                              ├──► child_process `open <url>` ──► default browser → AWS console
                                                              ├──► @aws-sdk/client-ec2     ──► EC2 RunInstances
                                                              └──► ssh2 exec                ──► EC2 instance
```

## MCP service: `aws` (4 tools)

| tool | impl | what user sees |
|------|------|----------------|
| `open_console` | `open` shells out to user's default browser with hardcoded launch-wizard URL | AWS launch-instance wizard appears |
| `launch_instance({name?})` | `@aws-sdk/client-ec2` `RunInstances` (AMI `ami-0c02fb55…`, t2.micro, sg `nanoclaw-demo-sg` opens 22, key `nanoclaw-key`) | terminal prints `{instance_id, public_ip}` after ~30s |
| `show_in_console({instance_id})` | `open <instance-detail-URL>` (URL templated with the new ID) | browser navigates to the instance row |
| `install_nanoclaw({instance_id, public_ip})` | `ssh2` SSH (key `axl/nanoclaw-key.pem`) → run `$NANOCLAW_INSTALL_CMD` (default: placeholder echo) | install output streamed to terminal |

URLs in [`axl/mcp-servers/aws-helpers/urls.ts`](axl/mcp-servers/aws-helpers/urls.ts) — swap deep-links for whatever console pages the demo narrative needs (each becomes its own approve-able call).

## Request shape (verified against gensyn-ai/axl)

Sender:
```
POST http://127.0.0.1:9002/mcp/<peer-pubkey>/aws
{ "jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{"name":"launch_instance","arguments":{"name":"…"}} }
```

AXL forwards to `router_addr:router_port` (`http://127.0.0.1:9003`) as:
```
POST /route
{ "service":"aws", "request": <jsonrpc>, "from_peer_id":"<28hex>" }
```

Router POSTs the inner `request` body to `aws.ts /mcp` with headers `X-From-Peer-Id`, `X-Service`. `aws.ts` resolves peer→role via `matchesPeer()` (the same X-From-Peer-Id truncation handler from Phase 1), prompts approval, runs the tool, returns:
```
{ "jsonrpc":"2.0", "id":1, "result":{ "content":[{"type":"text","text":"<JSON>"}] } }
```

Router wraps as `{response: <jsonrpc>, error: null}` and propagates back through AXL to the sender.

## File map

```
axl/
  mcp-router.py                          # vendored verbatim from gensyn-ai/axl/integrations/mcp_routing/
  mcp-servers/
    permission.ts                        # serialised terminal y/n approval gate
    aws.ts                               # Express MCP service on :9100; 4 tools, self-registers with router
    aws-helpers/
      urls.ts                            # hardcoded AWS console URLs (deep-links)
      browser.ts                         # `open <url>` wrapper (macOS)
      ec2.ts                             # @aws-sdk/client-ec2 wrapper (AMI/sg/keypair hardcoded)
      ssh.ts                             # ssh2 wrapper with retry-on-boot
scripts/
  mcp-call.ts                            # sender CLI: POST /mcp/<pk>/<svc> with JSON-RPC envelope
  mcp-demo.sh                            # convenience wrappers for the 4 demo steps
```

## npm scripts

| command | purpose |
|---------|---------|
| `npm run mcp:call -- <role> <svc> <tool> '<json>'` | low-level: any tool on any role |
| `npm run mcp:demo:open` | `aws.open_console` on user |
| `npm run mcp:demo:launch` | `aws.launch_instance` on user (override name with `INSTANCE_NAME=`) |
| `INSTANCE_ID=i-… npm run mcp:demo:show` | `aws.show_in_console` on user |
| `INSTANCE_ID=i-… INSTANCE_IP=x.x.x.x npm run mcp:demo:install` | `aws.install_nanoclaw` on user |

## Setup additions (user role only)

`scripts/setup-axl.sh` for `MACHINE_ROLE=user` adds `"router_addr": "http://127.0.0.1", "router_port": 9003` to `axl/node-config.json` and `pip3 install --user aiohttp` (mcp_router.py's only dep).

`scripts/axl-start.sh` for `MACHINE_ROLE=user` additionally background-starts `python3 axl/mcp-router.py --port 9003` and `tsx axl/mcp-servers/aws.ts` after the AXL node is up. Cleanup trap and polling loop monitor all 4 processes.

For the live demo, the user pre-creates an AWS access key (in `~/.aws/credentials`) and an EC2 keypair `nanoclaw-key` (saved as `axl/nanoclaw-key.pem`, chmod 600). They log into the AWS console in their default browser before stage so cookies persist when `open_console` runs.

## Mock mode

`MCP_AWS_MODE=mock` env var on the user's Mac → handlers skip browser + AWS + SSH and return fake `{instance_id, public_ip}` data after a 2s sleep. Same routing path, no AWS dependency. Useful for testing transport without burning real EC2 minutes.

`MCP_AUTO_APPROVE=1` env var bypasses the y/n prompt (for headless testing only — it defeats the whole point of MCP-as-execution-moat for live demos).

## Phase 2a gotchas

- **`matchesPeer` already handled the X-From-Peer-Id truncation in Phase 1** — `aws.ts` reuses it from `axl/axl.ts` to label the inbound caller as `agent-b` / `agent-c` in the approval prompt. Don't string-equality compare against the full pubkey.
- **mcp-router.py needs aiohttp.** `setup-axl.sh` installs it via `pip3 install --user`. If your Mac's `python3` is from Homebrew Python, the install lands in `~/Library/Python/3.x/lib/...` — `python3 axl/mcp-router.py` finds it automatically.
- **Service registration is at runtime.** `aws.ts` calls `POST /register` on the router on boot; if the router restarts, the service auto-reregisters (router calls go through, error response surfaces in agent's `mcp:call` log).
- **Each tool invocation is independent and serialised.** The permission gate uses a promise chain so two concurrent MCP calls don't race on stdin. For demo, that's fine; for production, swap to a UI-based queue.
- **Phase 1 still works in parallel.** A2A `/a2a/<peer>` and AXL `/send` are unchanged. `axl:send` continues to CC the user; `mcp:call` is additive, not replacing.

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
