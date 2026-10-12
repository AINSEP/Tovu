import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { GOLDEN_PATH, boundaryTranscript, cascadeTranscript, legacyParityFixture, loadParityModules, readTranscript, writeTranscript, type Transcript } from "./parity-harness.js";

/**
 * @file One-time golden capture (DBMERGE-PLAN §2b step 1), NOT a test. Runs the parity transcripts
 * through the PRE-vault stores and repos on the pre-0012 schema and writes the normalized result.
 *
 *   git archive 57291a25b apps/website/src | tar -x -C .local-artifacts/parity-baseline
 *   TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json npx tsx \
 *     apps/website/src/platform/db/__tests__/parity/capture-vault-golden.ts .local-artifacts/parity-baseline/apps/website/src
 *   rm -rf .local-artifacts/parity-baseline
 *
 * 57291a25b is the parent of the vault commit 9b20083b6. Both dialects must agree before anything is
 * written, so the golden is dialect-free.
 */
const root = process.argv[2];
if (!root) throw new Error("usage: capture-vault-golden.ts <pre-vault apps/website/src root>");
const mods = await loadParityModules(resolve(root));
const captured: Record<string, Transcript> = {};
for (const dialect of ["sqlite", "pglite"] as const) {
  const read = await legacyParityFixture(dialect);
  try {
    captured[`read:${dialect}`] = await readTranscript(mods, read);
  } finally { await read.kernel.close(); }
  const write = await legacyParityFixture(dialect);
  try {
    captured[`write:${dialect}`] = await writeTranscript(mods, write);
  } finally { await write.kernel.close(); }
  const cascade = await legacyParityFixture(dialect);
  try {
    captured[`cascade:${dialect}`] = await cascadeTranscript(mods, cascade);
  } finally { await cascade.kernel.close(); }
}
for (const kind of ["read", "write", "cascade"]) {
  const [lite, pg] = [captured[`${kind}:sqlite`], captured[`${kind}:pglite`]];
  const differing = Object.keys(lite).filter(key => !isDeepStrictEqual(lite[key], pg[key]));
  for (const key of differing) console.error(key, JSON.stringify(lite[key]), "\n  pglite:", JSON.stringify(pg[key]));
  if (differing.length > 0) throw new Error(`pre-vault ${kind} transcript differs between sqlite and pglite: ${differing.join(", ")}`);
}
const boundaryFixture = await legacyParityFixture("sqlite");
let boundary: Record<string, unknown>;
try { boundary = await boundaryTranscript(mods, boundaryFixture); } finally { await boundaryFixture.kernel.close(); }
mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
writeFileSync(GOLDEN_PATH, `${JSON.stringify({ baseline: "57291a25b", read: captured["read:sqlite"], write: captured["write:sqlite"],
  cascade: captured["cascade:sqlite"], boundary }, null, 2)}\n`);
console.log(`wrote ${GOLDEN_PATH}`);
