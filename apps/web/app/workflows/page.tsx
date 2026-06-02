"use client";

import { useState } from "react";
import { useAsom } from "@/lib/hooks";
import type { AiKind } from "@asom/sdk";

type StepKind = "classify" | "number" | "extract";

interface Step {
  kind: StepKind;
  prompt: string; // classify/number: the prompt; supports {{prev}} for the previous step's result
  allow?: string; // classify: comma-separated allowed values
  min?: string; // number
  max?: string;
  url?: string; // extract
  key?: string; // extract
}

interface StepResult {
  status: "idle" | "pending" | "ok" | "fail";
  value?: string;
  validators?: number;
}

const NEW: Record<StepKind, Step> = {
  classify: { kind: "classify", prompt: "Is this sentiment positive? {{prev}}", allow: "positive,negative" },
  number: { kind: "number", prompt: "Rate 0-100: {{prev}}", min: "0", max: "100" },
  extract: { kind: "extract", prompt: "extract the headline", url: "https://example.com", key: "headline" },
};

export default function WorkflowsPage() {
  const { client, connected } = useAsom();
  const [steps, setSteps] = useState<Step[]>([NEW.extract, NEW.classify]);
  const [results, setResults] = useState<StepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function add(kind: StepKind) {
    setSteps((s) => [...s, { ...NEW[kind] }]);
  }
  function update(i: number, patch: Partial<Step>) {
    setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  }
  function remove(i: number) {
    setSteps((s) => s.filter((_, j) => j !== i));
  }

  async function run() {
    setNote(null);
    setRunning(true);
    const res: StepResult[] = steps.map(() => ({ status: "idle" }));
    setResults([...res]);
    let prev = "";
    try {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        res[i] = { status: "pending" };
        setResults([...res]);
        const prompt = (s.prompt ?? "").replaceAll("{{prev}}", prev);
        let requestId: bigint;
        let kind: AiKind;
        if (s.kind === "classify") {
          kind = "classify";
          ({ requestId } = await client.aiClassify(prompt, (s.allow ?? "").split(",").map((x) => x.trim()).filter(Boolean)));
        } else if (s.kind === "number") {
          kind = "number";
          ({ requestId } = await client.aiNumber(prompt, BigInt(s.min ?? "0"), BigInt(s.max ?? "100")));
        } else {
          kind = "extract";
          ({ requestId } = await client.aiExtract({ key: s.key ?? "value", description: s.key ?? "", prompt, url: s.url ?? "" }));
        }
        const out = await client.waitForAiResult(kind, requestId);
        if (!out.ok) {
          res[i] = { status: "fail" };
          setResults([...res]);
          setNote(`Step ${i + 1} did not reach consensus — pipeline stopped.`);
          break;
        }
        prev = String(out.value ?? "");
        res[i] = { status: "ok", value: prev, validators: out.receipt?.validators };
        setResults([...res]);
      }
    } catch (e) {
      setNote(`Workflow unavailable (${(e as Error).message}). The AI compute layer may not be deployed yet.`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">
        AI <span className="text-fuchsia-500">workflows</span>
      </h1>
      <p className="mt-2 text-neutral-400">
        Chain Somnia consensus AI steps — <code className="text-cyan-300">fetch → reason → act</code>. Each step&apos;s
        result feeds the next via <code className="text-cyan-300">{"{{prev}}"}</code>.
      </p>

      <div className="mt-6 flex gap-2 text-sm">
        <button onClick={() => add("extract")} className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-fuchsia-700">+ extract</button>
        <button onClick={() => add("classify")} className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-fuchsia-700">+ classify</button>
        <button onClick={() => add("number")} className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:border-fuchsia-700">+ number</button>
      </div>

      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-cyan-300">
                {i + 1}. {s.kind}
              </span>
              <button onClick={() => remove(i)} className="text-xs text-neutral-500 hover:text-red-400">remove</button>
            </div>
            {s.kind === "extract" ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input value={s.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="url"
                  className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-fuchsia-600" />
                <input value={s.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="field key"
                  className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-fuchsia-600" />
              </div>
            ) : (
              <input value={s.prompt} onChange={(e) => update(i, { prompt: e.target.value })} placeholder="prompt ({{prev}} = previous result)"
                className="mt-2 w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-fuchsia-600" />
            )}
            {s.kind === "classify" && (
              <input value={s.allow} onChange={(e) => update(i, { allow: e.target.value })} placeholder="allowed values (comma-separated)"
                className="mt-2 w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-fuchsia-600" />
            )}
            {s.kind === "number" && (
              <div className="mt-2 flex gap-2">
                <input value={s.min} onChange={(e) => update(i, { min: e.target.value })} placeholder="min" className="w-24 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-fuchsia-600" />
                <input value={s.max} onChange={(e) => update(i, { max: e.target.value })} placeholder="max" className="w-24 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-fuchsia-600" />
              </div>
            )}
            {results[i] && results[i].status !== "idle" && (
              <div className="mt-2 text-sm">
                {results[i].status === "pending" && <span className="text-yellow-400">⏳ awaiting consensus…</span>}
                {results[i].status === "ok" && (
                  <span className="text-green-400">
                    ✓ {results[i].value}
                    {results[i].validators ? <span className="text-neutral-500"> · {results[i].validators} validators</span> : null}
                  </span>
                )}
                {results[i].status === "fail" && <span className="text-red-400">✗ no consensus</span>}
              </div>
            )}
          </li>
        ))}
      </ol>

      <button onClick={run} disabled={!connected || running || steps.length === 0}
        className="mt-6 rounded-lg bg-fuchsia-600 px-5 py-2.5 font-medium hover:bg-fuchsia-500 disabled:opacity-50">
        {running ? "Running pipeline…" : "Run workflow"}
      </button>
      {!connected && <span className="ml-3 text-sm text-yellow-400">connect a wallet to run</span>}
      {note && <p className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-300">{note}</p>}
    </main>
  );
}
