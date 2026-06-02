/**
 * Seed a discoverable agent on Shannon: create an agent (owned by the operator) and
 * advertise real canonical capabilities so the discovery API has something to find.
 * Run: PRIVATE_KEY=0x... tsx scripts/seed-discovery.mts
 */
import { TsuguClient } from "@tsugu/sdk";

const RPC = process.env.SHANNON_RPC_URL ?? "https://dream-rpc.somnia.network";
const PK = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!PK) throw new Error("set PRIVATE_KEY");

const c = new TsuguClient({ privateKey: PK, rpcUrls: [RPC] });

async function main() {
  const suffix = c.signerAddress!.slice(2, 6).toLowerCase();
  const name = `summarizer-${suffix}`;
  const caps = ["llm.summarize", "llm.translate", "oracle.price"];

  let tokenId: bigint;
  try {
    const agent = await c.resolve(name);
    tokenId = agent.tokenId;
    console.log(`reusing ${name}@tsugu (token ${tokenId})`);
  } catch {
    const agent = await c.createAgent(name, { seedStt: "0" }); // owned by operator
    tokenId = agent.tokenId;
    console.log(`created ${name}@tsugu (token ${tokenId}) ${c.explorer("tx", agent.txHash)}`);
  }

  const tx = await c.advertise(tokenId, {
    capabilities: caps,
    serviceURI: "https://example.com/summarizer-manifest.json",
    pricePerCall: "0.005",
  });
  console.log(`advertised [${caps.join(", ")}] ${c.explorer("tx", tx)}`);
  console.log(`providers(llm.summarize): [${(await c.providers("llm.summarize")).map(String).join(", ")}]`);
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
