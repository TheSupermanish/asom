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
  if (len === 0) throw new Error("tsugu: agent name is empty");
  if (len > 32) throw new Error(`tsugu: agent name too long (${len} chars; max 32)`);

  for (let i = 0; i < len; i++) {
    const c = name.charCodeAt(i);
    const isLower = c >= 0x61 && c <= 0x7a; // a-z
    const isDigit = c >= 0x30 && c <= 0x39; // 0-9
    const isHyphen = c === 0x2d; // -
    if (!isLower && !isDigit && !isHyphen) {
      throw new Error(
        `tsugu: invalid character ${JSON.stringify(name[i])} at position ${i} — names are lowercase a-z, 0-9, and hyphen`,
      );
    }
    if (isHyphen) {
      if (i === 0 || i === len - 1) throw new Error("tsugu: a name cannot start or end with a hyphen");
      if (name.charCodeAt(i - 1) === 0x2d) throw new Error("tsugu: a name cannot contain a doubled hyphen");
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
 * A plain non-negative decimal with at most 18 fractional digits (1 wei of STT).
 * Deliberately strict: no scientific notation ("1e-3"), no hex ("0x1"), no sign,
 * no >18-decimal silent truncation — all of which `Number()` would wave through
 * only for `parseEther` to then reject opaquely (or quietly round).
 */
const STT_DECIMAL = /^\d+(\.\d{1,18})?$/;

/**
 * Parse an STT amount (a decimal string like "0.05") to wei. Rejects anything that
 * isn't a clean non-negative decimal with ≤18 fractional digits, with one friendly
 * message — so a bad value never reaches `parseEther` to throw something opaque.
 */
export function parseStt(amount: string): bigint {
  const s = amount.trim();
  if (!STT_DECIMAL.test(s)) {
    throw new Error(
      `tsugu: expected a positive decimal STT amount like "0.05" (≤18 decimals, no scientific/hex notation), got ${JSON.stringify(amount)}`,
    );
  }
  return parseEther(s as `${number}`);
}
