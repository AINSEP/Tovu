import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as childProcess from "node:child_process";
import path from "node:path";
import * as morph from "ts-morph";

// Exercise the real CLI entry points. Only filesystem/process boundaries are faked;
// lexing, classification, graph traversal, formatting and TS reference resolution stay real.
// Node's CommonJS mock bridge adds named exports to the default export; give it writable copies.
test("rigor CLI preserves tags, runner selection and cyclic source-to-test mapping", async (t) => {
  const files = new Map([
    ["apps/website/src/value.ts", "import './relay.js'; export const value = 1;"],
    ["apps/website/src/relay.ts", "import './value.js'; export const relay = 1;"],
    ["apps/website/src/value.test.ts", [
      "import { value } from './value.js';",
      "import { strictEqual } from 'node:assert';",
      "// test('comment', () => {});",
      "const text = `test('template', () => {}) ${value}`;",
      "const pattern = /[/*]test/; const quote = 'it(\\\'text\\\')';",
      "test('result', () => { strictEqual(value, 1); });",
      "test('empty', () => {});",
      "test('calls', () => { expect(spy).toHaveBeenCalled(); });",
      "test('focus', () => { element.focus(); sleep(10); expect(output).toContain('ok'); });",
      "test.skip('later', () => {});",
      "test.each([1])('table', () => { assert.equal(true, true); });",
      "vi.mock('./value.js');",
    ].join("\n")],
    ["apps/admin/src/value.test.ts", "test('admin', () => { expect(1).toBe(1); });"],
    ["apps/desktop/src/renderer/value.test.ts", "test('desktop', () => { assert.equal(1, 1); });"],
    ["development/e2e/value.spec.ts", "test('browser', () => { expect(1).toBe(1); });"],
    ["development/playwright.fixture.config.ts", "export default { testMatch: /value\\.spec\\.ts/ };"],
    ["apps/site-chat/src/value.test.ts", "test('chat', () => { assert.equal(1, 1); });"],
  ]);
  const head = "a".repeat(40);
  const writes = new Map<string, string>();
  t.mock.module("node:child_process", { defaultExport: { ...childProcess }, namedExports: { ...childProcess, execFileSync: (_bin: string, args: string[], options: { input?: string }) => {
    if (args[0] === "rev-parse") return args[1] === "HEAD" ? head : "/fixture";
    if (args[0] === "ls-tree") return [...files.keys()].join("\n");
    if (args[0] === "log") return `${head}\n1\t0\tapps/website/src/value.ts\n`;
    if (args[0] === "cat-file") return Buffer.concat(options.input!.trimEnd().split("\n").map((entry) => {
      const source = files.get(entry.slice(5))!;
      return Buffer.from(`blob-id blob ${Buffer.byteLength(source)}\n${source}\n`);
    }));
    throw new Error(`unexpected git operation: ${args[0]}`);
  } } });
  t.mock.module("node:fs", { defaultExport: { ...fs }, namedExports: { ...fs, mkdirSync: () => undefined,
    writeFileSync: (file: string, data: string) => { writes.set(path.basename(file), data); } } });
  t.mock.method(process.stdout, "write", () => true);
  const argv = process.argv;
  process.argv = [argv[0], "test-rigor-inventory.mjs", "--out", "/fixture/out"];
  t.after(() => { process.argv = argv; });
  await import("../../test-rigor-inventory.mjs");

  const inventory = JSON.parse(writes.get("test-files.json")!);
  const record = inventory.files.find((file: { path: string }) => file.path === "apps/website/src/value.test.ts");
  assert.equal(record.testCountEstimate, 6);
  assert.equal(record.eachBlocks, 1);
  assert.equal(record.assertionCount, 4);
  assert.deepEqual(Object.fromEntries(Object.entries(record.tags).map(([tag, hits]) =>
    [tag, (hits as { line: number }[]).map((hit) => hit.line)])), {
    "no-assert": [7], "mock-call-only": [8], "weak-matcher": [9, 11],
    "skip/only/todo": [10], "synthetic-input": [9], timing: [9], "self-mock": [12],
  });
  assert.deepEqual(inventory.files.map((file: { runner: string }) => file.runner),
    ["vitest", "desktop-node-tsx", "root-node", "root-node", "playwright"]);
  const changed = JSON.parse(writes.get("changed-sources.json")!);
  assert.deepEqual(changed.files[0].directTests, ["apps/website/src/value.test.ts"]);
  assert.equal(changed.files[0].reachableTestCount, 1);
  assert.deepEqual(changed.files[0].transitiveTests, []);
  const mutation = JSON.parse(writes.get("shards-mutation.json")!);
  assert.deepEqual(mutation.shards[0].tests.map((file: { path: string }) => file.path), ["apps/website/src/value.test.ts"]);
  assert.match(writes.get("SUMMARY.md")!, /## Unmapped changed sources \(0\)/);
});

test("write-path CLI resolves table mutations, bare/property callers and unresolved ports", async (t) => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const project = new morph.Project({ useInMemoryFileSystem: true,
    compilerOptions: { module: morph.ModuleKind.NodeNext, moduleResolution: morph.ModuleResolutionKind.NodeNext } });
  project.createSourceFile(path.join(root, "src/platform/db/schema.sqlite.ts"),
    "function sqliteTable(name: string) { return { name }; } export const posts = sqliteTable('posts');");
  project.createSourceFile(path.join(root, "src/writes.ts"), [
    "import { posts } from './platform/db/schema.sqlite.js';",
    "declare const db: any; declare function executeCommand(value: unknown): void;",
    "export interface DraftPort { save(): void; getDraft(): void; }",
    "export interface MissingRepo { save(): void; getDraft(): void; }",
    "export class Drafts implements DraftPort { save() { db.insert(posts); } getDraft() {} }",
    "export function write(repo: DraftPort) { executeCommand(() => repo.save()); }",
    "export function bare() { return write(new Drafts()); }",
    "export const arrow = () => db.update(posts);",
    "export const expression = function () { db.delete(posts); };",
    "db.select().from(posts);",
  ].join("\n"));
  t.mock.module("ts-morph", { defaultExport: { ...morph }, namedExports: { ...morph, Project: function () { return project; } } });
  const printed: string[] = [];
  t.mock.method(console, "log", (message: string) => { printed.push(message); });
  const argv = process.argv;
  process.argv = [argv[0], "write-path-inventory.ts", "--json"];
  t.after(() => { process.argv = argv; });
  await import("../../write-path-inventory.js");
  const rows = JSON.parse(printed.join("\n"));
  assert.deepEqual(rows.filter((row: { source: string }) => row.source === "table").map(
    ({ contractMethod, caller, coverageClass }: Record<string, string>) => ({ contractMethod, caller, coverageClass })), [
    { contractMethod: "posts via db.insert", caller: "Drafts.save", coverageClass: "executeCommand" },
    { contractMethod: "posts via db.update", caller: "arrow", coverageClass: "none" },
    { contractMethod: "posts via db.delete", caller: "expression", coverageClass: "none" },
  ]);
  assert.deepEqual(rows.filter((row: { source: string }) => row.source === "port").map(
    ({ contractMethod, caller, coverageClass }: Record<string, string>) => ({ contractMethod, caller, coverageClass })), [
    { contractMethod: "MissingRepo.save", caller: "(no implementation found in project)", coverageClass: "unknown" },
    { contractMethod: "DraftPort.save", caller: "write", coverageClass: "executeCommand" },
  ]);
});

test("theme CLI lists catalog and installed themes with optional lineage", async (t) => {
  const root = process.env.TOVU_THEMES_DIR ?? path.resolve(process.cwd(), "content/themes");
  const folders = new Map([
    [path.join(root, "__original-themes__/static"), ["basic"]],
    [path.join(root, "static"), ["copy", "plain", "missing"]],
  ]);
  const manifests = new Map([
    [path.join(root, "static/copy/theme.json"), '{"lineage":{"from":"basic"}}'],
    [path.join(root, "static/plain/theme.json"), '{}'],
  ]);
  t.mock.module("node:fs", { defaultExport: { ...fs }, namedExports: { ...fs,
    existsSync: (file: string) => folders.has(file) || manifests.has(file),
    readdirSync: (file: string) => { assert.ok(folders.has(file)); return folders.get(file); },
    readFileSync: (file: string) => { assert.ok(manifests.has(file)); return manifests.get(file); },
  } });
  t.mock.module("../../../../apps/website/src/features/theme/theme.js", { namedExports: {
    nextAvailableThemeId: () => { throw new Error("list must not allocate a theme"); },
  } });
  const printed: string[] = [];
  t.mock.method(console, "log", (message: string) => { printed.push(message); });
  const argv = process.argv;
  process.argv = [argv[0], "theme-tool.ts", "list"];
  t.after(() => { process.argv = argv; });
  await import("../../theme-tool.js");
  assert.deepEqual(printed, ["catalog (__original-themes__/ — pristine, read-only):", "  static/basic",
    "\ninstalled (editable):", "  static/copy  ← copied from 'basic'", "  static/plain", "  static/missing"]);
});
