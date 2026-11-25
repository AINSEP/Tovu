#!/usr/bin/env node
/**
 * @file `npm run check:env` — every env read in shipped website and desktop source must be a name
 * the boot env schema (`apps/website/src/server/runtime/configuration/env-schema.ts`) declares.
 *
 * Reads only source text and the schema's declared names; it never reads or prints env values.
 * `.env.example` is documentation, not enforcement, so it is not consulted.
 *
 * Ratchet: reads that predate the schema are listed in `development/env-read-debt.json`, keyed
 * `NAME::file` with a count (names and paths only, never values). A read of a new name, in a new
 * file, or one more read of a listed name in the same file fails. Declare the name in the schema
 * instead. `--update` rewrites the baseline only when it shrinks (or seeds it when the file is
 * absent); it refuses to record new debt.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { collectEnvReads } from "./lib/env-reads.mjs";

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const NOT_SHIPPED = /(^|\/)(node_modules|dist|__tests__|__mocks__|fixtures|__fixtures__|test|tests|e2e)\/|\.(test|spec|stories|test-support)\.|\.d\.(ts|mts|cts)$/;

function topLevelStringConsts({ ts, sourceFile }, _optional = {}) {
  const consts = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const d of statement.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteral(d.initializer)) consts.set(d.name.text, d.initializer.text);
    }
  }
  return consts;
}

/**
 * Compare each file's env reads with the declared names. Dynamic reads count as undeclared: a
 * dynamic reader must name a schema-owned subset instead.
 */
export function checkEnvReads({ ts, files, declared }, _optional = {}) {
  const undeclared = [];
  for (const { path: file, text } of files) {
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const consts = topLevelStringConsts({ ts, sourceFile });
    for (const [name, source, line] of collectEnvReads({ ts, sourceFile, consts })) {
      if (!declared.has(name)) undeclared.push({ name, source, file, line });
    }
  }
  return { ok: undeclared.length === 0, undeclared };
}

function shippedFiles({ repoRoot, root }, _optional = {}) {
  return execFileSync("git", ["-C", repoRoot, "ls-files", root], { encoding: "utf8", maxBuffer: 1 << 26 })
    .split("\n").filter((file) => SOURCE.test(file) && !NOT_SHIPPED.test(file))
    .map((file) => ({ path: file, text: fs.readFileSync(path.join(repoRoot, file), "utf8") }));
}

/** Group undeclared reads into baseline entries keyed `NAME::file`, sorted for stable diffs. */
export function envReadDebt({ undeclared }, _optional = {}) {
  const entries = {};
  for (const { name, file } of undeclared) (entries[`${name}::${file}`] ??= { count: 0 }).count += 1;
  return Object.fromEntries(Object.keys(entries).sort().map((key) => [key, entries[key]]));
}

/** Entries that grew past the baseline (violations) and entries that paid debt down (shrunk). */
export function compareEnvDebt({ baseline, current }, _optional = {}) {
  const violations = [];
  for (const [key, { count }] of Object.entries(current)) {
    const before = baseline[key]?.count ?? 0;
    if (count > before) violations.push({ key, before, now: count });
  }
  const shrunk = Object.keys(baseline).filter((key) => (current[key]?.count ?? 0) < baseline[key].count);
  return { violations, shrunk };
}

const BASELINE = "development/env-read-debt.json";

function readBaseline({ file }, _optional = {}) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")).entries ?? {};
}

function writeBaseline({ file, entries }, _optional = {}) {
  const note = "Env reads that predate the boot env schema. Shrink-only: declare a name in env-schema.ts instead of adding it here. Names and paths only, never values. Rewrite with `npm run check:env -- --update`.";
  fs.writeFileSync(file, `${JSON.stringify({ _comment: note, entries }, null, 2)}\n`);
}

async function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const ts = createRequire(path.join(repoRoot, "package.json"))("typescript");
  // Loading the TypeScript schema needs the tsx loader (`node --import tsx`, as `check:env` runs it).
  const { declaredTovuEnvNames } = await import(pathToFileURL(path.join(repoRoot, "apps/website/src/server/runtime/configuration/env-schema.ts")).href);
  const names = declaredTovuEnvNames({});
  const roots = [
    { root: "apps/website/src", declared: new Set([...names.website, ...names.daemon]) },
    { root: "apps/desktop/src", declared: new Set(names.desktop) },
  ];
  const undeclared = roots.flatMap(({ root, declared }) => checkEnvReads({ ts, files: shippedFiles({ repoRoot, root }), declared }).undeclared);
  const baselineFile = path.join(repoRoot, BASELINE);
  const current = envReadDebt({ undeclared });
  const { violations, shrunk } = compareEnvDebt({ baseline: readBaseline({ file: baselineFile }), current });
  for (const { key, before, now } of violations) {
    const [name, file] = key.split("::");
    console.error(`${file}  ${name}  (undeclared env read: ${now} read(s), baseline allows ${before})`);
  }
  // The one exception to shrink-only: seeding the baseline the first time it does not exist.
  const seeding = !fs.existsSync(baselineFile);
  if (process.argv.includes("--update") && (violations.length === 0 || seeding)) writeBaseline({ file: baselineFile, entries: current });
  else if (shrunk.length > 0) console.error(`check:env: ${shrunk.length} baseline entr${shrunk.length === 1 ? "y" : "ies"} paid down; run \`npm run check:env -- --update\` to shrink ${BASELINE}.`);
  console.error(`check:env: ${undeclared.length} undeclared env read(s) in total; ${violations.length} new beyond the baseline.`);
  if (violations.length > 0) console.error("check:env: declare each new name in apps/website/src/server/runtime/configuration/env-schema.ts; the baseline only shrinks.");
  process.exitCode = violations.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
