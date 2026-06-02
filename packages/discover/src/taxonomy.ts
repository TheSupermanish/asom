import { capabilityTag } from "@tsugu/sdk";

/**
 * Canonical capability vocabulary → human aliases. This is what makes "summarize my
 * pdf" find an agent that advertised the exact on-chain tag `llm.summarize`: the
 * query is mapped to canonical tags via these aliases, and the canonical tag's
 * keccak256 is exactly what lives in CapabilityRegistry. Extend freely — unknown
 * tags still work by exact match, they just won't be reachable by fuzzy terms.
 */
export const TAXONOMY: Record<string, string[]> = {
  "llm.summarize": ["summarize", "summary", "summarise", "tldr", "condense", "abstract", "recap"],
  "llm.translate": ["translate", "translation", "localize", "localise", "i18n"],
  "llm.classify": ["classify", "classification", "categorize", "categorise", "label", "sentiment", "moderate"],
  "llm.chat": ["chat", "converse", "assistant", "qa", "question answering", "answer"],
  "llm.generate": ["generate", "write", "compose", "draft", "completion", "text generation"],
  "llm.judge": ["judge", "evaluate", "score", "grade", "referee", "arbitrate"],
  "oracle.price": ["price", "oracle", "quote", "feed", "ticker", "exchange rate"],
  "data.fetch": ["fetch", "http", "rest", "api", "json", "get data"],
  "web.extract": ["extract", "parse website", "scrape", "crawl", "read page", "web extract"],
  "image.generate": ["image", "draw", "art", "picture", "render", "image generation"],
  "code.review": ["code review", "review code", "audit code", "lint", "static analysis"],
  // Somnia-backed capabilities (fulfilled by calling Somnia's consensus AI agents).
  "somnia.json-fetch": ["somnia json", "consensus fetch", "verified fetch"],
  "somnia.llm-inference": ["somnia llm", "consensus llm", "qwen", "verified inference"],
  "somnia.parse-website": ["somnia parse", "consensus parse"],
};

export const CANONICAL_TAGS = Object.keys(TAXONOMY);

/** normalized alias → canonical tag (includes each canonical mapping to itself and
 *  to its last dotted segment, e.g. "summarize" for "llm.summarize"). */
const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const canonical of CANONICAL_TAGS) {
    m.set(canonical, canonical);
    const seg = canonical.includes(".") ? canonical.slice(canonical.indexOf(".") + 1) : canonical;
    if (!m.has(seg)) m.set(seg, canonical);
    for (const alias of TAXONOMY[canonical]) m.set(normalize(alias), canonical);
  }
  return m;
})();

/** keccak256(bytes(canonicalTag)) → canonical name, so the indexer can label the
 *  on-chain hashes it recognizes (chain stores hashes; we show names). */
export const TAG_HASH_TO_NAME: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const canonical of CANONICAL_TAGS) m.set(capabilityTag(canonical).toLowerCase(), canonical);
  return m;
})();

export function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 1);
}

/** Map a human query to canonical capability tags + the raw search terms. */
export function expandQuery(query: string): { terms: string[]; canonical: string[] } {
  const norm = normalize(query);
  const terms = tokenize(query);
  const canonical = new Set<string>();

  // Phrase aliases (may be multi-word) matched as substrings of the whole query.
  for (const [alias, canon] of ALIAS_TO_CANONICAL) {
    if (alias.includes(" ") ? norm.includes(alias) : terms.includes(alias)) canonical.add(canon);
  }
  // A direct canonical tag typed verbatim.
  for (const t of terms) {
    const direct = ALIAS_TO_CANONICAL.get(t);
    if (direct) canonical.add(direct);
  }
  return { terms, canonical: [...canonical] };
}

/** Label an on-chain tag hash with its canonical name if we recognize it. */
export function labelHash(hash: string): string | undefined {
  return TAG_HASH_TO_NAME.get(hash.toLowerCase());
}
