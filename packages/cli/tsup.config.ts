import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

// Inject the package version at build time so the CLI's `--version` can never
// drift from package.json. In dev (tsx/vitest) the define is absent and index.ts
// falls back gracefully.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  define: { __ASOM_CLI_VERSION__: JSON.stringify(pkg.version) },
});
