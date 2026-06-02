"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidName } from "@asom/sdk";
import { useAsom } from "@/lib/hooks";
import { CANONICAL_TAGS } from "@/lib/sdk";

export default function CreatePage() {
  const { client, connected } = useAsom();
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("0.02");
  const [desc, setDesc] = useState("");
  const [suggested, setSuggested] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "suggest" | "create">("");
  const [note, setNote] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; tx: string } | null>(null);

  const nameOk = name.length > 0 && isValidName(name);

  async function suggest() {
    setNote(null);
    setBusy("suggest");
    try {
      // AI proposes the best capability tag for a plain-English description — the LLM
      // is constrained to the canonical vocabulary, so the answer is always a real tag.
      const { requestId } = await client.aiClassify(desc, [...CANONICAL_TAGS], {
        system: "Pick the single capability tag that best matches the described agent.",
      });
      const res = await client.waitForAiResult("classify", requestId);
      if (res.ok && typeof res.value === "string") setSuggested(res.value);
      else setNote("AI did not reach consensus — pick a capability manually.");
    } catch (e) {
      setNote(`AI assist unavailable (${(e as Error).message}). The compute layer may not be deployed yet.`);
    } finally {
      setBusy("");
    }
  }

  async function create() {
    setNote(null);
    setBusy("create");
    try {
      const agent = await client.createAgent(name, { seedStt: seed });
      setCreated({ name: agent.name, tx: agent.txHash });
      // If AI suggested a capability, advertise it in the same flow ("create + deploy").
      if (suggested) {
        try {
          await client.advertise(agent.tokenId, { capabilities: [suggested] });
        } catch {
          setNote("Agent created, but advertising the capability failed — set it on the agent page.");
        }
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold">
        Create <span className="text-fuchsia-500">an agent</span>
      </h1>
      <p className="mt-2 text-neutral-400">
        Mint a <code className="text-cyan-300">name@asom</code> with its own ERC-6551 wallet — then let AI pick what it
        does.
      </p>

      {!connected && (
        <p className="mt-6 rounded-lg border border-yellow-800 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
          Connect a wallet to create and deploy an agent.
        </p>
      )}

      {/* AI-assist: describe → AI suggests a capability ("AI creates AI") */}
      <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">✨ AI assist — describe your agent</h2>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="e.g. an agent that summarizes long PDFs into bullet points"
          className="mt-3 h-20 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-fuchsia-600"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={suggest}
            disabled={!connected || !desc || busy !== ""}
            className="rounded-lg bg-cyan-700 px-3 py-1.5 text-sm hover:bg-cyan-600 disabled:opacity-50"
          >
            {busy === "suggest" ? "Asking consensus AI…" : "Suggest capability"}
          </button>
          {suggested && (
            <span className="text-sm">
              suggested: <span className="rounded bg-cyan-950 px-2 py-0.5 text-cyan-300">{suggested}</span>
            </span>
          )}
        </div>
      </section>

      {/* The create form */}
      <section className="mt-6 space-y-4">
        <div>
          <label className="text-sm text-neutral-400">name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="neo"
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 outline-none focus:border-fuchsia-600"
          />
          {name && !nameOk && <p className="mt-1 text-xs text-red-400">a-z, 0-9, hyphen; 1–32 chars; no edge/double hyphen</p>}
        </div>
        <div>
          <label className="text-sm text-neutral-400">seed wallet (STT)</label>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="mt-1 w-40 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 outline-none focus:border-fuchsia-600"
          />
        </div>
        <button
          onClick={create}
          disabled={!connected || !nameOk || busy !== ""}
          className="rounded-lg bg-fuchsia-600 px-5 py-2.5 font-medium hover:bg-fuchsia-500 disabled:opacity-50"
        >
          {busy === "create" ? "Deploying…" : suggested ? `Create + advertise ${suggested}` : "Create agent"}
        </button>
      </section>

      {note && <p className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-300">{note}</p>}

      {created && (
        <p className="mt-5 rounded-lg border border-green-800 bg-green-950/40 px-4 py-3 text-sm text-green-300">
          ✨ <strong>{created.name}@asom</strong> is live.{" "}
          <Link href={`/agent/${created.name}`} className="underline">
            view agent →
          </Link>
        </p>
      )}
    </main>
  );
}
