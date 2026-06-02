import { NextResponse } from "next/server";
import { capabilityTag } from "@asom/sdk";
import { CANONICAL_TAGS } from "@asom/discover";
import { serverClient } from "@/lib/server/directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = ["None", "Open", "Accepted", "Submitted", "Approved", "Refunded"] as const;

// hash -> human label, so the graph shows "llm.summarize" not 0xae28…
const TAG_BY_HASH: Record<string, string> = Object.fromEntries(
  CANONICAL_TAGS.map((t) => [capabilityTag(t).toLowerCase(), t]),
);

/**
 * The live coordination graph, read straight from chain (no indexer):
 * every task on the TaskBoard plus the agent registry, with sub-hires linked —
 * a task whose `poster` is an agent's ERC-6551 wallet is that agent hiring another.
 */
export async function GET() {
  try {
    const client = serverClient();
    const [next, total] = await Promise.all([client.nextTaskId(), client.totalAgents()]);

    // agent directory: tokenId -> { name, wallet }, and a wallet -> tokenId reverse map
    const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i + 1));
    const agents = await Promise.all(
      ids.map(async (id) => {
        const [name, wallet] = await Promise.all([
          client.nameOf(id).catch(() => ""),
          client.agentWallet(id),
        ]);
        return { tokenId: id.toString(), name, wallet };
      }),
    );
    const agentByWallet = new Map(agents.map((a) => [a.wallet.toLowerCase(), a]));

    // every task
    const taskIds = Array.from({ length: Math.max(0, Number(next) - 1) }, (_, i) => BigInt(i + 1));
    const tasks = await Promise.all(
      taskIds.map(async (id) => {
        const t = await client.getTask(id);
        const posterAgent = agentByWallet.get(t.poster.toLowerCase()) ?? null;
        const workerAgent = t.workerTokenId > 0n ? agents.find((a) => a.tokenId === t.workerTokenId.toString()) ?? null : null;
        return {
          id: id.toString(),
          poster: t.poster,
          posterAgentTokenId: posterAgent?.tokenId ?? null, // set => an agent hired this (sub-hire)
          posterAgentName: posterAgent?.name ?? null,
          capability: t.capability,
          capabilityLabel: TAG_BY_HASH[t.capability.toLowerCase()] ?? null,
          rewardWei: t.reward.toString(),
          status: STATUS[Number(t.status)],
          workerTokenId: t.workerTokenId > 0n ? t.workerTokenId.toString() : null,
          workerName: workerAgent?.name ?? null,
          specURI: t.specURI,
          resultURI: t.resultURI,
        };
      }),
    );

    return NextResponse.json({ chainId: client.chainId, agents, tasks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
