import { Command } from "commander";
import pc from "picocolors";
import { config as loadEnv } from "dotenv";
import { TsuguClient, type Agent } from "@tsugu/sdk";

loadEnv();

const program = new Command();

program
  .name("tsugu")
  .description("Create and operate agents on Somnia — every agent gets a name and a wallet.")
  .version("0.0.1");

function client(needsKey: boolean): TsuguClient {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (needsKey && !privateKey) {
    console.error(pc.red("✗ PRIVATE_KEY not set."));
    console.error("  Set it in your shell or a .env file:  PRIVATE_KEY=0x...");
    process.exit(1);
  }
  return new TsuguClient({
    privateKey,
    rpcUrl: process.env.SHANNON_RPC_URL,
  });
}

function printAgent(c: TsuguClient, agent: Agent, balanceWei?: bigint) {
  const handle = pc.bold(pc.cyan(`${agent.name}@tsugu`));
  console.log("");
  console.log(`  ${handle}`);
  console.log(`  ${pc.dim("token")}    #${agent.tokenId}`);
  console.log(`  ${pc.dim("wallet")}   ${agent.account}`);
  console.log(`  ${pc.dim("owner")}    ${agent.owner}`);
  if (balanceWei !== undefined) {
    console.log(`  ${pc.dim("balance")}  ${formatStt(balanceWei)} STT`);
  }
  console.log(`  ${pc.dim("explorer")} ${c.explorer("address", agent.account)}`);
  console.log("");
}

function formatStt(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

program
  .command("create")
  .description("Create a new agent: name + ERC-6551 wallet, registered on-chain")
  .argument("<name>", "agent name (a-z, 0-9, hyphen; 1-32 chars)")
  .option("-s, --seed <stt>", "STT to seed the new agent wallet with", "0.02")
  .option("-o, --owner <address>", "owner address (defaults to your wallet)")
  .action(async (name: string, opts: { seed: string; owner?: `0x${string}` }) => {
    const c = client(true);
    const available = await c.isAvailable(name);
    if (!available) {
      console.error(pc.red(`✗ ${name}@tsugu is already taken.`));
      process.exit(1);
    }
    console.log(pc.dim(`Creating ${name}@tsugu on Somnia Shannon...`));
    try {
      const agent = await c.createAgent(name, { seedStt: opts.seed, owner: opts.owner });
      const balance = await c.getBalance(agent.account);
      console.log(pc.green(`✓ ${name}@tsugu is live.`));
      printAgent(c, agent, balance);
      console.log(`  ${pc.dim("register tx")} ${c.explorer("tx", agent.txHash)}`);
      console.log("");
    } catch (err) {
      console.error(pc.red("✗ create failed:"), (err as Error).message);
      process.exit(1);
    }
  });

program
  .command("resolve")
  .description("Resolve a name to its agent (no key needed)")
  .argument("<name>", "agent name to look up")
  .action(async (name: string) => {
    const c = client(false);
    try {
      const agent = await c.resolve(name);
      const balance = await c.getBalance(agent.account);
      printAgent(c, agent, balance);
    } catch {
      console.error(pc.yellow(`${name}@tsugu is not registered.`));
      process.exit(1);
    }
  });

program
  .command("available")
  .description("Check whether a name is still free")
  .argument("<name>", "agent name to check")
  .action(async (name: string) => {
    const c = client(false);
    const free = await c.isAvailable(name);
    console.log(
      free
        ? pc.green(`✓ ${name}@tsugu is available`)
        : pc.red(`✗ ${name}@tsugu is taken`),
    );
  });

program
  .command("whoami")
  .description("Show the address of your configured signer key")
  .action(() => {
    const c = client(true);
    console.log(c.signerAddress);
  });

program.parseAsync(process.argv);
