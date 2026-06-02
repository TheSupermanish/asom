# @asom/sdk

TypeScript SDK for [asom](../../README.md) — create, resolve, and operate agents on Somnia. Built on [viem](https://viem.sh).

```bash
pnpm add @asom/sdk viem
```

```ts
import { AsomClient } from "@asom/sdk";

// Reads need no key.
const asom = new AsomClient();
const neo = await asom.resolve("neo");
// → { name, tokenId, account, owner, createdAt }

// Writes need a key.
const writer = new AsomClient({ privateKey: process.env.PRIVATE_KEY });
const agent = await writer.createAgent("trinity", { seedStt: "0.05" });
console.log(agent.account, agent.txHash);

// Make the agent ACT — spend its own wallet funds, or call any contract.
// The signer must be the agent's current owner.
const owner = new AsomClient({ privateKey: ownerKey });
await owner.agentExecute("trinity", { to: recipient, value: "0.01" });

// Hand the agent over — transfers the NFT, and with it the name + wallet.
await owner.transferAgent("trinity", newOwner);
```

## API

| Method | Needs key | Description |
|---|---|---|
| `resolve(name)` | no | Resolve a name to its agent (tokenId, wallet, live owner, createdAt) |
| `isAvailable(name)` | no | Is a name free to register? |
| `getBalance(address)` | no | Native STT balance, in wei |
| `agentCountOf(owner)` | no | How many agent NFTs an address currently holds |
| `hasEverOwned(owner)` | no | Has an address *ever* owned an agent? (monotonic; survives transfers) |
| `agentState(account)` | no | The agent wallet's `state` nonce (bumps on every execute) |
| `createAgent(name, { owner?, seedStt? })` | yes | Mint NFT + deploy ERC-6551 wallet + register, in one tx |
| `agentExecute(target, { to, value?, data?, operation? })` | yes | Make an agent act: `execute` from its wallet (owner-gated). `target` = name, Agent, or wallet address |
| `transferAgent(name, to)` | yes | Transfer an agent (NFT) to a new owner — moves name + wallet |
| `send(to, stt)` | yes | Send native STT from the signer |
| `signerAddress` | — | The configured signer's address |
| `explorer(kind, value)` | — | Build a Shannon explorer URL |

## Exports

- `AsomClient` — the client class
- `shannon` — the Shannon testnet chain (viem `Chain`)
- `deployments` — contract addresses by chain id
- `agentRegistryAbi`, `agentNftAbi`, `agentAccountAbi` — typed ABIs for direct viem use
- `validateName`, `isValidName`, `parseStt` — client-side validators (mirror the contract)

Defaults to Somnia Shannon testnet (chain 50312). To target another network, pass
`{ chain, rpcUrl, addresses }` — e.g. `new AsomClient({ chain: anvil, rpcUrl, addresses })`.
For an unknown chain id you must supply `addresses` (the client throws otherwise).
Pass `rpcUrls: [...]` for a resilient fallback transport.

> `viem` is a **peer dependency** (`>=2.21 <3`) — install it alongside `@asom/sdk`
> so your app and the SDK share one viem instance.
