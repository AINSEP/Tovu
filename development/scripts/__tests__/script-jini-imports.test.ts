import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * @file Every named import a development launcher takes from `@jini-ai/*` must exist in the installed package.
 * The launchers are plain `.mjs`, so `tsc` never reads them: when Jini moved `collectProcessTreePids` from
 * `@jini-ai/platform/process` to `@jini-ai/core/contracts/runtime`, `npm run dev` failed at startup with
 * "does not provide an export named" and nothing else in the gate noticed.
 */

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'](@jini-ai\/[^"']+)["']/g;

function jiniImports({ file }: { file: string }, _options = {}): { specifier: string; names: string[] }[] {
  const source = readFileSync(path.join(SCRIPTS, file), "utf8");
  return [...source.matchAll(IMPORT)].map((match) => ({
    specifier: match[2]!,
    names: match[1]!.split(",").map((part) => part.trim().split(/\s+as\s+/)[0]!.trim()).filter((name) => name.length > 0 && !name.startsWith("type ")),
  }));
}

for (const file of readdirSync(SCRIPTS).filter((name) => name.endsWith(".mjs"))) {
  for (const { specifier, names } of jiniImports({ file })) {
    test(`${file} imports only names that ${specifier} exports`, async () => {
      const exported = await import(specifier);
      const missing = names.filter((name) => !(name in exported));
      assert.deepEqual(missing, [], `${specifier} does not export: ${missing.join(", ")}`);
    });
  }
}
