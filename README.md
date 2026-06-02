# tsugu

The agentic layer for the agent economy — built on [Somnia](https://docs.somnia.network/).

Every AI agent gets a name, an inbox, an ERC-6551 wallet, a reputation tier, and access to consensus-verified compute via Somnia Agents.

Built for the [Encode Club × Somnia Agentathon](https://www.encodeclub.com/programmes/agentathon) (2026-05-20 → 2026-06-10).

## Status

- **Day 1** — `OracleAgent.sol` live on Shannon: wraps the Somnia Agents JSON API for consensus-verified BTC prices on-chain (Tier 5, consensus-verified compute).
- **Day 2** — Identity layer live: `register("neo", owner)` mints an agent NFT, deploys its ERC-6551 wallet, and records the name. Plus the `tsugu` CLI:

```bash
tsugu create neo        # → neo@tsugu: name + ERC-6551 wallet, on-chain, one command
tsugu resolve neo       # look up any agent
```

## What an agent gets

| Primitive | Status | Where |
|---|---|---|
| **Name** — `neo@tsugu` resolves on-chain | ✅ | `AgentRegistry` |
| **Wallet** — ERC-6551 token-bound account | ✅ | `AgentAccount` + `ERC6551Registry` |
| **Operate** — the agent acts: execute calls, spend its funds, change hands | ✅ | `agentExecute` / `transferAgent` · CLI `exec`, `transfer` |
| **Consensus compute** — Somnia Agents (Qwen3 / JSON API) | ✅ | `OracleAgent` |
| Inbox — `<name>@tsugu` email | planned | — |
| Reputation tier — Anonymous → Consensus-verified | planned | `AgentReputation` |

## Stack

- **Contracts:** Solidity 0.8.24 (Foundry), OpenZeppelin 5.0.2, ERC-721 + ERC-6551
- **SDK / CLI:** TypeScript, viem ([`@tsugu/sdk`](./packages/sdk), [`@tsugu/cli`](./packages/cli))
- **Monorepo:** pnpm workspaces + Turborepo
- **Chain:** Somnia Shannon testnet (chain ID 50312)

## Quickstart

```bash
pnpm install

# contracts
pnpm contracts:test                       # 65 tests (incl. fuzz + invariant + security)
cp packages/contracts/.env.example packages/contracts/.env   # add PRIVATE_KEY

# SDK + CLI
pnpm test                                 # 65 contract + 27 SDK + 28 CLI
pnpm --filter @tsugu/cli build
node packages/cli/dist/index.js resolve neo
```

See [`SECURITY.md`](./SECURITY.md) for the trust model and threat analysis.

Deployed addresses + tx hashes: [`packages/contracts/DEPLOYMENTS.md`](./packages/contracts/DEPLOYMENTS.md).
