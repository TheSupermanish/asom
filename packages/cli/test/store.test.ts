import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, statSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address } from "viem";

// store.ts reads TSUGU_HOME (via keystore.ts) at import time — set it, then import.
const home = mkdtempSync(join(tmpdir(), "tsugu-store-"));
let store: typeof import("../src/store.js");

beforeAll(async () => {
  process.env.TSUGU_HOME = home;
  store = await import("../src/store.js");
});
beforeEach(() => {
  rmSync(join(home, "agents"), { recursive: true, force: true });
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

const agentsDir = () => join(home, "agents");

function sample(name: string): import("../src/store.js").AgentFile {
  return {
    name,
    account: "0x3Ec0397677a61121CAe3b503835EDd3bB76061d3" as Address,
    owner: "0x875eFb079A2b68267a1bE03cAd0E1A7Ee4bA0B2E" as Address,
    index: 1,
    tokenId: "1",
    chainId: 50312,
    createdAt: new Date(0).toISOString(),
  };
}

describe("store (local agent records)", () => {
  it("round-trips an agent record", () => {
    store.saveAgent(sample("neo"));
    expect(store.readAgent("neo")).toEqual(sample("neo"));
  });

  it("returns null for an unknown agent", () => {
    expect(store.readAgent("ghost")).toBeNull();
  });

  it("round-trips a single-key-mode record (index: null)", () => {
    const rec = { ...sample("solo"), index: null };
    store.saveAgent(rec);
    expect(store.readAgent("solo")).toEqual(rec);
    expect(store.listAgents().find((a) => a.name === "solo")?.index).toBeNull();
  });

  it("lists saved agents and SKIPS a corrupt file without throwing", () => {
    store.saveAgent(sample("neo"));
    store.saveAgent(sample("trinity"));
    // A hand-edited / partially-written file must not crash `tsugu ls`.
    writeFileSync(join(agentsDir(), "broken.json"), "{ not valid json");

    const names = store.listAgents().map((a) => a.name).sort();
    expect(names).toEqual(["neo", "trinity"]);
    expect(store.readAgent("broken")).toBeNull();
  });

  it("removeAgent deletes a record and is a no-op when absent", () => {
    store.saveAgent(sample("neo"));
    expect(store.readAgent("neo")).not.toBeNull();
    store.removeAgent("neo");
    expect(store.readAgent("neo")).toBeNull();
    expect(() => store.removeAgent("neo")).not.toThrow(); // idempotent
  });

  it("writes records 0644 inside a 0700 agents dir, and holds no secrets", () => {
    store.saveAgent(sample("neo"));
    expect(statSync(agentsDir()).mode & 0o777).toBe(0o700);
    expect(statSync(join(agentsDir(), "neo.json")).mode & 0o777).toBe(0o644);
    const raw = readdirSync(agentsDir());
    expect(raw).toContain("neo.json");
  });

  it("listAgents returns [] when nothing has been created", () => {
    expect(existsSync(agentsDir())).toBe(false);
    expect(store.listAgents()).toEqual([]);
  });
});
