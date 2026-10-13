import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @file One-time golden capture for `commerce-strip-parity.test.ts`, NOT a test. Records what the
 * PRE-strip tree (4570fce9d, the parent of the 0011 commit 57291a25b) reported for the transfer
 * catalog (tables and columns, in copy order) and the manifest's per-column classification.
 *
 *   mkdir -p .local-artifacts/commerce-baseline
 *   git archive 4570fce9d apps/website/src/platform/db apps/website/src/features/database-transfer | tar -x -C .local-artifacts/commerce-baseline
 *   TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json npx tsx \
 *     apps/website/src/server/inbound/public-http/routes/site/__tests__/capture-commerce-strip-golden.ts .local-artifacts/commerce-baseline/apps/website/src
 *   rm -rf .local-artifacts/commerce-baseline
 *
 * The baseline sits inside the repo so its bare imports (drizzle-orm, @jini-ai/*) resolve.
 */
const root = process.argv[2];
if (!root) throw new Error("usage: capture-commerce-strip-golden.ts <pre-strip apps/website/src root>");
const load = (path: string) => import(pathToFileURL(join(resolve(root), path)).href);
const catalog = await load("features/database-transfer/table-catalog.ts");
const manifest = await load("platform/db/migration/manifest.ts");

const transfer: Record<string, string[]> = {};
for (const table of catalog.collectTransferTables() as { name: string; columns: { name: string }[] }[]) {
  transfer[table.name] = table.columns.map(column => column.name);
}
/** `kind`, plus `growthClass` for reviewed ids; the rationale prose is not part of the class. */
const classes: Record<string, Record<string, string>> = {};
for (const column of manifest.classifyAllCoreColumns() as { sqlTableName: string; sqlColumnName: string; columnClass: { kind: string; growthClass?: string } }[]) {
  const { kind, growthClass } = column.columnClass;
  (classes[column.sqlTableName] ??= {})[column.sqlColumnName] = growthClass ? `${kind}:${growthClass}` : kind;
}
const lines = (record: Record<string, unknown>) => Object.entries(record).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n");
const out = join(import.meta.dirname, "__fixtures__/commerce-strip-parity.golden.json");
writeFileSync(out, `{\n  "baseline": "4570fce9d",\n  "transfer": {\n${lines(transfer)}\n  },\n  "classes": {\n${lines(classes)}\n  }\n}\n`);
console.log(`wrote ${out}`);
