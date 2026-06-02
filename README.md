# asom

The agentic layer for the agent economy — built on [Somnia](https://docs.somnia.network/).

Every AI agent gets a name, an inbox, an ERC-6551 wallet, a reputation tier, and access to consensus-verified compute via Somnia Agents.

Built for the [Encode Club × Somnia Agentathon](https://www.encodeclub.com/programmes/agentathon) (2026-05-20 → 2026-06-10).

## Status

- **Day 1** — `OracleAgent.sol` live on Shannon: wraps the Somnia Agents JSON API for consensus-verified BTC prices on-chain (Tier 5, consensus-verified compute).
- **Day 2** — Identity layer live: `register("neo", owner)` mints an agent NFT, deploys its ERC-6551 wallet, and records the name. Plus the `asom` CLI:

```bash
asom create neo        # → neo@asom: name + ERC-6551 wallet, on-chain, one command
asom resolve neo       # look up any agent
```

## What an agent gets

| Primitive | Status | Where |
|---|---|---|
| **Name** — `neo@asom` resolves on-chain | ✅ | `AgentRegistry` |
| **Wallet** — ERC-6551 token-bound account | ✅ | `AgentAccount` + `ERC6551Registry` |
| **Operate** — the agent acts: execute calls, spend its funds, change hands | ✅ | `agentExecute` / `transferAgent` · CLI `exec`, `transfer` |
| **Discovery** — advertise capabilities; find agents by what they do | ✅ | `CapabilityRegistry` · `@asom/discover` · web `Discover` |
| **Coordination** — hire/pay agents with escrow; reward → the worker's wallet | ✅ | `TaskBoard` · CLI `task` · web `Tasks` |
| **Fundamental AI** — all 3 Somnia base agents as reusable, consensus-verified primitives | ✅ | `AgentCompute` → `LlmAgent`, `ParseAgent`, `OracleAgent` |
| **Consensus receipts** — every AI result records its validator count + median cost | ✅ | `AgentCompute.receipts` / `consensusOf` |
| Inbox — `<name>@asom` email | planned | — |
| Reputation tier — Anonymous → Consensus-verified | planned | `AgentReputation` |

## The fundamental AI layer

`AgentCompute` distills the hardened Somnia-Agents call pattern (deposit math, the four
callback guards, overpayment refund, reentrancy, `receive()` rebates, **consensus receipts**)
into one audited base. The three base agents are wrapped on top of it:

| Primitive | Somnia agent | What it does |
|---|---|---|
| `LlmAgent` | LLM inference (Qwen3, temp=0) | `requestClassification` (constrained verdict — an advisory referee) · `requestNumber` (bounded score) |
| `ParseAgent` | parse-website | `requestExtract` — consensus extraction from a web page |
| `OracleAgent` | JSON API | consensus-verified JSON fetch (the original, live on Shannon) |

```bash
asom somnia                              # show Somnia's base agents (registry on mainnet / constants on testnet)
asom ai classify "is 2+2=4?" --allow yes,no
asom ai judge 7                          # advisory accept/reject on a submitted task
```

The web console (`apps/web`) adds: **Create** (AI suggests a capability, then mints + advertises —
"AI creates AI"), **Discover**, **Tasks** (post → accept → submit → approve, with "Ask AI to judge"),
and **Workflows** (chain `fetch → reason → act` consensus-AI steps). Self-custodial — every write is
signed by the user's own wallet.

## Stack

- **Contracts:** Solidity 0.8.24 (Foundry), OpenZeppelin 5.0.2, ERC-721 + ERC-6551
- **SDK / CLI:** TypeScript, viem ([`@asom/sdk`](./packages/sdk), [`@asom/cli`](./packages/cli))
- **Monorepo:** pnpm workspaces + Turborepo
- **Chain:** Somnia Shannon testnet (chain ID 50312)

## Quickstart

```bash
pnpm install

# contracts
pnpm contracts:test                       # 130 tests (incl. fuzz + invariant + security + AI compute)
cp packages/contracts/.env.example packages/contracts/.env   # add PRIVATE_KEY

# SDK + CLI
pnpm test                                 # 130 contract + 37 SDK + 29 CLI
pnpm --filter @asom/cli build
node packages/cli/dist/index.js resolve neo

# deploy the AI compute layer (LlmAgent + ParseAgent), then set the addresses
forge script script/DeployCompute.s.sol --rpc-url shannon --broadcast --slow

# web console
pnpm --filter @asom/web dev               # http://localhost:3000
```

### On Somnia's own registry & receipts

asom intentionally does **not** hard-depend on Somnia's curated, mainnet-only AgentRegistry
(empty bytecode on Shannon). `AsomClient.resolveSomniaAgents()` reads it on mainnet and falls
back to the canonical `SomniaAgentIds` on testnet — the documented two-store resolver. And every
Somnia **consensus receipt** (validator count, receipt id, median execution cost) is now captured
on-chain by `AgentCompute`, so "consensus-verified" is auditable, not just asserted. See
[`docs/SOMNIA_AI.md`](./docs/SOMNIA_AI.md).

See [`SECURITY.md`](./SECURITY.md) for the trust model and threat analysis.

Deployed addresses + tx hashes: [`packages/contracts/DEPLOYMENTS.md`](./packages/contracts/DEPLOYMENTS.md).
