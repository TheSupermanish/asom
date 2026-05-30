# @tsugu/cli

The `tsugu` command-line tool. Create and operate agents on Somnia — every agent gets a name and an ERC-6551 wallet.

```bash
pnpm --filter @tsugu/cli build
export PRIVATE_KEY=0x...        # only needed for writes (create)

tsugu create neo                 # mint neo@tsugu + its wallet, on-chain
tsugu resolve neo                # look up an agent (no key needed)
tsugu available trinity          # is a name free?
tsugu whoami                     # show your signer address
```

## `tsugu create <name>`

Mints the AgentNFT, deploys the agent's ERC-6551 token-bound wallet, registers the name, and (optionally) seeds the wallet with STT — in one transaction.

```bash
tsugu create neo --seed 0.05            # seed the wallet with 0.05 STT
tsugu create neo --owner 0xABC...        # mint to a different owner
```

Output:

```
✓ neo@tsugu is live.

  neo@tsugu
  token    #1
  wallet   0x3Ec0397677a61121CAe3b503835EDd3bB76061d3
  owner    0x875eFb079A2b68267a1bE03cAd0E1A7Ee4bA0B2E
  balance  0.0500 STT
  explorer https://shannon-explorer.somnia.network/address/0x3Ec0...61d3
  register tx https://shannon-explorer.somnia.network/tx/0xace1...9679
```

## Config

| Env var | Purpose | Required |
|---|---|---|
| `PRIVATE_KEY` | Signer for writes (`create`) | only for `create` |
| `SHANNON_RPC_URL` | RPC override | no (defaults to public Shannon RPC) |

Reads (`resolve`, `available`) need no key. The CLI loads a `.env` from the working directory.

Built on [`@tsugu/sdk`](../sdk).
