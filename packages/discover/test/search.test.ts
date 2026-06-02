import { describe, it, expect } from "vitest";
import { searchAgents } from "../src/search.js";
import type { AgentRecord } from "../src/types.js";

const rec = (over: Partial<AgentRecord>): AgentRecord => ({
  name: "x",
  tokenId: "1",
  account: "0x0000000000000000000000000000000000000001",
  owner: "0x0000000000000000000000000000000000000002",
  capabilities: [],
  capabilityHashes: [],
  serviceURI: "",
  pricePerCall: "0",
  tags: [],
  updatedAt: "",
  ...over,
});

const agents: AgentRecord[] = [
  rec({ name: "summa", capabilities: ["llm.summarize"], description: "summarize long documents" }),
  rec({ name: "trans", capabilities: ["llm.translate"], tags: ["language"] }),
  rec({ name: "btc", capabilities: ["oracle.price"], description: "bitcoin price feed" }),
];

describe("searchAgents", () => {
  it("finds an agent by a human term mapped to its canonical capability", () => {
    const r = searchAgents(agents, "summarize my pdf");
    expect(r[0].agent.name).toBe("summa");
    expect(r[0].matched).toContain("llm.summarize");
  });

  it("ranks the capability match at the top", () => {
    expect(searchAgents(agents, "price")[0].agent.name).toBe("btc");
    expect(searchAgents(agents, "translate to spanish")[0].agent.name).toBe("trans");
  });

  it("empty query returns all (browse), sorted by name", () => {
    expect(searchAgents(agents, "").map((x) => x.agent.name)).toEqual(["btc", "summa", "trans"]);
  });

  it("capability filter restricts results", () => {
    expect(searchAgents(agents, "", { capability: "translate" }).map((x) => x.agent.name)).toEqual(["trans"]);
  });

  it("a real query that matches nothing returns empty", () => {
    expect(searchAgents(agents, "zzzznomatch")).toEqual([]);
  });

  it("respects limit", () => {
    expect(searchAgents(agents, "", { limit: 2 })).toHaveLength(2);
  });
});
