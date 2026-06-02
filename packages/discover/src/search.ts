import type { AgentRecord, SearchResult } from "./types.js";
import { expandQuery, normalize } from "./taxonomy.js";

export interface SearchOptions {
  /** Restrict to agents advertising this capability (human term or canonical tag). */
  capability?: string;
  limit?: number;
}

const WEIGHT = { canonicalCap: 10, name: 5, capTerm: 4, tag: 3, desc: 2 } as const;

/**
 * Rank agents against a human query. The query is expanded to canonical capability
 * tags (so "summarize my pdf" matches an agent advertising `llm.summarize`) and to
 * raw terms (matched against name / capabilities / tags / description). An empty
 * query returns everything (browse), sorted by name.
 */
export function searchAgents(records: AgentRecord[], query: string, opts: SearchOptions = {}): SearchResult[] {
  const limit = opts.limit ?? 25;
  const { terms, canonical } = expandQuery(query ?? "");
  const filter = opts.capability ? (expandQuery(opts.capability).canonical[0] ?? normalize(opts.capability)) : undefined;
  const hasQuery = (query ?? "").trim().length > 0;

  const out: SearchResult[] = [];
  for (const a of records) {
    const caps = a.capabilities.map(normalize);
    if (filter && !caps.includes(filter)) continue;

    const { score, matched } = score_(a, caps, terms, canonical);
    if (hasQuery && score === 0 && !filter) continue; // a real query that matched nothing
    out.push({ agent: a, score, matched });
  }
  out.sort((x, y) => y.score - x.score || x.agent.name.localeCompare(y.agent.name));
  return out.slice(0, limit);
}

function score_(a: AgentRecord, caps: string[], terms: string[], canonical: string[]): { score: number; matched: string[] } {
  let score = 0;
  const matched = new Set<string>();
  const name = normalize(a.name);
  const tags = a.tags.map(normalize);
  const desc = normalize(a.description ?? "");

  for (const c of canonical) {
    if (caps.includes(c)) {
      score += WEIGHT.canonicalCap;
      matched.add(c);
    }
  }
  for (const t of terms) {
    if (name.includes(t)) {
      score += WEIGHT.name;
      matched.add(`name:${t}`);
    }
    if (caps.some((c) => c.includes(t))) {
      score += WEIGHT.capTerm;
      matched.add(`cap:${t}`);
    }
    if (tags.includes(t)) {
      score += WEIGHT.tag;
      matched.add(`tag:${t}`);
    }
    if (desc.includes(t)) {
      score += WEIGHT.desc;
      matched.add(`desc:${t}`);
    }
  }
  return { score, matched: [...matched] };
}
