import { AsomClient } from "@asom/sdk";
import type { WalletClient } from "viem";
import { RPC_URL } from "./wagmi";

/** A read-only asom client (no signer) for the public RPC. */
export function readClient(): AsomClient {
  return new AsomClient({ rpcUrl: RPC_URL });
}

/** A write-capable asom client backed by the connected browser wallet. */
export function writeClient(walletClient: WalletClient): AsomClient {
  return new AsomClient({ rpcUrl: RPC_URL, walletClient });
}

/** Canonical capability vocabulary (mirrors @asom/discover taxonomy) — used for the
 *  advertise/create capability pickers. Keep in sync with packages/discover/src/taxonomy.ts. */
export const CANONICAL_TAGS = [
  "llm.summarize",
  "llm.translate",
  "llm.classify",
  "llm.chat",
  "llm.generate",
  "llm.judge",
  "oracle.price",
  "data.fetch",
  "web.extract",
  "image.generate",
  "code.review",
  "somnia.json-fetch",
  "somnia.llm-inference",
  "somnia.parse-website",
] as const;

/** Task status names indexed by the on-chain enum value. */
export const TASK_STATUS = ["None", "Open", "Accepted", "Submitted", "Approved", "Refunded"] as const;
