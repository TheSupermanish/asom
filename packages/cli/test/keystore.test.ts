import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// keystore.ts captures TSUGU_HOME at import time — set it, then dynamic-import once.
const home = mkdtempSync(join(tmpdir(), "tsugu-ks-"));
let ks: typeof import("../src/keystore.js");

beforeAll(async () => {
  process.env.TSUGU_HOME = home;
  ks = await import("../src/keystore.js");
});
beforeEach(() => {
  try {
    ks.removeKeystore();
  } catch {
    /* none */
  }
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

const keystorePath = () => join(home, "keystore.json");

describe("keystore (HD seed)", () => {
  it("round-trips a seed with the right password", () => {
    const m = ks.newMnemonic();
    const addr = ks.saveSeed(m, "correct horse battery");
    expect(addr).toBe(ks.deriveAccount(m, 0).address);
    expect(ks.loadSeed("correct horse battery")).toBe(m);
  });

  it("rejects the wrong password", () => {
    ks.saveSeed(ks.newMnemonic(), "right-password");
    expect(() => ks.loadSeed("wrong-password")).toThrow(/wrong password/);
  });

  it("does NOT trim passwords (leading/trailing spaces are significant)", () => {
    const m = ks.newMnemonic();
    ks.saveSeed(m, "  spaced pass  ");
    expect(ks.loadSeed("  spaced pass  ")).toBe(m);
    expect(() => ks.loadSeed("spaced pass")).toThrow(/wrong password/);
  });

  it("rejects a truncated GCM auth tag (integrity floor)", () => {
    ks.saveSeed(ks.newMnemonic(), "pw-pw-pw-pw");
    const f = JSON.parse(readFileSync(keystorePath(), "utf8"));
    f.tag = f.tag.slice(0, 8);
    writeFileSync(keystorePath(), JSON.stringify(f));
    expect(() => ks.loadSeed("pw-pw-pw-pw")).toThrow(/corrupt keystore/);
  });

  it("rejects a downgraded scrypt N", () => {
    ks.saveSeed(ks.newMnemonic(), "pw-pw-pw-pw");
    const f = JSON.parse(readFileSync(keystorePath(), "utf8"));
    f.n = 2;
    writeFileSync(keystorePath(), JSON.stringify(f));
    expect(() => ks.loadSeed("pw-pw-pw-pw")).toThrow(/corrupt keystore/);
  });

  it("rejects an inflated scrypt N (memory-exhaustion guard)", () => {
    ks.saveSeed(ks.newMnemonic(), "pw-pw-pw-pw");
    const f = JSON.parse(readFileSync(keystorePath(), "utf8"));
    f.n = 1 << 22; // above the ceiling
    writeFileSync(keystorePath(), JSON.stringify(f));
    expect(() => ks.loadSeed("pw-pw-pw-pw")).toThrow(/corrupt keystore/);
  });

  it("rejects a non-power-of-two scrypt N", () => {
    ks.saveSeed(ks.newMnemonic(), "pw-pw-pw-pw");
    const f = JSON.parse(readFileSync(keystorePath(), "utf8"));
    f.n = 30000; // within [floor, ceil] but not a power of two
    writeFileSync(keystorePath(), JSON.stringify(f));
    expect(() => ks.loadSeed("pw-pw-pw-pw")).toThrow(/corrupt keystore/);
  });

  it("rejects an unsupported keystore version/type before touching crypto", () => {
    ks.saveSeed(ks.newMnemonic(), "pw-pw-pw-pw");
    const f = JSON.parse(readFileSync(keystorePath(), "utf8"));
    f.version = 3;
    writeFileSync(keystorePath(), JSON.stringify(f));
    expect(() => ks.loadSeed("pw-pw-pw-pw")).toThrow(/unsupported keystore version/);
  });

  it("writes the keystore with 0600 permissions", () => {
    ks.saveSeed(ks.newMnemonic(), "pw-pw-pw-pw");
    expect(statSync(keystorePath()).mode & 0o777).toBe(0o600);
  });

  it("derives distinct, deterministic accounts per index (keychain)", () => {
    const m = ks.newMnemonic();
    const a0 = ks.deriveAccount(m, 0);
    const a1 = ks.deriveAccount(m, 1);
    const a2 = ks.deriveAccount(m, 2);
    // distinct
    expect(new Set([a0.address, a1.address, a2.address]).size).toBe(3);
    // deterministic — same seed + index → same account
    expect(ks.deriveAccount(m, 1).address).toBe(a1.address);
    expect(ks.deriveAccount(m, 1).privateKey).toBe(a1.privateKey);
  });

  it("validates mnemonics", () => {
    expect(ks.isValidMnemonic(ks.newMnemonic())).toBe(true);
    expect(ks.isValidMnemonic("not a real seed phrase at all nope")).toBe(false);
  });
});
