# Changelog

All notable changes to tsugu are documented here. Packages are versioned in lockstep.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — 2026-06-02

Production-hardening pass: a security review (contracts, SDK, CLI, keystore) drove a
reentrancy fix + redeploy, the agent-operation capability that completes the platform,
and a much deeper test suite. All flows verified live on Somnia Shannon.

### Security

- **AgentRegistry.register is now `nonReentrant`** and reserves the name before minting.
  The previous order let a contract `owner` re-enter via `_safeMint`'s
  `onERC721Received` and register the same name twice (two agents, one name). The
  vulnerable deployment is deprecated; a guarded stack is redeployed (see
  `packages/contracts/DEPLOYMENTS.md`).
- **Transfer-safe HD index allocation.** New agents take the first HD index whose
  derived address has *never* owned an agent (chain history via `hasEverOwned`), not
  one that merely owns nothing now — so transferring an agent can't make a later
  `create` re-derive the same key.
- **Keystore hardening:** validate `version`/`type` before crypto; bound scrypt params
  (power-of-two `N` in `[2¹⁴, 2¹⁸]`) to block KDF downgrade *and* memory-exhaustion;
  fail loudly on a non-TTY instead of reading an empty secret.
- **OracleAgent:** refund a non-owner's overpayment (no longer trapped); `Refunded`/
  `Withdrawn` events; `withdrawAll`; `nonReentrant` on request/withdraw paths.
- Added [`SECURITY.md`](./SECURITY.md) — trust model, threat analysis, residual risks.

### Added

- **SDK**: `agentExecute(target, { to, value?, data?, operation? })` (drive the agent
  wallet, owner-gated), `transferAgent(name, to)`, `hasEverOwned(owner)`,
  `agentState(account)`, client-side `validateName` / `isValidName` / `parseStt`,
  `agentAccountAbi`, multi-RPC `rpcUrls` fallback transport.
- **CLI**: `tsugu exec` (make an agent act, auto-tops-up the owner key's gas) and
  `tsugu transfer` (hand an agent over). Client-side name + amount validation.
- **Contracts**: fuzz (name validation), invariant (registry guarantees), and
  security/abuse-path test suites.
- **CI**: `.github/workflows/ci.yml` — forge + vitest across all packages.

### Changed

- SDK `createAgent` reads the `AgentRegistered` event for its result instead of
  re-resolving by name. `viem` is now a **peer dependency** of the SDK.
- CLI `--version` is injected from `package.json` at build time (no drift).
- Bumped gas pins for Shannon's ~20× inflation; `hasEverOwned` pages `eth_getLogs`
  in 1000-block windows (Shannon's cap).

### Fixed

- `hasEverOwned` forces a fresh block number (`cacheTime: 0`) so an agent registered
  moments earlier isn't missed by viem's cached head — which would make a just-used
  index look free.
- Doc accuracy: SDK README `{ chain }` (not `chainId`), corrected contract test counts.

### Verified on Shannon

- Identity: create → fund → **agent executes from its own wallet** → transfer; owner-gating
  and monotonic `hasEverOwned` confirmed on-chain.
- OracleAgent: `requiredDeposit` 0.12 STT, request → consensus callback → `latestPrice`
  (BTC $71,169.00, 3 validators).

## [0.0.x] — Day 1–3

Initial OracleAgent, identity layer, SDK, and the encrypted HD keychain CLI.
