/**
 * @file Lists `apps/website/src/server/**\/*.test.ts` files for one test tier (`unit` or
 * `integration`), using the same `isIntegrationTestFile` classifier `route-coverage-lib.ts` exports —
 * single source of truth for the unit/integration split, rather than duplicating the naming
 * convention as a second, untested `find` pattern embedded in a `package.json` script string where it
 * could silently drift from the documented convention (see `route-coverage-lib.ts`'s own header on
 * `isIntegrationTestFile` for what that convention is).
 *
 * Consumed by `test:cov:server:unit` / `test:cov:server:integration` (package.json) via shell command
 * substitution: `node --test ... $(tsx development/scripts/list-server-test-files.ts unit)`. Prints
 * one repo-relative path per line; the caller is responsible for turning that into `node --test`'s
 * positional file arguments.
 *
 * 2026-09-02: repointed the `find` target from `src/server` to `apps/website/src/server` — the
 * apps/website restructure moved the tree but not this string, so `find` failed with "No such file
 * or directory" (exit 1) and this script printed NOTHING, meaning both `test:cov:server:unit` and
 * `test:cov:server:integration` expanded to an EMPTY file list. See `dead-path-sweep.test.ts`'s
 * former register entry for this file (removed once this fix landed) and its own
 * `list-server-test-files.test.ts`.
 *
 * Usage: npx tsx development/scripts/list-server-test-files.ts <unit|integration>
 */
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { REPO_ROOT, isIntegrationTestFile } from "./route-coverage-lib.js";

export function listServerTestFiles(mode: "unit" | "integration"): string[] {
  const raw = execFileSync("find", ["apps/website/src/server", "-type", "f", "-name", "*.test.ts"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const files = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return files.filter((f) => (mode === "integration" ? isIntegrationTestFile(f) : !isIntegrationTestFile(f)));
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== "unit" && mode !== "integration") {
    console.error("Usage: npx tsx development/scripts/list-server-test-files.ts <unit|integration>");
    process.exit(1);
  }
  for (const f of listServerTestFiles(mode)) console.log(f);
}

// Guarded (see check-route-coverage-diff.ts's identical idiom): importable by a unit test without
// triggering the `find` shell-out / process.exit from a bad argv.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
