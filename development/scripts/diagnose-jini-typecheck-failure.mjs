/**
 * Turns a `tsc` failure in the "typecheck against published @jini-ai/*" CI gate
 * (.github/workflows/jini-published-typecheck.yml) into an actionable diagnosis instead of a wall
 * of raw TypeScript errors.
 *
 * Why this exists: deploy run 34506663942 shipped past a green local typecheck and died 6.5
 * minutes into the Docker build with 102 raw TS errors -- `Module '"@jini-ai/cms/media"' has no
 * exported member 'findMediaByIdOrSlug'` and friends. Tovu's dev `node_modules/@jini-ai/*` are
 * `npm link`-style symlinks into a sibling Jini checkout (see `link-jini.mjs`), often newer than
 * what's actually published, so a developer's own `npm run typecheck` stays green while the
 * registry-only install `Dockerfile:45`'s `npm install` gets fails. A human reading 102 raw errors
 * has to re-derive "this is the Jini publish-drift bug" from scratch; this script recognizes the
 * SIGNATURE those errors carry (a missing export or module from an `@jini-ai/*` package) and prints
 * an explicit banner ahead of the raw log, which is still printed in full underneath for anything
 * this signature doesn't cover.
 *
 * Usage: node diagnose-jini-typecheck-failure.mjs <exit-code> <log-file> [<exit-code> <log-file> ...]
 * Exits 0 only if every exit code passed in is itself 0 (nothing to diagnose); otherwise exits 1
 * after printing the diagnosis (if the signature matched) and the raw logs for every failing pair.
 */
import { readFileSync } from "node:fs";
import { diagnosePublishedTypes } from "@jini-ai/devops/checks/published-types";

function parseArgs(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) {
    console.error("Usage: diagnose-jini-typecheck-failure.mjs <exit-code> <log-file> [<exit-code> <log-file> ...]");
    process.exit(2);
  }
  const pairs = [];
  for (let i = 0; i < argv.length; i += 2) {
    pairs.push({ exitCode: Number(argv[i]), logFile: argv[i + 1] });
  }
  return pairs;
}

function main() {
  const pairs = parseArgs(process.argv.slice(2));
  const failing = pairs.filter((pair) => pair.exitCode !== 0);

  if (failing.length === 0) {
    console.log(
      "[jini-published-typecheck] typecheck passed against the registry-published @jini-ai/* packages.",
    );
    return;
  }

  const logs = failing.map(({ exitCode, logFile }) => {
    let log = "";
    try {
      log = readFileSync(logFile, "utf8");
    } catch {
      // Missing log file (e.g. an earlier step never ran) — nothing to scan, no hits.
    }
    return { projectKey: logFile, exitCode, stdout: log, stderr: "" };
  });
  const hitsByFile = diagnosePublishedTypes({ scope: "@jini-ai", logs }).failures
    .filter((entry) => entry.hits.length > 0)
    .map((entry) => ({ logFile: entry.projectKey, hits: entry.hits }));

  if (hitsByFile.length > 0) {
    console.error("");
    console.error("================================================================================");
    console.error("DIAGNOSIS: local Jini workspace has UNPUBLISHED changes Tovu's source depends on.");
    console.error("================================================================================");
    console.error("");
    console.error("This ran `tsc` against the @jini-ai/* versions actually on the npm registry -- the");
    console.error("same install `Dockerfile:45`'s `npm install` (and any clean `npm ci`) gets. It failed");
    console.error("because Tovu's source references a symbol that exists in someone's local Jini");
    console.error("checkout but was never published. Locally that checkout is usually symlinked into");
    console.error("node_modules/@jini-ai/* (development/scripts/link-jini.mjs), so a developer's own");
    console.error("`npm run typecheck` can stay green while this exact class of build fails downstream.");
    console.error("");
    for (const { logFile, hits } of hitsByFile) {
      console.error(`  ${logFile}:`);
      for (const hit of [...new Set(hits)]) console.error(`    - ${hit}`);
    }
    console.error("");
    console.error("FIX: in Jini, bump the version of the affected package(s) and publish with `pnpm");
    console.error("publish` (never `npm publish`), then bump the matching pin(s) in Tovu's");
    console.error("package.json / apps/admin/package.json.");
    console.error("");
    console.error("Reproduce and iterate locally without disturbing your linked node_modules:");
    console.error("  npm run check:jini-registry-drift");
    console.error("================================================================================");
    console.error("");
  }

  console.error("Raw typecheck output for every failing project follows:");
  for (const { exitCode, logFile } of failing) {
    console.error(`\n----- ${logFile} (exit ${exitCode}) -----`);
    try {
      console.error(readFileSync(logFile, "utf8"));
    } catch (err) {
      console.error(`(could not read ${logFile}: ${err.message})`);
    }
  }

  process.exitCode = 1;
}

main();
