/**
 * @file Lists `src/server/**\/*.test.ts` files for one test tier (`unit` or `integration`), using
 * the same `isIntegrationTestFile` classifier `route-coverage-lib.ts` exports — single source of
 * truth for the unit/integration split, rather than duplicating the naming convention as a second,
 * untested `find` pattern embedded in a `package.json` script string where it could silently drift
 * from the documented convention (see `route-coverage-lib.ts`'s own header on `isIntegrationTestFile`
 * for what that convention is).
 *
 * Consumed by `test:cov:server:unit` / `test:cov:server:integration` (package.json) via shell command
 * substitution: `node --test ... $(tsx development/scripts/list-server-test-files.ts unit)`. Prints
 * one repo-relative path per line; the caller is responsible for turning that into `node --test`'s
 * positional file arguments.
 *
 * Usage: npx tsx development/scripts/list-server-test-files.ts <unit|integration>
 */
import { execFileSync } from "node:child_process";
import { REPO_ROOT, isIntegrationTestFile } from "./route-coverage-lib.js";

export function listServerTestFiles(mode: "unit" | "integration"): string[] {
  const raw = execFileSync("find", ["src/server", "-type", "f", "-name", "*.test.ts"], {
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
if (require.main === module) {
  main();
}
