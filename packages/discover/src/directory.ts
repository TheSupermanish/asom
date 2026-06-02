import { AsomClient, capabilityTag } from "@asom/sdk";
import type { AgentRecord, AgentManifest } from "./types.js";
import { labelHash } from "./taxonomy.js";
import { searchAgents, type SearchOptions } from "./search.js";

export interface LoadOptions {
  /** Fetch each agent's serviceURI manifest for description/tags (default true). */
  fetchManifests?: boolean;
  manifestTimeoutMs?: number;
}

async function fetchManifest(uri: string, timeoutMs: number): Promise<AgentManifest | null> {
  if (!/^https?:\/\//i.test(uri)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(uri, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as AgentManifest;
  } catch {
    return null; // best-effort: a missing/invalid manifest just means thinner search text
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read every ADVERTISED agent from chain (no DB, no event indexer) and assemble
 * searchable records. On-chain capability tag hashes are labeled with human names
 * when recognized; the off-chain manifest (if reachable) adds description/tags.
 * For the current registry scale this is a quick read — cache it (see AgentDirectory).
 */
export async function loadAgents(client: AsomClient, opts: LoadOptions = {}): Promise<AgentRecord[]> {
  const total = Number(await client.totalAgents());
  const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));
  // Process agents concurrently — one slow/unreachable manifest can't stall the rest.
  const records = await Promise.all(ids.map((t) => loadOne(client, t, opts)));
  return records.filter((r): r is AgentRecord => r !== null);
}

async function loadOne(client: AsomClient, t: bigint, opts: LoadOptions): Promise<AgentRecord | null> {
  let name: string;
  try {
    name = await client.nameOf(t);
  } catch {
    return null;
  }
  if (!name) return null;

  const hashes = await client.capabilitiesOf(t);
  const listing = await client.listingOf(t);
  if (hashes.length === 0 && !listing.listed) return null; // not advertised → not discoverable

  let account, owner;
  try {
    const agent = await client.resolve(name);
    account = agent.account;
    owner = agent.owner;
  } catch {
    return null;
  }

  const capabilityHashes = hashes.map((h) => h.toLowerCase());
  let capabilities = capabilityHashes.map((h) => labelHash(h) ?? h);
  let description: string | undefined;
  let tags: string[] = [];

  if (opts.fetchManifests !== false && listing.serviceURI) {
    const m = await fetchManifest(listing.serviceURI, opts.manifestTimeoutMs ?? 4000);
    if (m) {
      if (typeof m.description === "string") description = m.description;
      if (Array.isArray(m.tags)) tags = m.tags.map(String);
      if (Array.isArray(m.capabilities)) {
        // Trust a manifest's human capability name only if its hash is actually on-chain.
        const verified = m.capabilities.map(String).filter((c) => capabilityHashes.includes(capabilityTag(c).toLowerCase()));
        if (verified.length) {
          const labeled = capabilities.filter((c) => !c.startsWith("0x"));
          capabilities = [...new Set([...labeled, ...verified])];
        }
      }
    }
  }

  return {
    name,
    tokenId: t.toString(),
    account,
    owner,
    capabilities,
    capabilityHashes,
    serviceURI: listing.serviceURI,
    pricePerCall: listing.pricePerCall.toString(),
    description,
    tags,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A cached view over the on-chain agents — read live, cached for `ttlMs`, searched
 * in memory. No database; the chain is the source of truth. Swap in a persistent
 * store later (behind this interface) only when the registry is large.
 */
export class AgentDirectory {
  private cache: AgentRecord[] = [];
  private fetchedAt = 0;

  constructor(
    private readonly client: AsomClient,
    private readonly ttlMs = 30_000,
    private readonly loadOpts: LoadOptions = {},
  ) {}

  async refresh(): Promise<AgentRecord[]> {
    this.cache = await loadAgents(this.client, this.loadOpts);
    this.fetchedAt = Date.now();
    return this.cache;
  }

  async agents(): Promise<AgentRecord[]> {
    if (this.cache.length === 0 || Date.now() - this.fetchedAt > this.ttlMs) await this.refresh();
    return this.cache;
  }

  async search(query: string, opts?: SearchOptions): Promise<ReturnType<typeof searchAgents>> {
    return searchAgents(await this.agents(), query, opts);
  }

  async get(name: string): Promise<AgentRecord | null> {
    return (await this.agents()).find((a) => a.name === name) ?? null;
  }
}
