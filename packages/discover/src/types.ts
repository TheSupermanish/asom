import type { Address } from "viem";

/**
 * A searchable record for one agent, assembled by the indexer from on-chain state
 * (CapabilityRegistry + AgentNFT/AgentRegistry) plus the agent's off-chain manifest
 * (the JSON at its serviceURI). The chain is the source of truth; this is the index.
 */
export interface AgentRecord {
  /** `<name>` (without the @asom suffix). */
  name: string;
  tokenId: string;
  /** ERC-6551 wallet. */
  account: Address;
  /** Live NFT owner at index time. */
  owner: Address;
  /** Human-readable capability names — from the manifest, else recognized canonical
   *  tags whose hash matched an on-chain tag. */
  capabilities: string[];
  /** Raw on-chain capability tag hashes (bytes32) — the authoritative set. */
  capabilityHashes: string[];
  /** Off-chain endpoint / metadata doc. */
  serviceURI: string;
  /** Advertised price per call, in wei (string for JSON/Mongo safety). */
  pricePerCall: string;
  /** From the manifest, if present. */
  description?: string;
  /** Free-text tags from the manifest (augment capability search). */
  tags: string[];
  /** ISO timestamp of last index. */
  updatedAt: string;
}

/** A search hit: the record plus why it matched. */
export interface SearchResult {
  agent: AgentRecord;
  score: number;
  matched: string[];
}

/** An agent's off-chain manifest (mirrors Somnia's agent metadata schema). */
export interface AgentManifest {
  name?: string;
  description?: string;
  capabilities?: string[];
  tags?: string[];
  [k: string]: unknown;
}
