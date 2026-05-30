# Deployments

## Shannon testnet (chain 50312)

### Identity layer (Day 2) — `<name>@tsugu` agents with ERC-6551 wallets

| Contract | Address |
|---|---|
| **AgentRegistry** (name resolver + factory) | [`0xa98a6d4BC0099D2fc5D1d81a79770592c2a91a08`](https://shannon-explorer.somnia.network/address/0xa98a6d4BC0099D2fc5D1d81a79770592c2a91a08) |
| **AgentNFT** (ERC-721 ownership token) | [`0x7DeD25aEb99e8b31accC1EE658c7E9361D4DAB70`](https://shannon-explorer.somnia.network/address/0x7DeD25aEb99e8b31accC1EE658c7E9361D4DAB70) |
| **ERC6551Registry** (TBA factory) | [`0x4575c8652be0db8bbdc01b43dede8585414b2002`](https://shannon-explorer.somnia.network/address/0x4575c8652be0db8bbdc01b43dede8585414b2002) |
| **AgentAccount** (TBA implementation) | [`0x9b7f1a851e549de4716a548c87734c6bec5acd51`](https://shannon-explorer.somnia.network/address/0x9b7f1a851e549de4716a548c87734c6bec5acd51) |

**First agent registered (2026-05-30):**

| Field | Value |
|---|---|
| name | `neo` (`neo@tsugu`) |
| tokenId | 1 |
| wallet (ERC-6551 TBA) | [`0x3Ec0397677a61121CAe3b503835EDd3bB76061d3`](https://shannon-explorer.somnia.network/address/0x3Ec0397677a61121CAe3b503835EDd3bB76061d3) |
| owner | `0x875eFb079A2b68267a1bE03cAd0E1A7Ee4bA0B2E` |
| seed | 0.05 STT |
| `register` tx | [`0xace1…9679`](https://shannon-explorer.somnia.network/tx/0xace1ccd2655be34e4eb597ddf8edea42541bf8727bbd4c99cfe019506f8e9679) |
| `setMinter` tx | [`0x04ab…0d1c`](https://shannon-explorer.somnia.network/tx/0x04ab8033eef825b3e4b6d4ab887332d767dfaeab76c68930919b85fc7dbd0d1c) |

**Verified on-chain:** predicted wallet == deployed wallet (ERC-6551 CREATE2 determinism), `wallet.token()` returns `(50312, AgentNFT, 1)`, `wallet.owner()` tracks the NFT holder. 24/24 identity tests pass (`test/AgentIdentity.t.sol`).

**Notes for integrators:**
- `register(name, owner)` is payable — forwarded STT seeds the new agent wallet.
- Transfer the AgentNFT → the agent's wallet control transfers with it. No migration.
- Names: lowercase `a-z`, `0-9`, hyphen; 1–32 chars; no leading/trailing/doubled hyphen.
- ERC-1271 (smart-account signatures) is deferred: OZ's SignatureChecker uses the `mcopy` (Cancun) opcode, unavailable on Shannon's pre-Shanghai EVM. OZ pinned to v5.0.2 for the same reason.

---

### OracleAgent (current) — hardened post-review

| Field | Value |
|---|---|
| Address | [`0xC221B027E8Ba0f9c680c3c55533105BC1491Ae79`](https://shannon-explorer.somnia.network/address/0xC221B027E8Ba0f9c680c3c55533105BC1491Ae79) |
| Deployer / owner | `0x875eFb079A2b68267a1bE03cAd0E1A7Ee4bA0B2E` |
| Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Agent ID | `13174292974160097713` (JSON API) |
| Subcommittee size | 3 |
| Per-agent reward | 0.03 STT |
| Required deposit | 0.12 STT |
| Access model | **Caller-pays** — non-owners must forward `msg.value >= requiredDeposit()`. Owner may spend contract balance. |

**Deploy + seed (2026-05-21):**

| Step | Block | Tx |
|---|---|---|
| Deploy | 388,449,876 | [`0x924a...0162`](https://shannon-explorer.somnia.network/tx/0x924a83e659b5c33f2da3e84fc11e44a95028774083fa6a72e8ba7c2b12860162) (15.9M gas) |
| Seed (0.15 STT) | — | [`0xe550...a808e`](https://shannon-explorer.somnia.network/tx/0xe55031f683b8afd1610f3883ed2d994d76b028b1ae8586192e871566869a808e) |
| `requestBitcoinPrice()` | 388,450,063 | [`0x63f7...ec2d`](https://shannon-explorer.somnia.network/tx/0x63f79f26d14ae67d930728ed3725607de674b4d4d8d99013abe66f61c11cec2d) (655k gas) |

**Result:** `latestPrice = 7,715,000,000,000` → **BTC = $77,150.00** (8 decimals, consensus of 3 validators)

### OracleAgent v1 (deprecated)

| Field | Value |
|---|---|
| Address | [`0x272A6F953C17FB528aE0d5085629A9024F1c6DE0`](https://shannon-explorer.somnia.network/address/0x272A6F953C17FB528aE0d5085629A9024F1c6DE0) |
| Status | **Deprecated.** Open-callable `requestUintFromJson` permitted DoS + arbitrary-URL attacks against contract balance. Funds withdrawn back to owner. |
| Withdraw tx | [`0x3a45...d141`](https://shannon-explorer.somnia.network/tx/0x3a4599c83b80d281642d96336cb5b5b12200072c88933c960592e4009969d141) |

Do not use. Reference only for the history of the initial Day-1 deploy.

## Notes for integrators

- **Reading** `latestPrice()` and `lastUpdated()` is free (view functions, no gas). Always check `block.timestamp - lastUpdated()` before trading on the value — there is no automatic staleness guard.
- **Requesting** a fresh price costs `requiredDeposit()` (currently 0.12 STT). Send it as `msg.value` if you are not the contract owner.
- All four canonical Somnia Agents pitfalls (deposit math, `receive()`, callback gating, status branching) are tested in `test/OracleAgent.t.sol` (20/20 passing).
- See `src/agents/lib/SomniaAgents.sol` for the canonical platform types — pin imports against this file, not the docs directly, so a doc revision can't silently break compilation.
