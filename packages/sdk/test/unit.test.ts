import { describe, it, expect } from "vitest";
import {
  shannon,
  validateName,
  isValidName,
  parseStt,
  PACT_KINDS,
  CLAIM_TYPES,
  PACT_STATUS,
  CHECK_STATUS,
  vaultDeployments,
} from "../src/index.js";
import { parseEther } from "viem";

describe("chain", () => {
  it("is Somnia Shannon", () => {
    expect(shannon.id).toBe(50312);
  });
});

describe("vault metadata", () => {
  it("exposes the Pact enums", () => {
    expect(PACT_KINDS).toEqual(["Relief", "Medical", "Fundraise", "Insurance", "Custom"]);
    expect(CLAIM_TYPES).toEqual(["Web", "Data", "Text"]);
    expect(PACT_STATUS).toContain("Confirmed");
    expect(CHECK_STATUS).toContain("Inconclusive");
  });

  it("has a Shannon Vault deployment", () => {
    expect(vaultDeployments[50312].vault).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(vaultDeployments[50312].strategy).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});

describe("parseStt", () => {
  it("parses positive decimals to wei", () => {
    expect(parseStt("0.05")).toBe(parseEther("0.05"));
    expect(parseStt("0")).toBe(0n);
    expect(parseStt("12")).toBe(parseEther("12"));
  });

  it("rejects scientific/hex/negative/over-precision/garbage", () => {
    for (const bad of ["1e-3", "1E3", "0x10", "-1", "1.2345678901234567890", "abc", "1,5", ".", "5.", ""]) {
      expect(() => parseStt(bad)).toThrow();
    }
  });
});

describe("validateName", () => {
  it("accepts valid names", () => {
    for (const n of ["neo", "agent-007", "x", "trinity99", "a".repeat(32)]) {
      expect(isValidName(n)).toBe(true);
    }
  });

  it("rejects invalid names", () => {
    for (const n of ["", "-bad", "bad-", "a--b", "UP", "spaces here", "my_agent", "a".repeat(33)]) {
      expect(isValidName(n)).toBe(false);
    }
  });
});
