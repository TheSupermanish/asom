# asom

The agentic layer for the agent economy — built on [Somnia](https://docs.somnia.network/).

Every AI agent gets a name, an inbox, an ERC-6551 wallet, a reputation tier, and access to consensus-verified compute via Somnia Agents.

Built for the [Encode Club × Somnia Agentathon](https://www.encodeclub.com/programmes/agentathon) (2026-05-20 → 2026-06-10).

## Install

```bash
npm i -g @asom/cli

asom create neo        # → neo@asom: name + ERC-6551 wallet, on-chain, one command
asom resolve neo       # look up any agent (no key needed)
```

`create` needs a funded Shannon key in `PRIVATE_KEY` (env or `.env`); reads don't. Or use the SDK directly:

```bash
npm i @asom/sdk
```

```ts
import { AsomClient } from "@asom/sdk";
const asom = new AsomClient({ privateKey: process.env.PRIVATE_KEY });
const agent = await asom.createAgent("neo", { seedStt: "0.05" });
```

## Status

- **Consensus compute** — `OracleAgent` live on Shannon: wraps the Somnia Agents JSON API for consensus-verified BTC prices on-chain (Tier 5).
- **Identity** — live: `register(name, owner)` mints an agent NFT, deploys its ERC-6551 wallet, and records the name. Shipped as `@asom/sdk` + the `asom` CLI.

## What an agent gets

| Primitive | Status | Where |
|---|---|---|
| **Name** — `neo@asom` resolves on-chain | ✅ | `AgentRegistry` |
| **Wallet** — ERC-6551 token-bound account | ✅ | `AgentAccount` + `ERC6551Registry` |
| **Consensus compute** — Somnia Agents (Qwen3 / JSON API) | ✅ | `OracleAgent` |
| Inbox — `<name>@asom` email | planned | — |
| Reputation tier — Anonymous → Consensus-verified | planned | `AgentReputation` |

## Stack

- **Contracts:** Solidity 0.8.24 (Foundry), OpenZeppelin 5.0.2, ERC-721 + ERC-6551
- **SDK / CLI:** TypeScript, viem ([`@asom/sdk`](./packages/sdk), [`@asom/cli`](./packages/cli))
- **Monorepo:** pnpm workspaces + Turborepo
- **Chain:** Somnia Shannon testnet (chain ID 50312)

## Develop

```bash
pnpm install

# contracts
pnpm contracts:test                # 44 Foundry tests
pnpm --filter @asom/sdk test       # 12 SDK tests (anvil integration + unit)

cp packages/contracts/.env.example packages/contracts/.env   # add PRIVATE_KEY

# CLI from source
pnpm --filter @asom/cli build
node packages/cli/dist/index.js resolve neo
```

Deployed addresses + tx hashes: [`packages/contracts/DEPLOYMENTS.md`](./packages/contracts/DEPLOYMENTS.md).
