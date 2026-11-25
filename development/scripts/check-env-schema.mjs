#!/usr/bin/env node
/**
 * @file `npm run check:env` — every env read in shipped website and desktop source must be a name
 * the boot env schema (`apps/website/src/server/runtime/configuration/env-schema.ts`) declares.
 *
 * Reads only source text and the schema's declared names; it never reads or prints env values.
 * `.env.example` is documentation, not enforcement, so it is not consulted.
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
  let total = 0;
  for (const { root, declared } of roots) {
    const { undeclared } = checkEnvReads({ ts, files: shippedFiles({ repoRoot, root }), declared });
    for (const read of undeclared) console.error(`${read.file}:${read.line}  ${read.name}  (${read.source})`);
    total += undeclared.length;
  }
  console.error(total === 0 ? "check:env: every env read is declared." : `check:env: ${total} undeclared env read(s).`);
  process.exitCode = total === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
