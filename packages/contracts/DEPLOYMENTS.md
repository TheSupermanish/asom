# Deployments

## Shannon testnet (chain 50312)

### OracleAgent — JSON API wrapper

| Field | Value |
|---|---|
| Address | [`0x272A6F953C17FB528aE0d5085629A9024F1c6DE0`](https://shannon-explorer.somnia.network/address/0x272A6F953C17FB528aE0d5085629A9024F1c6DE0) |
| Deployer | `0x875eFb079A2b68267a1bE03cAd0E1A7Ee4bA0B2E` |
| Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Agent ID | `13174292974160097713` (JSON API) |
| Subcommittee size | 3 |
| Per-agent reward | 0.03 STT |
| Required deposit | 0.12 STT |

### Day 1 demo transactions (2026-05-21)

| Step | Block | Tx | Notes |
|---|---|---|---|
| Deploy | 388,321,070 | [`0x8456...c264`](https://shannon-explorer.somnia.network/tx/0x84561db624e638a04005520e85790cb3732055c8bfe55440c8b3fef4c6bbc264) | 15.5M gas |
| Seed (0.3 STT) | — | [`0x2f12...c660`](https://shannon-explorer.somnia.network/tx/0x2f1205b2bd45f69a06ec067aa30ecceadb7023545e485029f4d60545aab4c660) | 40k gas |
| `requestBitcoinPrice()` | 388,321,586 | [`0xe673...070e`](https://shannon-explorer.somnia.network/tx/0xe673ee058ee5e3935c2455a88eb0e3c06bc27aa0cae3527566f293eb0c6f070e) | requestId 892349, 655k gas |
| Platform callback | 388,321,591 | [`0x5f17...183f`](https://shannon-explorer.somnia.network/tx/0x5f17adf94d2e207486a6a1324cf7932e553cc6ff6fb4b1039de70bcd9344183f) | 5 blocks after request |

**Result:** `latestPrice = 7,707,800,000,000` → **BTC = $77,078.00** (8 decimals, consensus of 3 validators)
