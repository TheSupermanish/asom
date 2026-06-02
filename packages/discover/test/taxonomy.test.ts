import { describe, it, expect } from "vitest";
import { expandQuery, labelHash } from "../src/taxonomy.js";
import { capabilityTag } from "@tsugu/sdk";

describe("taxonomy", () => {
  it("maps human queries to canonical capability tags", () => {
    expect(expandQuery("summarize my pdf").canonical).toContain("llm.summarize");
    expect(expandQuery("can you translate this").canonical).toContain("llm.translate");
    expect(expandQuery("I need a BTC price oracle").canonical).toContain("oracle.price");
    expect(expandQuery("llm.summarize").canonical).toContain("llm.summarize"); // verbatim canonical
    expect(expandQuery("tldr please").canonical).toContain("llm.summarize"); // alias
  });

  it("returns no canonical tag for an unrelated query", () => {
    expect(expandQuery("xyzzy frobnicate").canonical).toEqual([]);
  });

  it("labels an on-chain tag hash with its canonical name (and only when known)", () => {
    expect(labelHash(capabilityTag("llm.summarize"))).toBe("llm.summarize");
    expect(labelHash("0x00000000000000000000000000000000000000000000000000000000deadbeef")).toBeUndefined();
  });
});
