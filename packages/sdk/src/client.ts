import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  getAddress,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { shannon } from "./chain.js";
import { deployments } from "./addresses.js";
import { agentRegistryAbi, agentNftAbi } from "./abis.js";

export interface Agent {
  name: string;
  tokenId: bigint;
  /** ERC-6551 token-bound wallet. */
  account: Address;
  /** Live owner of the AgentNFT (controls the wallet). */
  owner: Address;
  createdAt: number;
}

export interface AsomClientOptions {
  /** Chain id. Defaults to Shannon (50312). */
  chainId?: number;
  /** RPC URL override. Defaults to the chain's public RPC. */
  rpcUrl?: string;
  /** 0x-prefixed private key. Required only for write operations. */
  privateKey?: `0x${string}`;
}

const SHANNON_ID = 50312;

/**
 * AsomClient — the programmatic entry point to asom.
 *
 * Read methods (resolve, isAvailable, getBalance) need no key.
 * Write methods (createAgent) require `privateKey`.
 */
export class AsomClient {
  readonly chainId: number;
  readonly addresses: (typeof deployments)[number];
  private readonly publicClient: PublicClient;
  private readonly account?: Account;
  private readonly walletClient?: WalletClient;

  constructor(opts: AsomClientOptions = {}) {
    this.chainId = opts.chainId ?? SHANNON_ID;
    const addresses = deployments[this.chainId];
    if (!addresses) {
      throw new Error(`asom: no deployment known for chain ${this.chainId}`);
    }
    this.addresses = addresses;

    const transport = http(opts.rpcUrl);
    this.publicClient = createPublicClient({ chain: shannon, transport });

    if (opts.privateKey) {
      this.account = privateKeyToAccount(opts.privateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: shannon,
        transport,
      });
    }
  }

  /** Address of the signer, if a private key was provided. */
  get signerAddress(): Address | undefined {
    return this.account?.address;
  }

  /** Resolve `<name>` to its agent. Throws if unregistered. */
  async resolve(name: string): Promise<Agent> {
    const [tokenId, account, owner, createdAt] =
      await this.publicClient.readContract({
        address: this.addresses.agentRegistry,
        abi: agentRegistryAbi,
        functionName: "resolve",
        args: [name],
      });
    return {
      name,
      tokenId,
      account: getAddress(account),
      owner: getAddress(owner),
      createdAt: Number(createdAt),
    };
  }

  /** True if `<name>` is still available to register. */
  async isAvailable(name: string): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "isAvailable",
      args: [name],
    });
  }

  /** Native STT balance of any address (e.g. an agent wallet), in wei. */
  async getBalance(address: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address: getAddress(address) });
  }

  /**
   * Create an agent: mint the NFT, deploy its ERC-6551 wallet, register the name.
   * @param name   the agent name (validated on-chain: a-z, 0-9, hyphen; 1-32 chars)
   * @param opts.owner  who receives the agent NFT (defaults to the signer)
   * @param opts.seedStt  STT to seed the new wallet with, as a decimal string (e.g. "0.05")
   * @returns the created agent plus the registration tx hash
   */
  async createAgent(
    name: string,
    opts: { owner?: Address; seedStt?: string } = {},
  ): Promise<Agent & { txHash: Hash }> {
    if (!this.walletClient || !this.account) {
      throw new Error("asom: createAgent requires a privateKey");
    }
    const owner = opts.owner ? getAddress(opts.owner) : this.account.address;
    const value = opts.seedStt ? parseEther(opts.seedStt) : 0n;

    // Shannon's gas estimator undercounts hard; pin a generous explicit limit.
    const hash = await this.walletClient.writeContract({
      address: this.addresses.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "register",
      args: [name, owner],
      value,
      gas: 5_000_000n,
      account: this.account,
      chain: shannon,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    const agent = await this.resolve(name);
    return { ...agent, txHash: hash };
  }

  /** Explorer URL for an address or tx hash. */
  explorer(kind: "address" | "tx", value: string): string {
    return `${shannon.blockExplorers.default.url}/${kind}/${value}`;
  }
}
