import express from "express";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import { AsomClient } from "@asom/sdk";
import { AgentDirectory, CANONICAL_TAGS, expandQuery } from "@asom/discover";

loadEnv();

const PORT = Number(process.env.PORT ?? 8787);
const RPC = process.env.SHANNON_RPC_URL ?? "https://dream-rpc.somnia.network";
const TTL_MS = Number(process.env.DISCOVER_TTL_MS ?? 30_000);

const client = new AsomClient({ rpcUrls: [RPC] });
const directory = new AgentDirectory(client, TTL_MS);

const app = express();
app.use(cors());

/** Liveness + how many advertised agents are indexed. */
app.get("/health", async (_req, res) => {
  try {
    const agents = await directory.agents();
    res.json({ ok: true, chainId: client.chainId, agents: agents.length });
  } catch (e) {
    res.status(502).json({ ok: false, error: (e as Error).message });
  }
});

/** Search: GET /agents?q=summarize my pdf&capability=&limit=25 */
app.get("/agents", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const capability = typeof req.query.capability === "string" ? req.query.capability : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const results = await directory.search(q, { capability, limit });
    res.json({ query: q, matchedCapabilities: expandQuery(q).canonical, count: results.length, results });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** One agent by name. */
app.get("/agents/:name", async (req, res) => {
  try {
    const agent = await directory.get(req.params.name);
    if (!agent) return res.status(404).json({ error: `${req.params.name}@asom not found` });
    res.json(agent);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** The canonical capability vocabulary (for UI hints / autocomplete). */
app.get("/capabilities", (_req, res) => res.json({ canonical: CANONICAL_TAGS }));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`asom discovery API → http://localhost:${PORT} (chain ${client.chainId}, ttl ${TTL_MS}ms)`);
});
