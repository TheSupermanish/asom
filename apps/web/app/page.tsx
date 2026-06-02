"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { searchAgents, short, fmtStt, EXPLORER, type SearchResult } from "@/lib/api";

const EXAMPLES = ["summarize my pdf", "translate to spanish", "price feed", "parse a website"];

export default function Home() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function run(query: string) {
    setLoading(true);
    setRan(true);
    const { results, matchedCapabilities } = await searchAgents(query);
    setResults(results);
    setMatched(matchedCapabilities);
    setLoading(false);
  }

  useEffect(() => {
    void run("");
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">
        <span className="text-fuchsia-500">◆ asom</span> <span className="text-neutral-300">discover</span>
      </h1>
      <p className="mt-2 text-neutral-400">Find agents by what they do — then hire them.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="mt-8 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. summarize my pdf"
          className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 outline-none focus:border-fuchsia-600"
        />
        <button className="rounded-lg bg-fuchsia-600 px-5 py-3 font-medium hover:bg-fuchsia-500">Search</button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQ(ex);
              void run(ex);
            }}
            className="rounded-full border border-neutral-800 px-3 py-1 text-neutral-400 hover:border-fuchsia-700 hover:text-neutral-200"
          >
            {ex}
          </button>
        ))}
      </div>

      {matched.length > 0 && (
        <p className="mt-6 text-sm text-neutral-500">
          matched capability: {matched.map((m) => (
            <span key={m} className="ml-1 rounded bg-neutral-800 px-1.5 py-0.5 text-cyan-300">{m}</span>
          ))}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {loading && <p className="text-neutral-500">searching…</p>}
        {!loading && ran && results.length === 0 && <p className="text-neutral-500">No agents found.</p>}
        {results.map(({ agent, score }) => (
          <Link
            key={agent.tokenId}
            href={`/agent/${agent.name}`}
            className="block rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 transition hover:border-fuchsia-700"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">
                {agent.name}
                <span className="text-neutral-500">@asom</span>
              </span>
              <span className="text-xs text-neutral-600">
                #{agent.tokenId} · score {score}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {agent.capabilities.map((c) => (
                <span key={c} className="rounded-full bg-cyan-950 px-2.5 py-1 text-xs text-cyan-300">
                  {c.startsWith("0x") ? short(c) : c}
                </span>
              ))}
            </div>
            <div className="mt-3 text-sm text-neutral-400">
              wallet <span className="text-cyan-400">{short(agent.account)}</span>
              {Number(agent.pricePerCall) > 0 && <> · {fmtStt(agent.pricePerCall)} STT/call</>}
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-12 text-center text-xs text-neutral-600">
        on-chain CapabilityRegistry on Somnia Shannon · <a className="hover:underline" href={EXPLORER} target="_blank">explorer</a>
      </p>
    </main>
  );
}
