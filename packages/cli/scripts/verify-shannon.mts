/**
 * Live end-to-end verification against Somnia Shannon, exercising the full
 * self-sovereign agent lifecycle on the hardened stack:
 *   create (HD-owned) → fund wallet → exec (agent spends its own funds) → transfer.
 *
 * The agent's owner key starts COLD and is topped up to `opGasBudget()` before each
 * write — mirroring the CLI's ensureOwnerGas — so this run also validates that the
 * gas budget is actually sufficient for exec/transfer at live gas prices.
 *
 * Run: PRIVATE_KEY=0x... tsx scripts/verify-shannon.mts
 */
import { TsuguClient } from "@tsugu/sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatEther, type Address } from "viem";

const RPC = process.env.SHANNON_RPC_URL ?? "https://dream-rpc.somnia.network";
const PK = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!PK) throw new Error("set PRIVATE_KEY");

const operator = new TsuguClient({ privateKey: PK, rpcUrls: [RPC] });
const explorer = (h: string) => operator.explorer("tx", h);

const ownerKey = generatePrivateKey();
const ownerAddr = privateKeyToAccount(ownerKey).address;
const newOwnerKey = generatePrivateKey();
const newOwnerAddr = privateKeyToAccount(newOwnerKey).address;
const recipient = privateKeyToAccount(generatePrivateKey()).address;
const NAME = `qa-${ownerAddr.slice(2, 8).toLowerCase()}`;

const log = (...a: unknown[]) => console.log(...a);
const stt = (w: bigint) => `${formatEther(w)} STT`;

/** Mirror of the CLI's ensureOwnerGas: top a key up to one op's gas budget. */
async function topUpForOp(addr: Address): Promise<void> {
  const budget = await operator.opGasBudget();
  const bal = await operator.getBalance(addr);
  if (bal >= budget) return;
  await operator.sendWei(addr, budget - bal);
}

async function main() {
  log(`\n■ tsugu live verification — ${NAME}@tsugu on Shannon (chain ${operator.chainId})`);
  log(`  operator    ${operator.signerAddress}`);
  log(`  agent owner ${ownerAddr} (self-sovereign HD-style key, starts COLD)`);
  log(`  opGasBudget ${stt(await operator.opGasBudget())} (gasPrice × max pin × 2)`);

  // 1) Create the agent, owned by ownerAddr, wallet seeded with 0.02 STT.
  const beforeOwned = await operator.hasEverOwned(ownerAddr);
  const agent = await operator.createAgent(NAME, { owner: ownerAddr, seedStt: "0.02" });
  log(`\n[1] created ${NAME}@tsugu  ${explorer(agent.txHash)}`);
  log(`    tokenId ${agent.tokenId}  wallet ${agent.account}  owner ${agent.owner}`);
  log(`    wallet balance: ${stt(await operator.getBalance(agent.account))}`);
  log(`    hasEverOwned(owner): ${beforeOwned} → ${await operator.hasEverOwned(ownerAddr)}`);
  if (agent.owner.toLowerCase() !== ownerAddr.toLowerCase()) throw new Error("owner mismatch");

  // 2) The agent acts: spend 0.005 STT from its OWN wallet, signed by its owner key
  //    (which we top up to exactly one gas budget first — proving the budget works).
  await topUpForOp(ownerAddr);
  const owner = new TsuguClient({ privateKey: ownerKey, rpcUrls: [RPC] });
  const recvBefore = await operator.getBalance(recipient);
  const walletBefore = await operator.getBalance(agent.account);
  const x = await owner.agentExecute(agent.account, { to: recipient, value: "0.005" });
  log(`\n[2] agent executed: sent 0.005 STT from its wallet → ${recipient}  ${explorer(x)}`);
  const recvAfter = await operator.getBalance(recipient);
  const walletAfter = await operator.getBalance(agent.account);
  log(`    recipient: ${stt(recvBefore)} → ${stt(recvAfter)}`);
  log(`    wallet:    ${stt(walletBefore)} → ${stt(walletAfter)}`);
  if (recvAfter - recvBefore !== 5_000_000_000_000_000n) throw new Error("recipient did not receive 0.005");
  if (walletBefore - walletAfter !== 5_000_000_000_000_000n) {
    throw new Error("agent wallet was not debited 0.005 — funds did not come from the agent");
  }

  // 3) Non-owner cannot drive the wallet.
  let gated = false;
  try {
    await operator.agentExecute(agent.account, { to: recipient, value: "0.001" });
  } catch {
    gated = true;
  }
  log(`\n[3] non-owner execute rejected: ${gated}`);
  if (!gated) throw new Error("execute was NOT owner-gated!");

  // 4) Transfer the agent; control must follow the NFT.
  await topUpForOp(ownerAddr);
  const t = await owner.transferAgent(NAME, newOwnerAddr);
  const resolved = await operator.resolve(NAME);
  log(`\n[4] transferred ${NAME}@tsugu → ${newOwnerAddr}  ${explorer(t)}`);
  log(`    resolve().owner is now: ${resolved.owner}`);
  log(`    old owner agentCountOf: ${await operator.agentCountOf(ownerAddr)} (live)`);
  log(`    old owner hasEverOwned: ${await operator.hasEverOwned(ownerAddr)} (monotonic — stays true)`);
  if (resolved.owner.toLowerCase() !== newOwnerAddr.toLowerCase()) throw new Error("transfer did not move ownership");

  log(`\n✓ ALL LIVE CHECKS PASSED`);
  log(`\nEVIDENCE (for DEPLOYMENTS.md):`);
  log(`  name=${NAME}@tsugu tokenId=${agent.tokenId} wallet=${agent.account}`);
  log(`  create=${agent.txHash}`);
  log(`  exec=${x}`);
  log(`  transfer=${t}`);
  log(`  finalOwner=${newOwnerAddr}`);
}

main().catch((e) => {
  console.error("\n✗ verification failed:", e);
  process.exit(1);
});
