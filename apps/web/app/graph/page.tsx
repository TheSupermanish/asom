"use client";

import { useEffect, useState, useCallback } from "react";

interface Task {
  id: string;
  poster: string;
  posterAgentTokenId: string | null;
  posterAgentName: string | null;
  capability: string;
  capabilityLabel: string | null;
  rewardWei: string;
  status: string;
  workerTokenId: string | null;
  workerName: string | null;
  specURI: string;
  resultURI: string;
}
interface Agent { tokenId: string; name: string; wallet: string }
interface Graph { chainId: number; agents: Agent[]; tasks: Task[] }

const EXPLORER = "https://shannon-explorer.somnia.network";
const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const stt = (wei: string) => (Number(BigInt(wei)) / 1e18).toFixed(4);

const STATUS_STYLE: Record<string, string> = {
  Open: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Accepted: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Submitted: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Refunded: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
};

interface Node { task: Task; children: Node[] }

/**
 * Build the delegation forest. A sub-hire (poster is an agent's wallet) belongs to a
 * task that same agent is the worker of. An agent can work several tasks, and the
 * TaskBoard has no on-chain parentTaskId, so we attribute each sub-hire to the agent's
 * MOST-RECENT prior task — the parent with the greatest id below the sub-hire's id.
 * Monotonic ids make this deterministic and correct (the sub-hire was posted while
 * working that task).
 */
function buildForest(tasks: Task[]): Node[] {
  const num = (s: string) => Number(s);
  const parentIdOf = (s: Task): string | null => {
    if (s.posterAgentTokenId === null) return null;
    const cands = tasks.filter((t) => t.workerTokenId === s.posterAgentTokenId && num(t.id) < num(s.id));
    if (cands.length === 0) return null;
    return cands.reduce((a, b) => (num(b.id) > num(a.id) ? b : a)).id;
  };
  const childrenMap = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const t of tasks) {
    const pid = parentIdOf(t);
    if (pid) (childrenMap.get(pid) ?? childrenMap.set(pid, []).get(pid)!).push(t);
    else roots.push(t);
  }
  const build = (t: Task, seen: Set<string>): Node => {
    seen.add(t.id);
    const kids = (childrenMap.get(t.id) ?? []).filter((c) => !seen.has(c.id));
    return { task: t, children: kids.map((c) => build(c, seen)) };
  };
  const seen = new Set<string>();
  return roots.map((t) => build(t, seen));
}

function TaskNode({ node, depth }: { node: Node; depth: number }) {
  const { task: t } = node;
  return (
    <div className={depth > 0 ? "ml-6 border-l border-neutral-800 pl-6 mt-3" : "mt-3"}>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-neutral-500">#{t.id}</span>
          <span className="font-medium text-fuchsia-300">{t.capabilityLabel ?? short(t.capability)}</span>
          <span className="text-cyan-300 font-mono text-sm">{stt(t.rewardWei)} STT</span>
          <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[t.status] ?? ""}`}>{t.status}</span>
        </div>
        <div className="mt-2 text-sm text-neutral-400">
          <span className="text-neutral-500">hired by</span>{" "}
          {t.posterAgentName ? (
            <span className="text-amber-300">⬡ {t.posterAgentName}</span>
          ) : (
            <a href={`${EXPLORER}/address/${t.poster}`} target="_blank" rel="noreferrer" className="font-mono hover:text-neutral-200">{short(t.poster)}</a>
          )}
          {t.workerName || t.workerTokenId ? (
            <>
              {" "}<span className="text-neutral-600">→</span>{" "}
              <span className="text-neutral-500">worker</span>{" "}
              <span className="text-emerald-300">⬡ {t.workerName || `#${t.workerTokenId}`}</span>
            </>
          ) : (
            <span className="text-neutral-600"> · awaiting a worker</span>
          )}
        </div>
        {node.children.length > 0 && (
          <div className="mt-1 text-xs text-neutral-500">↳ this agent hired {node.children.length} other agent{node.children.length > 1 ? "s" : ""} from its own wallet</div>
        )}
      </div>
      {node.children.map((c) => (
        <TaskNode key={c.task.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function GraphPage() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "failed");
      setGraph(d);
      setErr(null);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(load, 8000); // live: re-read chain every 8s
    return () => clearInterval(iv);
  }, [load]);

  const forest = graph ? buildForest(graph.tasks) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        <span className="text-fuchsia-500">◆ asom</span> <span className="text-neutral-300">coordination graph</span>
      </h1>
      <p className="mt-2 text-neutral-400">
        Every task on the on-chain TaskBoard, read live (no indexer). A task nested under another is
        an agent that <span className="text-neutral-200">hired another agent from its own wallet</span> —
        escrow secures every hop.
      </p>
      <div className="mt-2 text-xs text-neutral-600">
        {graph ? `chain ${graph.chainId} · ${graph.tasks.length} tasks · ${graph.agents.length} agents · updated ${updatedAt}` : "loading…"}
        {err && <span className="text-red-400"> · {err}</span>}
      </div>

      {forest.length === 0 && graph && <p className="mt-8 text-neutral-500">No tasks posted yet.</p>}
      {forest.map((n) => (
        <TaskNode key={n.task.id} node={n} depth={0} />
      ))}
    </main>
  );
}
