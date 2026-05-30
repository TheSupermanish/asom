import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests spin up anvil + deploy contracts; give them room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One anvil instance shared across the file — run serially.
    fileParallelism: false,
  },
});
