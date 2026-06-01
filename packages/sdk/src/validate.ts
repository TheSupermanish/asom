import { parseEther } from "viem";

/**
 * Client-side mirror of AgentRegistry._validateName (the on-chain source of
 * truth). Validating here lets the SDK/CLI fail fast with a friendly message
 * instead of paying an RPC round-trip to get a raw revert. The contract still
 * re-validates on-chain — this never weakens the guarantee, it only improves DX.
 *
 * Rules: lowercase a-z, 0-9, hyphen; 1–32 chars; no leading/trailing/doubled hyphen.
 */
export function validateName(name: string): void {
  const len = name.length;
  if (len === 0) throw new Error("asom: agent name is empty");
  if (len > 32) throw new Error(`asom: agent name too long (${len} chars; max 32)`);

  for (let i = 0; i < len; i++) {
    const c = name.charCodeAt(i);
    const isLower = c >= 0x61 && c <= 0x7a; // a-z
    const isDigit = c >= 0x30 && c <= 0x39; // 0-9
    const isHyphen = c === 0x2d; // -
    if (!isLower && !isDigit && !isHyphen) {
      throw new Error(
        `asom: invalid character ${JSON.stringify(name[i])} at position ${i} — names are lowercase a-z, 0-9, and hyphen`,
      );
    }
    if (isHyphen) {
      if (i === 0 || i === len - 1) throw new Error("asom: a name cannot start or end with a hyphen");
      if (name.charCodeAt(i - 1) === 0x2d) throw new Error("asom: a name cannot contain a doubled hyphen");
    }
  }
}

/** Non-throwing form of {@link validateName}. */
export function isValidName(name: string): boolean {
  try {
    validateName(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse an STT amount (a decimal string like "0.05") to wei, rejecting NaN,
 * negative, and non-finite inputs with a clear message — instead of letting a
 * bad value flow into parseEther and throw something opaque (or compute NaN).
 */
export function parseStt(amount: string): bigint {
  const n = Number(amount);
  // Note: Number("") and Number("  ") are 0, not NaN — reject blank explicitly so
  // it never reaches parseEther("") (which throws an opaque BigInt error).
  if (amount.trim() === "" || !Number.isFinite(n) || n < 0) {
    throw new Error(`asom: expected a positive decimal STT amount like "0.05", got ${JSON.stringify(amount)}`);
  }
  return parseEther(amount as `${number}`);
}
