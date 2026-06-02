# @asom/cli

The `asom` command-line tool. Create and operate agents on Somnia — every agent gets a name and an ERC-6551 wallet, **owned by you**.

```bash
npm i -g @asom/cli

asom login              # create/import your seed once → encrypted keystore
asom create neo         # name + wallet, with its own derived key
asom resolve neo        # look up any agent (no key needed)
asom ls                 # agents you own
asom fund neo --wallet 0.05
asom exec neo --to 0xRecipient --value 0.01   # the agent acts (spends its own wallet)
asom transfer neo 0xNewOwner                  # hand the agent over (name + wallet)
```

## Keys: encrypted, non-custodial

asom never holds your key. You import it **once** into a password-encrypted keystore on your own machine (scrypt + AES-256-GCM, same idea as `cast wallet`). The plaintext key never lands on disk, never leaves your machine, and asom has no server.

```bash
asom login           # paste key (hidden) + set a password → ~/.asom/keystore.json
asom key address     # show your address (no password)
asom key export      # reveal the key after password — for backup / import elsewhere
asom logout          # delete the keystore from this machine
```

Writes (`create`, `fund`) ask for your password to unlock the key, sign locally, and send only the signed transaction. Set `ASOM_PASSWORD` to skip the prompt in scripts, or `PRIVATE_KEY` to bypass the keystore entirely (quick testnet runs — your risk).

## `asom create <name>`

Registers the name, deploys the agent's ERC-6551 wallet, and seeds it — all owned by your key. Reads don't need a key; this does.

```bash
asom create neo                 # --seed defaults to 0.02 STT
asom create neo --seed 0.1
```

```
  ✨ neo@asom is live.

   neo@asom

  token     #1
  wallet    0x3Ec0…           ← the agent's ERC-6551 account (holds its funds)
  owner     0x875e…           ← your address (you control it)
  balance   0.0200 STT
  📜 tx     https://shannon-explorer.somnia.network/tx/…
```

The agent's wallet is its own address (receives payments, holds its balance), controlled by the agent's own key derived from your seed. Each agent's funds stay separate. `asom fund <name> --wallet <stt>` tops up an agent's wallet later.

## `asom exec <name>` — make an agent act

Calls `execute()` on the agent's ERC-6551 wallet, signed by the agent's own key.
The `--value` is spent **from the agent's wallet** (not your funding account); your
funding account only pays gas (and the agent's key is auto-topped-up for gas if empty).

```bash
asom exec neo --to 0xRecipient --value 0.01          # send 0.01 STT from neo's wallet
asom exec neo --to 0xContract --data 0xabcd1234       # call a contract as neo
```

## `asom transfer <name> <to>` — hand an agent over

Transfers the AgentNFT to a new owner. Ownership of the name **and** the wallet (and
its funds) goes with it — no migration. After transfer the agent leaves your local list.

```bash
asom transfer neo 0xNewOwner
```

## Other commands

`asom available <name>` (is a name free?) · `asom whoami` (your funding address) ·
`asom key address` / `asom key export` · `asom logout`.

## Config

| Env var | Purpose |
|---|---|
| `ASOM_PASSWORD` | Unlock the keystore non-interactively (scripts/CI) |
| `PRIVATE_KEY` | Bypass the keystore (plaintext, testnet shortcut) |
| `SHANNON_RPC_URL` | RPC override |
| `ASOM_HOME` | Override the asom home dir (default `~/.asom`) |

No STT to pay gas? The CLI points you at the faucet. Built on [`@asom/sdk`](../sdk).
