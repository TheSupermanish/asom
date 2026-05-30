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
```

## API

| Method | Needs key | Description |
|---|---|---|
| `resolve(name)` | no | Resolve a name to its agent (tokenId, wallet, live owner, createdAt) |
| `isAvailable(name)` | no | Is a name free to register? |
| `getBalance(address)` | no | Native STT balance, in wei |
| `createAgent(name, { owner?, seedStt? })` | yes | Mint NFT + deploy ERC-6551 wallet + register, in one tx |
| `signerAddress` | — | The configured signer's address |
| `explorer(kind, value)` | — | Build a Shannon explorer URL |

## Exports

- `AsomClient` — the client class
- `shannon` — the Shannon testnet chain (viem `Chain`)
- `deployments` — contract addresses by chain id
- `agentRegistryAbi`, `agentNftAbi` — typed ABIs for direct viem use

Defaults to Somnia Shannon testnet (chain 50312). Pass `{ chainId, rpcUrl }` to override.
