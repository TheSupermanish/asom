import { TsuguClient } from "@tsugu/sdk";
import { AgentDirectory } from "@tsugu/discover";

/**
 * Server-side discovery engine — the former standalone @tsugu/api, now folded into the
 * one app as Next route handlers (see app/api/*). A single AgentDirectory with a TTL
 * cache is reused across requests in the same server process, so the live
 * CapabilityRegistry is read at most once per `DISCOVER_TTL_MS` window.
 *
 * Reads only (public RPC, no signer) — every write still goes through the user's
 * browser wallet client-side. Server env vars (no NEXT_PUBLIC_ prefix) keep the RPC
 * choice off the client bundle; falls back to the same public Shannon endpoint.
 */
const RPC = process.env.SHANNON_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://dream-rpc.somnia.network";
const TTL_MS = Number(process.env.DISCOVER_TTL_MS ?? 30_000);

let _client: TsuguClient | null = null;
let _directory: AgentDirectory | null = null;

/** The shared read-only TsuguClient (public RPC, no signer) reused across requests. */
export function serverClient(): TsuguClient {
  if (!_client) _client = new TsuguClient({ rpcUrls: [RPC] });
  return _client;
}

function client(): TsuguClient {
  return serverClient();
}

/** The shared, TTL-cached agent directory (lazily built on first request). */
export function directory(): AgentDirectory {
  if (!_directory) _directory = new AgentDirectory(client(), TTL_MS);
  return _directory;
}

/** Chain id of the configured RPC — surfaced by /api/health. */
export function chainId(): number {
  return client().chainId;
}
