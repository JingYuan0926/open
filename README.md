# Right-Hand AI

> **AnyDesk, but for AI.** Instead of a human helper taking over your machine to fix something, an entire swarm of AI specialists shows up and solves it for you — with your approval at every step.

> **Claude gives one assistant tools. Right-Hand AI gives chat access to a swarm of specialists.**

**Right-Hand AI is a ChatGPT-style chat for getting things done.** You type one request, and the system routes it to a swarm of specialist agents — connected over Gensyn AXL, owned as 0G iNFTs, discovered via ENS — that plan, configure, buy, troubleshoot, or prepare actions on your real machine, with your approval.

```text
User: Plan my Japan trip under $1,200.
Right-Hand AI: I'll bring in a flight agent, hotel agent, itinerary agent, and budget checker.

User: Configure my AWS project safely.
Right-Hand AI: I'll bring in an AWS config agent, security reviewer, and cost checker.

User: Troubleshoot my PC WiFi.
Right-Hand AI: I'll bring in a network diagnostic agent and local device agent.
```

No MCP servers to configure. No workflows to design. **One lightweight connector** (a single binary that bundles a local AXL node + MCP servers + permission UI), then just chat. You ask, a swarm shows up.

---

## The Problem

The difference is **not** "execution." Claude and ChatGPT can already execute things — Claude Code edits files and runs commands, ChatGPT Agent navigates websites and fills forms. Execution is table stakes.

The real gap is the **friction stack** the user has to climb to get there. Every "AI assistant" today still asks you to know:

- which tool to connect
- which MCP server to install
- which permissions to give
- which workflow to run
- how to interpret the result

That's the gap Right-Hand AI closes. You don't pick tools. You don't install MCPs. You don't configure agents. You type a goal, pick Solo or Swarm, and a community-owned mesh of specialists figures it out, runs it in parallel, and reports back.

Use cases the user shouldn't have to engineer themselves:

- Plan and prepare a Japan trip
- Configure AWS safely
- Troubleshoot PC WiFi
- Set up a printer
- Install OpenClaw or any other dev tool
- Prepare insurance or reimbursement claims
- Organize files and submit forms

Today, every one of these requires you to know which tool, which prompt, which sequence. Right-Hand AI hides all of it behind a chat box.

---

## The Solution

Right-Hand AI is an **execution-capable AI chat** for everyone — developer or not. You chat with it like Claude or ChatGPT. It does the work instead of explaining it.

The twist: every specialist agent is a **community-owned iNFT**. Anyone can mint one. Anyone can earn when it's used. There's no Anthropic, no OpenAI, no central server in the middle — just a peer-to-peer mesh of specialists, discovered via ENS, communicating over Gensyn AXL.

- **You install** a lightweight local connector (one binary + permission UI). No terminal needed after this.
- **You chat** in plain English. *"Plan and book my Japan trip."* *"Fix my AWS bill alerts."* *"My Postgres won't start."*
- **A coordinator agent** picks up the task, finds the right specialists on the network via ENS (a travel specialist, an AWS specialist, a Postgres specialist…), delegates over AXL, and requests permission to take local actions through MCP.
- **You approve each sensitive action.** Agents run only what you allow — opening your browser, touching your AWS creds, editing a config file, sending an email.
- **0G Storage remembers everything** — your chat history (encrypted, yours), each specialist's embedded intelligence (encrypted on 0G Storage, bound to the iNFT), task logs, preferences, your environment. So the next time you ask for something related, the swarm already knows you fly economy and prefer Tokyo over Osaka.

### Why not just use Claude / ChatGPT / Operator / Cursor?

| | Claude.ai, ChatGPT Agent | Operator, Computer Use, Devin | Claude Code, Cursor | **Right-Hand AI** |
|---|---|---|---|---|
| Interface | Web chat | Web chat | **Terminal / IDE** | **Web chat** |
| Execution | Some (via tools/MCPs) | Yes | Yes | **Yes** |
| Where actions run | User's connected tools | Their cloud sandbox | Your machine | **Your machine** |
| Setup the user has to do | **Connect tools, configure MCPs** | None | **CLI, config files, MCP servers** | **One-line connector install** |
| Agent model | One main assistant | One main assistant | One assistant | **Many specialists routed by a coordinator** |
| Speed on multi-step tasks | Sequential | Sequential | Sequential tool calls | **Parallel swarm** |
| Discovery of new skills | Platform tool catalog | Built-in only | **You write/install MCP tools** | **Open ENS / AXL specialist network** |
| Ownership | Platform-owned | Platform-owned | Anthropic | **Community / hoster-owned iNFT agents** |
| Memory | Platform memory | Vendor-controlled | Local files | **0G Storage — encrypted chat history, embedded intelligence per agent, task workspace, all portable** |
| Payment | Subscription | Subscription | Subscription | **Subscription or per-task x402 / USDC, paid to specialist owners** |
| Needs CLI / dev skills | No | No | **Yes** | **No** |

The shortest version: **Claude gives one assistant tools. Right-Hand AI is a chat-first execution network — type the goal, pick Solo or Swarm, and AXL-connected specialists coordinate in parallel under your approval. 0G stores the memory, ENS makes specialists discoverable, MCP keeps actions safe. No MCPs to wire up. No workflows to design. One lightweight connector, then just chat.**

---

## In one paragraph

**Right-Hand AI is a ChatGPT-style execution interface powered by a registry of OpenClaw iNFT specialists.**

Contributors train an OpenClaw specialist, upload its encrypted intelligence and memory to 0G Storage, register it as an iNFT on 0G Chain, and expose it as an AXL node.

Users type a goal, choose Solo or Swarm, and the coordinator discovers the right specialists through ENS, connects through AXL, stores shared work on 0G, and requests approved actions through MCP.

The iNFT is not for flipping. It is the specialist's **network identity, memory pointer, payment rule, and proof of ownership.**

> **Right-Hand AI is not an NFT marketplace. It is an open execution network where trained OpenClaw specialists are registered as 0G iNFTs, discovered through ENS, coordinated over AXL, and summoned from a simple chat interface to get real tasks done.**

---

## How It Works

### Two-sided product

**User side** — ask for help, approve actions, get the job done.

**Contributor side** — mint a specialist agent as an iNFT. You own it. You earn every time someone in the network uses it.

### Architecture

```
User Frontend
├── chat input
├── Solo / Swarm picker
├── task progress + AXL/MCP traffic panel
└── final report

User PC (Right-Hand Connector)
├── Local AXL node
├── Local MCP servers (filesystem, terminal, configs)
└── Permission approval UI

Hosted Specialist Agents (each = one iNFT)
├── Coordinator
├── OpenClaw Setup Specialist
├── Dependency Specialist
├── Verification Specialist
└── (anyone can mint and add more)

AXL Layer (Gensyn)
├── peer discovery
├── encrypted P2P agent ↔ agent
├── cloud agent ↔ user PC bridge
└── MCP routing for local tool calls

ENS Layer
├── subname per specialist (e.g. postgres-debug.righthand.eth)
└── text records: axl_pubkey, skills, 0g_workspace_uri, price

0G Layer
├── 0G Chain      → iNFT registration, ownership, royalty + mint payments
├── 0G Storage    → encrypted chat history + per-agent embedded intelligence
│                   + private memory per specialist + shared swarm workspace
│                   + logs, configs, final reports
├── 0G Compute    → all agent reasoning (OpenAI-compatible inference)
└── iNFT (ERC-7857) → agents with embedded intelligence encrypted on 0G Storage
```

---

## User Flow

1. **Install the connector** (one command):

   ```bash
   curl -sL righthand.ai/install | bash
   ```

   Spins up local AXL node + MCP servers + permission UI.

2. **Open the web app and type:**

   > *"Install OpenClaw and run the sample agent"*

3. **Pick how many agents you want on the task.** This is the speed-vs-cost dial — more agents work in parallel and finish faster, fewer agents cost less but take longer.

   | Mode | Agents | Speed | Cost / task | Best for |
   |---|---|---|---|---|
   | **Solo** | 1 specialist | Slowest — one agent does every step | **~$0.05** | Simple, single-domain tasks ("install OpenClaw") |
   | **Pair** | 2 specialists | ~2× faster, one cross-checks the other | **~$0.10** | Anything you want a second opinion on (AWS config, security) |
   | **Swarm** | 3–5 specialists | Subtasks run in parallel | **~$0.20** | Multi-domain tasks (Japan trip = flight + hotel + itinerary + budget) |
   | **Deep Swarm** | 5+ with iterative loops | Plan → critique → re-plan | **~$0.50** | Hard troubleshooting, ambiguous goals |

   You can also flip mid-task: start Solo, escalate to Swarm if the agent gets stuck.

4. **Coordinator agent** queries ENS for relevant specialists, fetches their AXL public keys, and connects.

5. **Plan shown** — you click Approve.

6. **Each local action requires explicit approval** via MCP:

   ```
   Dependency Specialist wants to run:
     node --version
     python3 --version
     git --version
   [Approve] [Deny]
   ```

7. **Agents execute**, write artifacts to a shared 0G Storage workspace, and produce a final report.

8. **Task memory persists on 0G.** Next time you ask for related help, agents pick up where they left off.

---

## Contributor Flow

Right-Hand AI is **a network of iNFTs**, not a marketplace of NFTs for sale. There's no minting-to-flip, no speculation. iNFTs are **registered specialists** that anyone can use over the network — and optionally mint a **local licensed instance** of for their own machine.

Users don't mint copies of the same iNFT. They mint **licensed local instances** derived from the registered specialist. The original iNFT remains the canonical network agent; each local instance gets its own private memory and pays a one-time license fee to the iNFT owner.

If you want to contribute or earn, three steps.

### 1. Train your OpenClaw agent

Build a specialist on 0G's stack:

- **Persona + skills** — what it's good at (e.g. *"expert at diagnosing Postgres startup issues across macOS / Linux / WSL"*, *"plans Japan trips on a $1,200 budget"*).
- **Inference** runs on **0G Compute** (OpenAI-compatible Router) — no vendor lock-in.
- **Encrypted memory** lives in **0G Storage**. Each invocation can read/write here, so the specialist actually gets smarter over time.
- **Runtime** is OpenClaw, hosted by you (laptop, VPS, anywhere — or a hosting provider).

### 2. Upload as an iNFT (= register on the network)

Publishing the agent **registers** it on Right-Hand AI. There's no pre-sale, no auction, no "rare drop." It's a network identity.

- **Register on 0G Chain** as an ERC-7857 iNFT — the token *is* the agent. Encrypted intelligence binding, on-chain ownership, no copies needed for the network to use it.
- **ENS subname** auto-assigned (e.g. `postgres-debug.righthand.eth`). Text records carry your `axl_pubkey`, `skills`, `0g_workspace_uri`, `version`, `price` (per-call + optional local-mint fee). This is the discovery layer.
- **AXL node** spawns, joins the mesh, listens. Coordinators across the network can now dial your iNFT directly.

```bash
righthand publish-specialist \
  --skill postgres-debug \
  --persona "expert at diagnosing Postgres startup issues" \
  --call-price 0.05 \
  --local-mint-price 5
```

One command. 0G + ENS + AXL all wired up.

### 3. Your specialist goes live, you earn

Once registered, your specialist becomes discoverable on the network.

The iNFT itself does not literally run code. It owns the **agent identity, encrypted memory pointer, skill manifest, and payment rules**. The runtime is hosted by you, by a hosting provider, or by a user who mints a local licensed instance.

- **Network use** — coordinators call your hosted specialist over AXL. You earn 0G tokens (or x402/USDC) per call.
- **Local licensed instance (optional)** — users can mint a private runnable instance for their own machine. Encrypted intelligence re-keys to the new instance; their memory stays private. You earn from each license.
- **Reputation** accrues to the iNFT (success rate, invocations, ratings). A well-trained specialist gets routed more, earns more, and is worth more to license locally.

**Train once. Register once. The network handles discovery, calls, and payments.**

---

## Two ways to use a specialist

| | Network use (default) | Local licensed instance (optional) |
|---|---|---|
| Where it runs | Creator's hosted runtime, dialed via AXL | Your own machine |
| Cost | Per-call (cheap) | One-time license fee |
| Privacy | Encrypted in transit, creator hosts the runtime | 100% local, memory stays on your hardware |
| Best for | Most users, most tasks | Sensitive data, offline, ultra-low latency |
| Pays the creator | Per-call royalty | License fee at instance time |

The user picks per-task — same chat box, different toggle.

---

## Sponsor Integration

This project submits to:

### 0G — Track 2: Best Autonomous Agents, Swarms & iNFT Innovations ($7,500)

We use all four 0G services in real time, not just at init:

| Service | Role |
|---|---|
| 0G Chain | Register iNFT for each specialist; route per-call royalties + local-mint payments |
| 0G Storage | **Chat history** (encrypted, per user); **embedded intelligence** (the agent's encrypted weights/state, bound to the iNFT); private memory per specialist; shared workspace per swarm; logs, configs, final reports |
| 0G Compute | All agent inference — Coordinator, OpenClaw specialists, Verifier — via the OpenAI-compatible Router |
| iNFT (ERC-7857) | **Agents with embedded intelligence (encrypted on 0G Storage)** — token *is* the agent, ownership = network identity, optional local-mint re-keys the encrypted intelligence to the new owner |

**Swarm pattern:** when the user picks Swarm mode, a Coordinator and 2+ specialists collaborate via shared 0G Storage workspace + 0G Compute inference, exactly as Track 2's prize text describes.

**iNFT proof:** every registered specialist appears on the 0G ChainScan with encrypted-intelligence metadata pointing to its 0G Storage URI. Onchain ownership = onchain agent. Chat sessions are also written to 0G Storage (encrypted, scoped to the user) so memory is portable across machines and survives reinstalls.

### Gensyn — Best Application of AXL ($5,000)

AXL is load-bearing in two places:

1. **Agent ↔ Agent:** Coordinator and specialist nodes run on separate machines and communicate over the AXL mesh. Discovery via ENS, transport via AXL, end-to-end encrypted.
2. **Cloud Agent ↔ User PC:** the user's local AXL node exposes MCP servers (filesystem, terminal). Cloud-hosted agents reach into the user's machine through AXL/MCP to take approved local actions. This is what makes Right-Hand AI distinct from ChatGPT-style assistants.

Each minted iNFT corresponds to one separate AXL node — satisfying the "node-to-node, not in-process" requirement automatically.

A `FEEDBACK.md` file at the repo root documents our builder experience with AXL.

### ENS — Most Creative Use of ENS ($2,500)

ENS is the agent directory — without it AXL has no way to find peers.

Each specialist iNFT writes the following ENS text records:

| Key | Value |
|---|---|
| `axl_pubkey` | AXL public key (used to dial the agent) |
| `skills` | Comma-separated skill list (e.g. `postgres-debug,linux-troubleshoot`) |
| `0g_workspace_uri` | Pointer to the agent's 0G Storage memory |
| `0g_token_id` | Link back to the iNFT |
| `price` | Per-call fee in 0G tokens |
| `version` | Agent version |

**Discovery flow:** Coordinator queries ENS for agents whose `skills` text record contains the needed capability, fetches their `axl_pubkey`, and connects.

This is subnames-as-access-tokens + text-records-as-capabilities — the exact pattern ENS Creative rewards.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity (ERC-7857), Hardhat, deployed on 0G Chain |
| Storage SDK | `@0gfoundation/0g-ts-sdk` |
| Compute | 0G Compute Router (OpenAI-compatible API) |
| Agent runtime | OpenClaw |
| P2P transport | AXL (Gensyn) — Go binary |
| Local tool access | MCP (Model Context Protocol) servers |
| Identity / discovery | ENS subnames + text records, ENSjs + viem |
| Frontend | Next.js, TailwindCSS |
| Local connector | Single binary (Go), embeds AXL + MCP + permission UI |

---

## Setup (Local Development)

### Prerequisites

- Node.js 20+, pnpm
- Go 1.25.5+ (for AXL build)
- A wallet with 0G testnet tokens — get them from https://faucet.0g.ai

### Clone & install

```bash
git clone https://github.com/<your-org>/right-hand-ai
cd right-hand-ai
pnpm install
```

### Configure

Copy `.env.example` to `.env` and fill in:

```bash
NEXT_PUBLIC_OG_RPC=https://evmrpc-testnet.0g.ai
NEXT_PUBLIC_OG_CHAIN_ID=16602
NEXT_PUBLIC_OG_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
OG_COMPUTE_API_KEY=<from https://router-api.0g.ai>
OG_COMPUTE_ENDPOINT=https://router-api-testnet.integratenetwork.work/v1
ENS_PARENT_DOMAIN=righthand.eth
0G_PRIVATE_KEY=0x...
```

### Deploy iNFT contract

```bash
pnpm hardhat run scripts/deploy-inft.ts --network testnet
# copy the address into .env as INFT_CONTRACT_ADDRESS
```

### Start AXL bootstrap node

```bash
cd axl && make build
./node -config configs/bootstrap.json
# expose port 9001 publicly
```

### Run the web app

```bash
pnpm dev
# -> http://localhost:3000
```

### Install the local connector (as a user)

```bash
curl -sL http://localhost:3000/install.sh | bash
```

This downloads the AXL binary, generates a keypair, installs read-only filesystem and sandboxed terminal MCP servers, and prints a pairing code.

### Mint your first specialist (as a contributor)

```bash
righthand mint-specialist \
  --skill openclaw-setup \
  --persona "expert at OpenClaw installation across macOS / Linux / WSL" \
  --price 0.05
```

---

## Project Structure

```
right-hand-ai/
├── contracts/           # ERC-7857 iNFT contracts
├── scripts/             # Hardhat deploy scripts
├── web/                 # Next.js frontend
├── coordinator/         # Coordinator agent (OpenClaw + AXL + 0G)
├── specialists/         # Specialist agent templates
│   ├── openclaw-setup/
│   ├── dependency/
│   └── verification/
├── connector/           # Local Right-Hand Connector (Go)
│   ├── axl/             # vendored AXL build
│   ├── mcp-filesystem/
│   ├── mcp-terminal/
│   └── permission-ui/
├── cli/                 # `righthand` CLI for contributors
├── lib/
│   ├── 0g-storage.ts    # storage SDK helpers
│   ├── 0g-compute.ts    # OpenAI-SDK wrapper for 0G Router
│   ├── ens-registry.ts  # subname + text record management
│   └── inft.ts          # mint / transfer helpers
├── FEEDBACK.md          # Gensyn AXL builder feedback
└── README.md            # this file
```

---

## MVP Scope

### Built for hackathon submission

- Frontend: chat input + Solo/Swarm picker + AXL/MCP traffic panel
- Local connector: AXL node + filesystem MCP + terminal MCP + permission UI
- Coordinator agent (OpenClaw on 0G Compute)
- 3 specialist agents: OpenClaw Setup, Dependency, Verification
- iNFT contract deployed on 0G testnet (ERC-7857)
- `righthand mint-specialist` CLI
- ENS subname registration + skill text records
- ENS-based specialist discovery
- AXL agent ↔ agent communication across separate nodes
- AXL cloud-agent ↔ user-PC bridge with MCP
- 0G Storage shared task workspace per swarm
- 0G Compute inference for all agents
- Per-call royalty payment to specialist owner (0G tokens)
- Final setup report saved to 0G Storage

### Roadmap (not in MVP)

- iNFT transfer flow with memory re-keying
- Marketplace UI for browsing specialists
- Reputation system (success rate per specialist)
- x402 / USDC payment integration
- Multi-OS connector (Windows native, beyond WSL)
- Subscription tier
- Specialist auto-discovery improvements (clustering, skill-graph search)
- Mobile companion app

### Out of scope

- Full agent autonomy without per-action approval (intentionally not built — trust is the moat)
- Auto-installation of arbitrary unsigned binaries
- Cross-chain agent ownership
his is 
---

## Demo

- **Video (under 3 min):** [LINK]
- **Live demo:** [LINK]
- **iNFT explorer (specialist examples):** https://chainscan-galileo.0g.ai/token/<INFT_CONTRACT_ADDRESS>

### Demo script (90 sec user flow + 45 sec contributor flow)

**Part A — User**

1. Open Right-Hand AI, type *"Install OpenClaw and run a sample agent"*
2. Pick 3-Agent Swarm
3. Watch Coordinator query ENS, find specialists, dial via AXL
4. Plan appears, click Approve
5. MCP approval prompts fly past as agents inspect, install, configure
6. Final report: *"OpenClaw running. Sample agent responded."*

**Part B — Contributor**

1. *"And anyone can add a specialist."*
2. Run `righthand mint-specialist --skill postgres-debug --price 0.05`
3. iNFT minted on 0G, ENS subname assigned, AXL node online
4. Switch to a different user — type *"my Postgres won't start"*
5. Coordinator finds the new specialist instantly, routes the task
6. Side-by-side: user's 0G balance drops 0.05, contributor's wallet increases by their cut

Closing line: *"AXL coordinated. MCP did the work. 0G remembered it. ENS made it all discoverable. And the specialists belong to the people who built them."*

---

## Contract Addresses (0G Testnet)

| Contract | Address |
|---|---|
| Right-Hand Specialist iNFT (ERC-7857) | `0x...` |
| ENS subname registrar | `0x...` |
| Royalty router | `0x...` |

Block explorer: https://chainscan-galileo.0g.ai

---

## Team

| Name | Role | Contact |
|---|---|---|
| [Your name] | [Role] | Telegram: @... / X: @... |
| [Teammate] | [Role] | Telegram: @... / X: @... |

---

## Acknowledgments

- **0G Foundation** — for the iNFT standard, decentralized inference, and storage that make agent ownership real
- **Gensyn** — for AXL, the encrypted P2P transport that lets agents talk without a central server
- **ENS** — for making agent discovery as simple as a name lookup
- **OpenClaw** — for the open agent framework every specialist runs on

---

## License

MIT
