import { TsuguClient } from "@tsugu/sdk";
import type { WalletClient } from "viem";
import { RPC_URL } from "./wagmi";

/** A read-only tsugu client (no signer) for the public RPC. */
export function readClient(): TsuguClient {
  return new TsuguClient({ rpcUrl: RPC_URL });
}

/** A write-capable tsugu client backed by the connected browser wallet. */
export function writeClient(walletClient: WalletClient): TsuguClient {
  return new TsuguClient({ rpcUrl: RPC_URL, walletClient });
}

/** Canonical capability vocabulary (mirrors @tsugu/discover taxonomy) — used for the
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
