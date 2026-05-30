import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ANVIL_PORT = 8545;
export const ANVIL_RPC = `http://127.0.0.1:${ANVIL_PORT}`;

/** Anvil's first prefunded dev account (deterministic, well-known test key). */
export const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
export const ANVIL_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

function anvilBin(): string {
  const local = join(homedir(), ".foundry", "bin", "anvil");
  return existsSync(local) ? local : "anvil";
}

async function waitForRpc(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`anvil did not start within ${timeoutMs}ms`);
}

export interface AnvilHandle {
  rpcUrl: string;
  stop: () => void;
}

/** Start a local anvil node and resolve once it's accepting RPC. */
export async function startAnvil(): Promise<AnvilHandle> {
  const proc: ChildProcess = spawn(
    anvilBin(),
    ["--port", String(ANVIL_PORT), "--silent"],
    { stdio: "ignore" },
  );
  proc.on("error", (e) => {
    throw new Error(`failed to spawn anvil: ${e.message}`);
  });
  await waitForRpc(ANVIL_RPC);
  return {
    rpcUrl: ANVIL_RPC,
    stop: () => {
      proc.kill("SIGTERM");
    },
  };
}
