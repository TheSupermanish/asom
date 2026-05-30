import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Anvil's first prefunded dev account (deterministic, well-known test key). */
export const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
export const ANVIL_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

/** anvil's default chain id (31337) as the hex eth_chainId returns. */
const ANVIL_CHAIN_ID_HEX = "0x7a69";

function anvilBin(): string {
  const local = join(homedir(), ".foundry", "bin", "anvil");
  return existsSync(local) ? local : "anvil";
}

async function rpcChainId(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string };
    return json.result ?? null;
  } catch {
    return null; // not up yet
  }
}

export interface AnvilHandle {
  rpcUrl: string;
  stop: () => void;
}

/**
 * Start a local anvil node on a random port and resolve once it answers with
 * the expected chain id. Random port avoids collisions with a developer's
 * already-running anvil; the chain-id check guarantees we talk to the node we
 * spawned, not whatever happened to be on the port. Rejects (rather than
 * hanging) if the binary is missing or anvil exits during startup, and registers
 * a process-exit cleanup so a crashed test run can't leak the child.
 */
export async function startAnvil(): Promise<AnvilHandle> {
  const port = 20_000 + Math.floor(Math.random() * 40_000);
  const rpcUrl = `http://127.0.0.1:${port}`;

  const proc: ChildProcess = spawn(anvilBin(), ["--port", String(port), "--silent"], {
    stdio: "ignore",
  });

  let earlyExit: string | null = null;
  proc.on("error", (e) => {
    earlyExit = `failed to spawn anvil (${e.message}); is Foundry installed? (foundryup)`;
  });
  proc.on("exit", (code) => {
    if (earlyExit === null) earlyExit = `anvil exited during startup (code ${code})`;
  });

  const cleanup = () => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already gone
    }
  };
  process.once("exit", cleanup);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (earlyExit) {
      cleanup();
      throw new Error(earlyExit);
    }
    const id = await rpcChainId(rpcUrl);
    if (id === ANVIL_CHAIN_ID_HEX) {
      return {
        rpcUrl,
        stop: () => {
          process.removeListener("exit", cleanup);
          proc.kill("SIGTERM");
          const t = setTimeout(() => {
            try {
              proc.kill("SIGKILL");
            } catch {
              // already gone
            }
          }, 2_000);
          t.unref?.();
        },
      };
    }
    if (id !== null) {
      cleanup();
      throw new Error(
        `port ${port} answered chainId ${id}, expected ${ANVIL_CHAIN_ID_HEX} — something else is listening`,
      );
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  cleanup();
  throw new Error(`anvil did not become ready within 15s on port ${port}`);
}
