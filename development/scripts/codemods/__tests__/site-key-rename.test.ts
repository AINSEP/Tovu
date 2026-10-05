import assert from "node:assert/strict";
import test from "node:test";
import { Project } from "ts-morph";
import { fixSiteKeyImports, renamedSiteKeyIdentifier, renameSiteKeyDeclarations } from "../site-key-rename.js";

test("C0: collision abort leaves the original declaration and its references unchanged", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/input.ts", "export const rootKey = 1; export const siteKey = 2; const read = rootKey;");
  const before = file.getFullText();
  assert.equal(renameSiteKeyDeclarations({ project, files: [file] })[0].result, "collision");
  assert.equal(file.getFullText(), before);
});

test("C0: analytics seed and onboarding access tokens keep their separate meanings", () => {
  assert.equal(renamedSiteKeyIdentifier({ name: "ANALYTICS_ROOT_KEY_SEED" }), "ANALYTICS_ROOT_KEY_SEED");
  assert.equal(renamedSiteKeyIdentifier({ name: "AdminCreatedSiteTokens" }), "AdminCreatedSiteAgentPluginTokens");
});

test("C0: a reference outside --files aborts the entire symbol rename", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/input.ts", "export const rootKey = 1;");
  const other = project.createSourceFile("/other.ts", "import { rootKey } from './input'; console.log(rootKey);");
  assert.equal(renameSiteKeyDeclarations({ project, files: [file] })[0].result, "out-of-scope");
  assert.equal(file.getFullText(), "export const rootKey = 1;");
  assert.match(other.getFullText(), /rootKey/);
});

test("C0: an object property does not collide with a local variable in its containing block", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/input.ts", "function read() { const rootKey = 1; return { siteKey: rootKey }; }");
  const rows = renameSiteKeyDeclarations({ project, files: [file] });
  assert.equal(rows.find(row => row.before === "rootKey")?.result, "rename");
  assert.match(file.getFullText(), /const siteKey = 1/);
});

test("C0: a property access is a reference rather than a declaration in the function's scope", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/input.ts", "interface Input { siteKey: string } function read(input: Input) { const rootKey = input.siteKey; return rootKey; }");
  assert.equal(renameSiteKeyDeclarations({ project, files: [file] }).find(row => row.before === "rootKey")?.result, "rename");
  assert.match(file.getFullText(), /const siteKey = input.siteKey/);
});

test("C0: scoped references change while comments and string values stay byte-identical", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/input.ts", "export const rootKey = 'rootKey'; // rootKey\n");
  const other = project.createSourceFile("/other.ts", "import { rootKey } from './input'; console.log(rootKey);");
  assert.equal(renameSiteKeyDeclarations({ project, files: [file, other] }, { declarationFiles: [file] })[0].result, "rename");
  assert.match(file.getFullText(), /siteKey = 'rootKey'; \/\/ rootKey/);
  assert.match(other.getFullText(), /import \{ siteKey \}/);
});

test("C0: plain-mv import repair changes only the exact moved module", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/src/consumer.ts", "import './site-token.js'; export * from './site-token.js'; const load = import('./site-token.js'); import './static-site-token.js';");
  fixSiteKeyImports({ files: [file], moves: { "/src/site-token.ts": "/src/site-key.ts" } });
  assert.equal(file.getFullText().match(/\.\/site-key\.js/g)?.length, 3);
  assert.match(file.getFullText(), /static-site-token/);
});
