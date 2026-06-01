import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address } from "viem";

const home = mkdtempSync(join(tmpdir(), "tsugu-kc-"));
let ks: typeof import("../src/keystore.js");
let kc: typeof import("../src/keychain.js");

beforeAll(async () => {
  process.env.TSUGU_HOME = home;
  ks = await import("../src/keystore.js");
  kc = await import("../src/keychain.js");
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

// A deterministic test seed (the well-known anvil mnemonic; not real funds).
const SEED = "test test test test test test test test test test test junk";

/** Stub OwnershipOracle: an address has "ever owned" iff it's in the set. */
function oracle(everOwned: Set<string>) {
  return { hasEverOwned: async (a: Address) => everOwned.has(a.toLowerCase()) };
}

describe("keychain — transfer-safe HD index allocation", () => {
  it("returns the first index whose derived address has NEVER owned", async () => {
    const used = new Set([1, 2, 3].map((i) => ks.deriveAccount(SEED, i).address.toLowerCase()));
    expect(await kc.nextFreeIndex(oracle(used), SEED)).toBe(4);
  });

  it("fills the lowest never-used gap (an index is free iff never used)", async () => {
    const used = new Set([2].map((i) => ks.deriveAccount(SEED, i).address.toLowerCase()));
    expect(await kc.nextFreeIndex(oracle(used), SEED)).toBe(1);
  });

  it("treats a fresh seed (nothing owned) as index 1", async () => {
    expect(await kc.nextFreeIndex(oracle(new Set()), SEED)).toBe(1);
  });

  it("throws when every index up to the cap has been used", async () => {
    const all = new Set<string>();
    for (let i = 1; i <= 3; i++) all.add(ks.deriveAccount(SEED, i).address.toLowerCase());
    await expect(kc.nextFreeIndex(oracle(all), SEED, 3)).rejects.toThrow(/no free HD index/);
  });
});

describe("keychain — indexOfOwner", () => {
  it("finds the index that derives a given owner address", () => {
    const a5 = ks.deriveAccount(SEED, 5).address;
    expect(kc.indexOfOwner(SEED, a5, 10)).toBe(5);
  });

  it("includes the funding account at index 0", () => {
    const a0 = ks.deriveAccount(SEED, 0).address;
    expect(kc.indexOfOwner(SEED, a0, 10)).toBe(0);
  });

  it("returns null for an address not derived from the seed", () => {
    expect(kc.indexOfOwner(SEED, "0x000000000000000000000000000000000000dEaD" as Address, 10)).toBeNull();
  });
});

describe("keychain — ownerKeyFor", () => {
  it("HD mode: returns the derived key controlling the agent", () => {
    const a3 = ks.deriveAccount(SEED, 3);
    const op0 = ks.deriveAccount(SEED, 0);
    expect(kc.ownerKeyFor("neo", a3.address, SEED, op0.privateKey, op0.address)).toBe(a3.privateKey);
  });

  it("HD mode: throws when the owner isn't derived from your seed", () => {
    const op0 = ks.deriveAccount(SEED, 0);
    expect(() =>
      kc.ownerKeyFor("neo", "0x000000000000000000000000000000000000dEaD" as Address, SEED, op0.privateKey, op0.address, 16),
    ).toThrow(/isn't derived from your seed/);
  });

  it("single-key mode: returns the operator key when it owns the agent", () => {
    const op0 = ks.deriveAccount(SEED, 0);
    expect(kc.ownerKeyFor("neo", op0.address, undefined, op0.privateKey, op0.address)).toBe(op0.privateKey);
  });

  it("single-key mode: throws when the operator key doesn't own the agent", () => {
    const op0 = ks.deriveAccount(SEED, 0);
    const other = ks.deriveAccount(SEED, 9).address;
    expect(() => kc.ownerKeyFor("neo", other, undefined, op0.privateKey, op0.address)).toThrow(/don't control it/);
  });
});
