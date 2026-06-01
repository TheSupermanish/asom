import { Command } from "commander";
import pc from "picocolors";
import { parseEther, isAddress, isHex, type Address } from "viem";
import { config as loadEnv } from "dotenv";
import { AsomClient, type Agent, validateName, parseStt } from "@asom/sdk";
import { saveAgent, readAgent, listAgents, removeAgent } from "./store.js";
import { nextFreeIndex, ownerKeyFor } from "./keychain.js";
import {
  ASOM_HOME,
  hasKeystore,
  operatorAddress,
  saveSeed,
  loadSeed,
  removeKeystore,
  newMnemonic,
  isValidMnemonic,
  deriveAccount,
  prompt,
} from "./keystore.js";

loadEnv();

// Injected by tsup at build time (see tsup.config.ts); undefined under tsx/vitest.
declare const __ASOM_CLI_VERSION__: string | undefined;
const VERSION = typeof __ASOM_CLI_VERSION__ !== "undefined" ? __ASOM_CLI_VERSION__ : "0.0.0-dev";

const FAUCET_URL = "https://cloud.google.com/application/web3/faucet/somnia/shannon";

const brand = (s: string) => pc.bold(pc.magenta(s));
const accent = (s: string) => pc.cyan(s);
const ok = (s: string) => pc.green(s);
const warn = (s: string) => pc.yellow(s);
const bad = (s: string) => pc.red(s);
const muted = (s: string) => pc.dim(s);
const label = (s: string) => pc.dim(pc.gray(s.padEnd(9)));

function banner() {
  console.log("");
  console.log(`  ${brand("◆ asom")} ${muted("· agents on Somnia")}`);
}

const program = new Command();
program
  .name("asom")
  .description("Create and operate agents on Somnia — an HD keychain: one seed, a key per agent.")
  .version(VERSION);

type Hex = `0x${string}`;

/**
 * Unlock a signer, non-custodially.
 *   - PRIVATE_KEY env  → single-key mode (agents owned by that key; no derivation)
 *   - encrypted seed   → HD mode: operator = index 0, agents = index 1+ (self-sovereign)
 */
async function unlock(): Promise<{ operatorKey: Hex; seed?: string }> {
  const fromEnv = process.env.PRIVATE_KEY as Hex | undefined;
  if (fromEnv) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(fromEnv)) {
      console.error(bad("  ✗ PRIVATE_KEY is set but not a valid 0x-prefixed 32-byte key."));
      process.exit(1);
    }
    console.error(
      muted("  ⚠ using a plaintext PRIVATE_KEY (single-key mode). For an HD keychain: ") +
        accent("asom login"),
    );
    return { operatorKey: fromEnv };
  }

  if (hasKeystore()) {
    const envPw = process.env.ASOM_PASSWORD;
    if (envPw) console.error(muted("  ⚠ using ASOM_PASSWORD from env — automation only (visible to child processes)."));
    const pw = envPw ?? (await prompt("  password: ", true, false));
    try {
      const seed = loadSeed(pw);
      return { operatorKey: deriveAccount(seed, 0).privateKey, seed };
    } catch (e) {
      console.error(bad(`  ✗ ${(e as Error).message}.`));
      process.exit(1);
    }
  }

  console.log("");
  console.error(bad("  ✗ No wallet set up."));
  console.error(`    Create or import one once: ${accent("asom login")}`);
  console.error(muted(`    (or export PRIVATE_KEY=0x… for a quick testnet run)`));
  console.error(muted(`    No STT? Faucet → ${FAUCET_URL}`));
  console.log("");
  process.exit(1);
}

function client(key?: Hex): AsomClient {
  return new AsomClient({ privateKey: key, rpcUrl: process.env.SHANNON_RPC_URL });
}

/** Validate an agent name client-side (same rules as the contract). Exits with a
 *  friendly message instead of paying an RPC round-trip for a raw revert. */
function requireValidName(name: string): void {
  try {
    validateName(name);
  } catch (e) {
    console.error(bad(`  ✗ ${(e as Error).message.replace(/^asom: /, "")}`));
    process.exit(1);
  }
}

/** Validate a decimal STT amount (rejects NaN/negative) and return it as a number
 *  for threshold math. Exits friendly on bad input. */
function parseAmount(raw: string, flag: string): number {
  try {
    parseStt(raw);
  } catch {
    console.error(bad(`  ✗ ${flag} must be a positive decimal like 0.05 (got ${JSON.stringify(raw)})`));
    process.exit(1);
  }
  return parseFloat(raw);
}

/** Minimum STT to keep on an agent's owner key so it can pay Shannon's inflated gas. */
const GAS_FLOOR_STT = 0.01;

/**
 * Ensure the agent's owner key can pay for gas. Self-sovereign HD agents are
 * owned by a derived key that starts empty; signing from it (exec/transfer) needs
 * gas. If it's short, top it up transparently from your funding account.
 */
/**
 * The private key that controls `agent`. Fast path: trust the local record's
 * stored HD index, but ONLY if it actually derives the agent's current owner
 * (so a transfer can't make a stale index point at the wrong key). Otherwise
 * fall back to scanning the seed for the owner (ownerKeyFor).
 */
function resolveOwnerKey(name: string, agent: Agent, seed: string | undefined, operatorKey: Hex, operatorAddr: Address): Hex {
  if (seed) {
    const rec = readAgent(name);
    if (rec && rec.index !== null) {
      const d = deriveAccount(seed, rec.index);
      if (d.address.toLowerCase() === agent.owner.toLowerCase()) return d.privateKey;
    }
  }
  return ownerKeyFor(name, agent.owner, seed, operatorKey, operatorAddr);
}

async function ensureOwnerGas(operator: AsomClient, ownerClient: AsomClient, label: string): Promise<void> {
  const ownerAddr = ownerClient.signerAddress!;
  // Same key as the operator (single-key mode / owner is index 0): nothing to do.
  if (operator.signerAddress && ownerAddr.toLowerCase() === operator.signerAddress.toLowerCase()) return;
  const bal = await operator.getBalance(ownerAddr);
  if (bal >= parseEther(GAS_FLOOR_STT.toString())) return;
  await assertFunded(operator, GAS_FLOOR_STT + 0.02, `top up ${label}'s owner key for gas`);
  console.log(muted(`  ⛽ ${label}'s owner key ${ownerAddr} is out of gas; topping up ${GAS_FLOOR_STT} STT...`));
  await operator.send(ownerAddr, GAS_FLOOR_STT.toString());
}

function formatStt(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

async function assertFunded(c: AsomClient, needStt: number, what: string): Promise<void> {
  const addr = c.signerAddress!;
  const bal = await c.getBalance(addr);
  if (bal >= parseEther(needStt.toString())) return;
  console.log("");
  console.error(bad(`  ✗ Not enough STT to ${what}.`));
  console.error(`    ${accent(addr)} has ${warn(formatStt(bal))} STT, needs ~${needStt}.`);
  if (c.chainId === 50312) console.error(`    Grab testnet STT → ${accent(FAUCET_URL)}`);
  else console.error(`    Send ${accent("SOMI")} to ${accent(addr)} to fund it.`);
  console.log("");
  process.exit(1);
}

function printAgent(c: AsomClient, agent: Agent, balanceWei?: bigint) {
  console.log("");
  console.log(`  ${pc.bold(pc.bgMagenta(pc.white(` ${agent.name}@asom `)))}`);
  console.log("");
  console.log(`  ${label("token")} ${pc.bold("#" + agent.tokenId)}`);
  console.log(`  ${label("wallet")} ${accent(agent.account)}`);
  console.log(`  ${label("owner")} ${agent.owner}`);
  if (balanceWei !== undefined) console.log(`  ${label("balance")} ${ok(formatStt(balanceWei))} STT`);
  const url = c.explorer("address", agent.account);
  if (url) console.log(`  ${label("explorer")} ${muted(url)}`);
  console.log("");
}

// --- wallet / keychain -----------------------------------------------------

program
  .command("login")
  .description("Set up your HD wallet: generate a new seed or import an existing one (encrypted)")
  .option("--import", "import an existing 12-word seed instead of generating one")
  .action(async (opts: { import?: boolean }) => {
    banner();
    if (hasKeystore()) {
      const yes = await prompt(`  A wallet is already set up (${operatorAddress()}). Replace it? [y/N] `);
      if (yes.toLowerCase() !== "y") return;
    }

    let mode = opts.import ? "import" : "new";
    if (!opts.import) {
      const choice = await prompt("  [N]ew seed or [i]mport existing?  (N) ");
      if (choice.toLowerCase().startsWith("i")) mode = "import";
    }

    let mnemonic: string;
    if (mode === "import") {
      mnemonic = await prompt("  12-word seed (hidden): ", true, false);
      if (!isValidMnemonic(mnemonic)) {
        console.error(bad("  ✗ Not a valid BIP-39 seed phrase."));
        process.exit(1);
      }
    } else {
      mnemonic = newMnemonic();
    }

    const pw = await prompt("  set a password: ", true, false);
    const pw2 = await prompt("  confirm password: ", true, false);
    if (pw !== pw2) {
      console.error(bad("  ✗ Passwords don't match."));
      process.exit(1);
    }
    if (pw.length < 8) {
      console.error(bad("  ✗ Use at least 8 characters."));
      process.exit(1);
    }

    const addr = saveSeed(mnemonic, pw);
    console.log("");
    console.log(ok(`  ✓ Seed ${mode === "new" ? "created" : "imported"} and encrypted → ${ASOM_HOME}/keystore.json`));
    if (mode === "new") {
      console.log("");
      console.log(warn("  ⚠ Write these 12 words down. They recover every agent. asom can't restore them for you:"));
      console.log("");
      console.log(`    ${pc.bold(mnemonic)}`);
    }
    console.log("");
    console.log(`  ${label("account")} ${accent(addr)} ${muted("(index 0 — funds agent creation)")}`);
    if (mode === "new") {
      console.log(muted("  New account, 0 STT. Fund it to create agents:"));
      console.log(`  ${accent(FAUCET_URL)}`);
    }
  });

const key = program.command("key").description("Manage your encrypted seed");

key
  .command("export")
  .description("Reveal your 12-word seed (after password) — back it up safely")
  .action(async () => {
    banner();
    if (!hasKeystore()) {
      console.error(bad("  ✗ No keystore. Run: asom login (or you're using PRIVATE_KEY, which has no seed)"));
      process.exit(1);
    }
    const pw = await prompt("  password: ", true, false);
    let seed: string;
    try {
      seed = loadSeed(pw);
    } catch (e) {
      console.error(bad(`  ✗ ${(e as Error).message}.`));
      process.exit(1);
    }
    console.log(warn("  ⚠ Anyone with these words controls every agent. Never share or paste them."));
    console.log("");
    console.log(`  ${seed}`);
    console.log("");
  });

key
  .command("address")
  .description("Show your funding (index 0) address (no password needed)")
  .action(() => {
    const addr = operatorAddress();
    console.log(addr ? accent(addr) : muted("No keystore. Run: asom login"));
  });

program
  .command("logout")
  .description("Delete the encrypted seed from this machine")
  .action(async () => {
    if (!hasKeystore()) {
      console.log(muted("  Nothing to remove."));
      return;
    }
    const yes = await prompt(`  Delete the seed for ${operatorAddress()}? Make sure you exported it. [y/N] `);
    if (yes.toLowerCase() !== "y") return;
    removeKeystore();
    console.log(ok("  ✓ Seed removed."));
  });

// --- agents ----------------------------------------------------------------

program
  .command("create")
  .description("Create an agent: a name + its own ERC-6551 wallet, with its own derived key")
  .argument("<name>", "agent name (a-z, 0-9, hyphen; 1-32 chars)")
  .option("-s, --seed <stt>", "STT to seed the new agent wallet with", "0.02")
  .action(async (name: string, opts: { seed: string }) => {
    banner();
    requireValidName(name); // fail fast, no password/RPC needed for a bad name
    const seedStt = parseAmount(opts.seed, "--seed");
    const { operatorKey, seed } = await unlock();
    const c = client(operatorKey);
    await assertFunded(c, seedStt + 0.05, `create ${name}@asom`);

    if (!(await c.isAvailable(name))) {
      console.error(bad(`  ✗ ${name}@asom is already taken.`));
      process.exit(1);
    }
    if (readAgent(name)) {
      console.error(bad(`  ✗ You already have a local agent named ${name}.`));
      process.exit(1);
    }

    // HD mode: each agent gets its OWN key derived at the next index, and owns
    // itself. Single-key mode (PRIVATE_KEY): owned by your one key.
    let index: number | null = null;
    let owner: `0x${string}` | undefined;
    if (seed) {
      index = await nextFreeIndex(c, seed);
      owner = deriveAccount(seed, index).address;
    }

    console.log(muted(`  spinning up ${name}@asom...`));
    try {
      const agent = await c.createAgent(name, { owner, seedStt: opts.seed });
      saveAgent({
        name,
        account: agent.account,
        owner: agent.owner,
        index,
        tokenId: agent.tokenId.toString(),
        chainId: c.chainId,
        createdAt: new Date().toISOString(),
      });
      console.log(ok(`  ✨ ${pc.bold(name + "@asom")} is live${seed ? " and owns itself" : ""}.`));
      printAgent(c, agent, await c.getBalance(agent.account));
      if (index !== null) console.log(`  ${label("key")} ${muted(`derived from your seed at index ${index}`)}`);
      console.log(`  ${label("tx")} ${muted(c.explorer("tx", agent.txHash))}`);
      console.log("");
    } catch (err) {
      console.error(bad("  ✗ create failed:"), (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("resolve")
  .description("Resolve a name to its agent (no key needed)")
  .argument("<name>", "agent name to look up")
  .action(async (name: string) => {
    const c = client();
    try {
      const agent = await c.resolve(name);
      printAgent(c, agent, await c.getBalance(agent.account));
    } catch {
      console.log("");
      console.error(warn(`  ${name}@asom is not registered yet.`) + muted(`  (claim it: asom create ${name})`));
      console.log("");
      process.exit(1);
    }
  });

program
  .command("available")
  .description("Check whether a name is still free")
  .argument("<name>", "agent name to check")
  .action(async (name: string) => {
    const free = await client().isAvailable(name);
    console.log(free ? ok(`  ✓ ${pc.bold(name + "@asom")} is available`) : bad(`  ✗ ${name}@asom is taken`));
  });

program
  .command("ls")
  .description("List the agents you own locally (~/.asom/agents)")
  .action(() => {
    const agents = listAgents();
    if (agents.length === 0) {
      console.log(muted("  No local agents yet. Create one: ") + accent("asom create neo"));
      return;
    }
    console.log("");
    console.log(`  ${brand(`your agents (${agents.length})`)}`);
    for (const a of agents) {
      const idx = a.index !== null ? muted(` ·i${a.index}`) : "";
      console.log(`  ${accent("◆")} ${pc.bold(a.name + "@asom")} ${muted("#" + a.tokenId)}${idx}  ${muted(a.account)}`);
    }
    console.log("");
  });

program
  .command("fund")
  .description("Send STT to an agent's wallet (TBA)")
  .argument("<name>", "agent name")
  .option("-w, --wallet <stt>", "STT to send to the agent wallet", "0.01")
  .action(async (name: string, opts: { wallet: string }) => {
    banner();
    const { operatorKey } = await unlock();
    const c = client(operatorKey);
    let agent: Agent;
    try {
      agent = await c.resolve(name);
    } catch {
      console.error(warn(`  ${name}@asom is not registered.`));
      process.exit(1);
    }
    const amt = parseAmount(opts.wallet, "--wallet");
    if (amt <= 0) {
      console.log(muted("  Nothing to send. Use --wallet <stt>."));
      return;
    }
    await assertFunded(c, amt + 0.02, `fund ${name}@asom`);
    const tx = await c.send(agent.account, opts.wallet);
    console.log(ok(`  👛 ${opts.wallet} STT`) + ` → ${name}@asom wallet ${muted(agent.account)}`);
    console.log(`     ${muted(c.explorer("tx", tx))}`);
  });

program
  .command("exec")
  .description("Make an agent act — call execute() from its wallet (send STT or call a contract)")
  .argument("<name>", "the agent that should act")
  .requiredOption("-t, --to <address>", "the call target address")
  .option("-v, --value <stt>", "STT to send from the agent's own wallet", "0")
  .option("-d, --data <hex>", "calldata for a contract call (0x...)", "0x")
  .action(async (name: string, opts: { to: string; value: string; data: string }) => {
    banner();
    if (!isAddress(opts.to)) {
      console.error(bad("  ✗ --to must be a valid 0x address."));
      process.exit(1);
    }
    if (!isHex(opts.data)) {
      console.error(bad("  ✗ --data must be 0x-prefixed hex."));
      process.exit(1);
    }
    const value = parseAmount(opts.value, "--value");
    const { operatorKey, seed } = await unlock();
    const op = client(operatorKey);

    let agent: Agent;
    try {
      agent = await op.resolve(name);
    } catch {
      console.error(warn(`  ${name}@asom is not registered.`));
      process.exit(1);
    }

    let ownerKey: Hex;
    try {
      ownerKey = resolveOwnerKey(name, agent, seed, operatorKey, op.signerAddress!);
    } catch (e) {
      console.error(bad(`  ✗ ${(e as Error).message}`));
      process.exit(1);
    }
    const ac = client(ownerKey);

    // The agent pays --value from its OWN wallet; make sure it can.
    if (value > 0) {
      const walletBal = await op.getBalance(agent.account);
      if (walletBal < parseEther(opts.value)) {
        console.error(bad(`  ✗ ${name}@asom's wallet has ${formatStt(walletBal)} STT, needs ${opts.value}.`));
        console.error(muted(`    Fund it first: asom fund ${name} --wallet ${opts.value}`));
        process.exit(1);
      }
    }
    // The owner key pays gas; top it up from your account if it's empty.
    await ensureOwnerGas(op, ac, name);

    try {
      const tx = await ac.agentExecute(agent.account, {
        to: opts.to as Hex,
        value: opts.value,
        data: opts.data as Hex,
      });
      console.log(ok(`  ⚡ ${name}@asom executed`) + ` → ${muted(opts.to)}${value > 0 ? ` (${opts.value} STT)` : ""}`);
      console.log(`     ${muted(op.explorer("tx", tx))}`);
    } catch (err) {
      console.error(bad("  ✗ exec failed:"), (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("transfer")
  .description("Transfer an agent to a new owner — hands over its name + wallet")
  .argument("<name>", "the agent to transfer")
  .argument("<to>", "the new owner address")
  .action(async (name: string, to: string) => {
    banner();
    if (!isAddress(to)) {
      console.error(bad("  ✗ <to> must be a valid 0x address."));
      process.exit(1);
    }
    const { operatorKey, seed } = await unlock();
    const op = client(operatorKey);

    let agent: Agent;
    try {
      agent = await op.resolve(name);
    } catch {
      console.error(warn(`  ${name}@asom is not registered.`));
      process.exit(1);
    }

    let ownerKey: Hex;
    try {
      ownerKey = resolveOwnerKey(name, agent, seed, operatorKey, op.signerAddress!);
    } catch (e) {
      console.error(bad(`  ✗ ${(e as Error).message}`));
      process.exit(1);
    }
    const ac = client(ownerKey);
    await ensureOwnerGas(op, ac, name);

    try {
      const tx = await ac.transferAgent(name, to as Hex);
      removeAgent(name); // it's no longer an agent you self-own
      console.log(ok(`  🤝 ${name}@asom transferred`) + ` → ${muted(to)}`);
      console.log(`     ${muted(op.explorer("tx", tx))}`);
      console.log(muted("     removed from your local list (you no longer own it)."));
    } catch (err) {
      console.error(bad("  ✗ transfer failed:"), (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("whoami")
  .description("Show your funding address (index 0, or PRIVATE_KEY)")
  .action(() => {
    const envKey = process.env.PRIVATE_KEY as Hex | undefined;
    if (envKey) return console.log(accent(client(envKey).signerAddress!) + muted("  (PRIVATE_KEY)"));
    const addr = operatorAddress();
    console.log(addr ? accent(addr) + muted("  (seed · index 0)") : muted("No wallet. Run: asom login"));
  });

program.parseAsync(process.argv);
