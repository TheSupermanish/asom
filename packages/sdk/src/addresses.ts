import type { Address } from "viem";

/// tsugu contract deployments, keyed by chain id.
/// Shannon (50312) — see packages/contracts/DEPLOYMENTS.md.
/// `deployBlock` bounds historical event scans (e.g. hasEverOwned) so they don't
/// walk the chain from genesis.
export const deployments: Record<
  number,
  {
    agentRegistry: Address;
    agentNFT: Address;
    erc6551Registry: Address;
    agentAccount: Address;
    deployBlock?: bigint;
  }
> = {
  50312: {
    // Hardened identity stack (register() is now reentrancy-guarded). The prior
    // deployment (0xa98a…1a08) is deprecated — see packages/contracts/DEPLOYMENTS.md.
    agentRegistry: "0x9Df3c688e2aE988Ff63672A98335d3BEfAdC452E",
    agentNFT: "0x2DCD1758CaA40c004cA9F8593b032c384eA10925",
    erc6551Registry: "0x7f3b56f5D737010885FaAeAa771fb2e61d33Ec8B",
    agentAccount: "0x4c4e4B24613c285e33c4c0b5DB0603936A0df600",
    deployBlock: 398072018n,
  },
};
