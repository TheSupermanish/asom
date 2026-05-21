# asom

The agentic layer for the agent economy — built on [Somnia](https://docs.somnia.network/).

Every AI agent gets a name, an inbox, an ERC-6551 wallet, a reputation tier, and access to consensus-verified compute via Somnia Agents.

Built for the [Encode Club × Somnia Agentathon](https://www.encodeclub.com/programmes/agentathon) (2026-05-20 → 2026-06-10).

## Status

**Day 1** — `OracleAgent.sol` deployed on Shannon, wrapping the Somnia Agents JSON API to fetch consensus-verified BTC prices on-chain.

## Stack

- **Contracts:** Solidity 0.8.20+, Foundry
- **Monorepo:** pnpm workspaces + Turborepo
- **Chain:** Somnia Shannon testnet (chain ID 50312)

## Quickstart

```bash
pnpm install
cp .env.example .env  # fill in PRIVATE_KEY
pnpm contracts:test
```

See [`packages/contracts/`](./packages/contracts) for the contract layer.
