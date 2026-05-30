import { describe, it, expect } from "vitest";
import { AsomClient, shannon, deployments } from "../src/index.js";

const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

describe("AsomClient unit (no chain)", () => {
  it("defaults to Shannon with its known deployment", () => {
    const c = new AsomClient();
    expect(c.chainId).toBe(50312);
    expect(c.addresses.agentRegistry).toBe(deployments[50312].agentRegistry);
  });

  it("builds Shannon explorer URLs", () => {
    const c = new AsomClient();
    expect(c.explorer("tx", "0xabc")).toBe(
      "https://shannon-explorer.somnia.network/tx/0xabc",
    );
    expect(c.explorer("address", "0xdef")).toBe(
      "https://shannon-explorer.somnia.network/address/0xdef",
    );
  });

  it("throws for an unknown chain when no addresses are given", () => {
    const unknown = { ...shannon, id: 999_999 };
    expect(() => new AsomClient({ chain: unknown })).toThrow(/no deployment known/);
  });

  it("accepts an address override for an unknown chain", () => {
    const unknown = { ...shannon, id: 999_999 };
    const addresses = {
      agentRegistry: "0x0000000000000000000000000000000000000001",
      agentNFT: "0x0000000000000000000000000000000000000002",
      erc6551Registry: "0x0000000000000000000000000000000000000003",
      agentAccount: "0x0000000000000000000000000000000000000004",
    } as const;
    const c = new AsomClient({ chain: unknown, addresses });
    expect(c.addresses.agentRegistry).toBe(addresses.agentRegistry);
  });

  it("has no signer address without a private key", () => {
    expect(new AsomClient().signerAddress).toBeUndefined();
  });

  it("derives the signer address from a private key", () => {
    const c = new AsomClient({ privateKey: ANVIL_KEY });
    expect(c.signerAddress).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });
});
