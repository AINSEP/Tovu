import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The installed `@jini-ai/core` version, for the `__JINI_CORE_VERSION__` define that every admin
 * "Copy details" block reports (owner rule: an error report names the app and Jini versions).
 * Read from the package's own package.json on disk — its `exports` map hides `./package.json` — in
 * the admin's own node_modules first, then the hoisted root one. Shared by `vite.config.ts` and
 * `vitest.config.ts` so build and tests cannot disagree.
 * @complexity O(1): at most two file reads at config load.
 */
export function readJiniCoreVersion({ adminDir }: { adminDir: string }, _optional: Record<string, never> = {}): string {
  for (const root of [adminDir, path.resolve(adminDir, "../..")]) {
    const file = path.join(root, "node_modules/@jini-ai/core/package.json");
    if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
  }
  return "unknown";
}
