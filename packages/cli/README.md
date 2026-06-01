# @tsugu/cli

The `tsugu` command-line tool. Create and operate agents on Somnia — every agent gets a name and an ERC-6551 wallet, **owned by you**.

```bash
npm i -g @tsugu/cli

tsugu login              # create/import your seed once → encrypted keystore
tsugu create neo         # name + wallet, with its own derived key
tsugu resolve neo        # look up any agent (no key needed)
tsugu ls                 # agents you own
tsugu fund neo --wallet 0.05
tsugu exec neo --to 0xRecipient --value 0.01   # the agent acts (spends its own wallet)
tsugu transfer neo 0xNewOwner                  # hand the agent over (name + wallet)
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

The agent's wallet is its own address (receives payments, holds its balance), controlled by the agent's own key derived from your seed. Each agent's funds stay separate. `tsugu fund <name> --wallet <stt>` tops up an agent's wallet later.

## `tsugu exec <name>` — make an agent act

Calls `execute()` on the agent's ERC-6551 wallet, signed by the agent's own key.
The `--value` is spent **from the agent's wallet** (not your funding account); your
funding account only pays gas (and the agent's key is auto-topped-up for gas if empty).

```bash
tsugu exec neo --to 0xRecipient --value 0.01          # send 0.01 STT from neo's wallet
tsugu exec neo --to 0xContract --data 0xabcd1234       # call a contract as neo
```

## `tsugu transfer <name> <to>` — hand an agent over

Transfers the AgentNFT to a new owner. Ownership of the name **and** the wallet (and
its funds) goes with it — no migration. After transfer the agent leaves your local list.

```bash
tsugu transfer neo 0xNewOwner
```

## Other commands

`tsugu available <name>` (is a name free?) · `tsugu whoami` (your funding address) ·
`tsugu key address` / `tsugu key export` · `tsugu logout`.

## Config

| Env var | Purpose |
|---|---|
| `TSUGU_PASSWORD` | Unlock the keystore non-interactively (scripts/CI) |
| `PRIVATE_KEY` | Bypass the keystore (plaintext, testnet shortcut) |
| `SHANNON_RPC_URL` | RPC override |
| `TSUGU_HOME` | Override the tsugu home dir (default `~/.tsugu`) |

No STT to pay gas? The CLI points you at the faucet. Built on [`@tsugu/sdk`](../sdk).
