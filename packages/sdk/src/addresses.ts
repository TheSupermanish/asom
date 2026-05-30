import type { Address } from "viem";

/// asom contract deployments, keyed by chain id.
/// Shannon (50312) — see packages/contracts/DEPLOYMENTS.md.
export const deployments: Record<
  number,
  {
    agentRegistry: Address;
    agentNFT: Address;
    erc6551Registry: Address;
    agentAccount: Address;
  }
> = {
  50312: {
    agentRegistry: "0xa98a6d4BC0099D2fc5D1d81a79770592c2a91a08",
    agentNFT: "0x7DeD25aEb99e8b31accC1EE658c7E9361D4DAB70",
    erc6551Registry: "0x4575c8652bE0db8bbDc01b43DEDe8585414b2002",
    agentAccount: "0x9b7F1A851E549de4716a548c87734C6bEC5acd51",
  },
};
