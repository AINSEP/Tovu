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
 *
 * 2026-09-06 — the scan matches an import SPECIFIER, not the bare string. It previously grepped for
 * `transport.fetch` anywhere in a file, which is not what this file's own doc above describes and
 * not what the boundary is: it fired on two files that merely NAME the module in JSDoc prose
 * (`types.ts` explaining why `bodyBytes` exists, `features/media-import/fetch-image.ts` explaining
 * that it deliberately does NOT reach past the port), neither of which imports anything. The same
 * naive-scan-versus-prose failure this repo has hit before. Recall against a real bypass is
 * unchanged, because every form of one — `import ... from "..."`, `export * from "..."`,
 * `await import("...")`, `require("...")` — necessarily writes the module path inside quotes, which
 * is exactly what {@link SPECIFIER_PATTERN} matches; only unquoted mentions (prose, and this file's
 * own doc) stop counting.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");

/**
 * Files allowed to import `transport.fetch` directly, relative to the repo root.
 * The composition root (`server/app.ts`/`server/deps.ts`) goes through
 * `client.ts`'s `createDefaultHttpClient` instead of importing the raw transport itself.
 */
const ALLOWED_IMPORTERS = new Set(["apps/website/src/platform/http/client.ts"]);

/** `transport.fetch` appearing inside a quoted module specifier — the only shape that can actually
 *  bind the module. See this file's header for why the bare-string scan this replaced was wrong. */
const SPECIFIER_PATTERN = "['\"][^'\"]*transport\\.fetch";

test("transport.fetch is not imported outside src/platform/http or the composition root", () => {
  const grepOutput = execFileSync(
    "grep",
    ["-rlE", "--include=*.ts", SPECIFIER_PATTERN, join(repoRoot, "apps", "website", "src")],
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
