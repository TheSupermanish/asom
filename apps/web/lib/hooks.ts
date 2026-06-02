"use client";

import { useMemo } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { WalletClient } from "viem";
import { TsuguClient } from "@tsugu/sdk";
import { readClient, writeClient } from "./sdk";

/**
 * The tsugu client for the current connection: a write-capable client when a wallet
 * is connected, a read-only client otherwise. `address` is the connected account.
 */
export function useTsugu(): { client: TsuguClient; address?: `0x${string}`; connected: boolean } {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const client = useMemo(() => {
    if (walletClient) return writeClient(walletClient as WalletClient);
    return readClient();
  }, [walletClient]);

  return { client, address, connected: isConnected && !!walletClient };
}
