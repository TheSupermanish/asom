import type { Address } from "viem";

/**
 * Canonical Somnia AI agents — the consensus-verified compute an tsugu agent can
 * offer as a capability. Same `agentId` on testnet and mainnet; only the platform
 * address differs. See repo docs/SOMNIA_AI.md.
 *
 * `status` reflects how confirmed each agent is — calling one with a wrong id OR a
 * wrong payload selector burns the createRequest deposit (it just TimedOuts), so both
 * axes matter:
 *   - "verified"     id + ABI confirmed (jsonApi: exercised byte-identically by the live OracleAgent)
 *   - "id-verified"  id confirmed on-chain, ABI/selectors per docs only — verify before relying on payloads
 *   - "experimental" id itself unconfirmed — do not depend on without checking agents.somnia.network
 */
export const somniaAgents = {
  jsonApi: { id: 13174292974160097713n, status: "verified", capability: "somnia.json-fetch" },
  llmInference: { id: 12847293847561029384n, status: "experimental", capability: "somnia.llm-inference" },
  parseWebsite: { id: 12875401142070969085n, status: "id-verified", capability: "somnia.parse-website" },
} as const;

/** Somnia Agents platform contract, by chain id. */
export const somniaPlatform: Record<number, Address> = {
  50312: "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776", // Shannon testnet
  5031: "0x5E5205CF39E766118C01636bED000A54D93163E6", // Somnia mainnet
};
