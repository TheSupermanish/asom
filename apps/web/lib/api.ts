export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
export const EXPLORER = "https://shannon-explorer.somnia.network";

export interface Agent {
  name: string;
  tokenId: string;
  account: string;
  owner: string;
  capabilities: string[];
  capabilityHashes: string[];
  serviceURI: string;
  pricePerCall: string;
  description?: string;
  tags: string[];
  updatedAt: string;
}

export interface SearchResult {
  agent: Agent;
  score: number;
  matched: string[];
}

export async function searchAgents(q: string): Promise<{ results: SearchResult[]; matchedCapabilities: string[] }> {
  const res = await fetch(`${API_URL}/agents?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) return { results: [], matchedCapabilities: [] };
  const d = await res.json();
  return { results: d.results ?? [], matchedCapabilities: d.matchedCapabilities ?? [] };
}

export async function getAgent(name: string): Promise<Agent | null> {
  const res = await fetch(`${API_URL}/agents/${encodeURIComponent(name)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export const short = (a: string): string => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export const fmtStt = (wei: string): string => {
  try {
    const w = BigInt(wei);
    return (Number(w) / 1e18).toFixed(4);
  } catch {
    return "0";
  }
};
