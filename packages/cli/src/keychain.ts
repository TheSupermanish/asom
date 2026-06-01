import type { Address } from "viem";
import type { TsuguClient } from "@tsugu/sdk";
import { deriveAccount } from "./keystore.js";

type Hex = `0x${string}`;

/** Hard cap on HD scanning, so a bug or pathological seed can't loop forever. */
export const MAX_HD_INDEX = 1000;

/**
 * Minimal slice of TsuguClient that the keychain needs — lets tests pass a stub
 * instead of a live client.
 */
export interface OwnershipOracle {
  hasEverOwned(owner: Address): Promise<boolean>;
}

/**
 * First HD index (>=1) whose derived address has NEVER owned an agent.
 *
 * Uses chain HISTORY (`hasEverOwned`), not a live `balanceOf`. That is the whole
 * point: an index is "used" the moment it ever registers an agent, and stays used
 * forever — even after the agent is transferred away. So selling/handing off an
 * agent can never make a later `create` re-derive that same key for a new agent.
 * Chain-derived, so it works from the seed alone with no local bookkeeping.
 */
export async function nextFreeIndex(oracle: OwnershipOracle, seed: string, max = MAX_HD_INDEX): Promise<number> {
  for (let i = 1; i <= max; i++) {
    const { address } = deriveAccount(seed, i);
    if (!(await oracle.hasEverOwned(address))) return i;
  }
  throw new Error(`no free HD index found below ${max}`);
}

/**
 * Which HD index derives `ownerAddress`, or null if none within the cap.
 *
 * Lets `exec`/`transfer` sign as an agent's CURRENT owner without trusting the
 * (deletable, possibly stale) local record's stored index — and correctly reports
 * "you don't own this" when the owner isn't derived from your seed at all.
 * Index 0 (the funding account) is included: a single-key-ish setup can own agents
 * with index 0 too.
 */
export function indexOfOwner(seed: string, ownerAddress: Address, max = MAX_HD_INDEX): number | null {
  const target = ownerAddress.toLowerCase();
  for (let i = 0; i <= max; i++) {
    if (deriveAccount(seed, i).address.toLowerCase() === target) return i;
  }
  return null;
}

/**
 * The private key that currently controls `agentOwner`.
 *  - HD mode (seed present): the derived key at the matching index, or an error
 *    if the agent isn't owned by any address this seed derives (you don't control it).
 *  - single-key mode (no seed): the operator key owns everything it owns; the
 *    caller is responsible for the agent actually being owned by it (the on-chain
 *    call will revert otherwise).
 */
export function ownerKeyFor(
  agentName: string,
  agentOwner: Address,
  seed: string | undefined,
  operatorKey: Hex,
  operatorAddress: Address,
  max = MAX_HD_INDEX,
): Hex {
  if (!seed) {
    if (agentOwner.toLowerCase() !== operatorAddress.toLowerCase()) {
      throw new Error(`${agentName}@tsugu is owned by ${agentOwner}, not your key ${operatorAddress} — you don't control it`);
    }
    return operatorKey;
  }
  const idx = indexOfOwner(seed, agentOwner, max);
  if (idx === null) {
    throw new Error(`${agentName}@tsugu is owned by ${agentOwner}, which isn't derived from your seed — you don't control it`);
  }
  return deriveAccount(seed, idx).privateKey;
}
