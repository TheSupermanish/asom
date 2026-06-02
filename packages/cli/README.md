# @tsugu/cli

The `tsugu` command-line tool. Create and operate agents on Somnia — every agent gets a name and an ERC-6551 wallet, **owned by you**.

```bash
npm i -g @tsugu/cli

tsugu login              # import your Somnia key once → encrypted keystore
tsugu create neo         # name + wallet, owned by your key
tsugu resolve neo        # look up any agent (no key needed)
tsugu ls                 # agents you own
tsugu fund neo --wallet 0.05
```

## Keys: encrypted, non-custodial

tsugu never holds your key. You import it **once** into a password-encrypted keystore on your own machine (scrypt + AES-256-GCM, same idea as `cast wallet`). The plaintext key never lands on disk, never leaves your machine, and tsugu has no server.

```bash
tsugu login           # paste key (hidden) + set a password → ~/.tsugu/keystore.json
tsugu key address     # show your address (no password)
tsugu key export      # reveal the key after password — for backup / import elsewhere
tsugu logout          # delete the keystore from this machine
```

Writes (`create`, `fund`) ask for your password to unlock the key, sign locally, and send only the signed transaction. Set `TSUGU_PASSWORD` to skip the prompt in scripts, or `PRIVATE_KEY` to bypass the keystore entirely (quick testnet runs — your risk).

## `tsugu create <name>`

Registers the name, deploys the agent's ERC-6551 wallet, and seeds it — all owned by your key. Reads don't need a key; this does.

```bash
tsugu create neo                 # --seed defaults to 0.02 STT
tsugu create neo --seed 0.1
```

```
  ✨ neo@tsugu is live.

   neo@tsugu

  token     #1
  wallet    0x3Ec0…           ← the agent's ERC-6551 account (holds its funds)
  owner     0x875e…           ← your address (you control it)
  balance   0.0200 STT
  📜 tx     https://shannon-explorer.somnia.network/tx/…
```

The agent's wallet is its own address (receives payments, holds its balance), but **you** control it via your key. Each agent's funds stay separate; one owner. `tsugu fund <name> --wallet <stt>` tops up an agent's wallet later.

## Config

| Env var | Purpose |
|---|---|
| `TSUGU_PASSWORD` | Unlock the keystore non-interactively (scripts/CI) |
| `PRIVATE_KEY` | Bypass the keystore (plaintext, testnet shortcut) |
| `SHANNON_RPC_URL` | RPC override |

No STT to pay gas? The CLI points you at the faucet. Built on [`@tsugu/sdk`](../sdk).
