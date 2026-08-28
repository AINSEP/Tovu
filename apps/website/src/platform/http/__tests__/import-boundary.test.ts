import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * @file Import-boundary canary (ADR-038 amendment 3, ADR-PIPE-015 T009).
 *
 * `transport.fetch.ts` is the module-private raw transport a guarded `HttpClientPort` wraps.
 * Nothing outside `src/platform/http/` itself or the named composition-root files may import it directly
 * — doing so would let a consumer bypass `createHttpClient`'s policy enforcement entirely. This
 * test greps the whole source tree for the import and fails if it turns up anywhere else.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");

/**
 * Files allowed to import `transport.fetch` directly, relative to the repo root.
 * The composition root (`server/app.ts`/`server/deps.ts`) goes through
 * `client.ts`'s `createDefaultHttpClient` instead of importing the raw transport itself.
 */
const ALLOWED_IMPORTERS = new Set(["apps/website/src/platform/http/client.ts"]);

test("transport.fetch is not imported outside src/platform/http or the composition root", () => {
  const grepOutput = execFileSync(
    "grep",
    ["-rl", "--include=*.ts", "transport.fetch", join(repoRoot, "apps", "website", "src")],
    { encoding: "utf8" }
  ).trim();

  const matches = grepOutput.length === 0 ? [] : grepOutput.split("\n");
  const violations = matches
    .map((absolutePath) => relative(repoRoot, absolutePath))
    .filter((relativePath) => !relativePath.endsWith(".test.ts"))
    .filter((relativePath) => !ALLOWED_IMPORTERS.has(relativePath));

  assert.deepEqual(
    violations,
    [],
    `transport.fetch imported outside the allowed composition-root files: ${violations.join(", ")}`
  );
});
