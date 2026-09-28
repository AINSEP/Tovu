/**
 * @file Direct tests for `dist-import-check.ts`. Real directories throughout: the check walks a real
 * built tree, so every fixture is a small fake `dist/` under a fresh `fs.mkdtempSync` directory.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertDistImportsDeclared, undeclaredDistImports } from "./dist-import-check.ts";

function fakeDist(files: Record<string, string>): { distDir: string; entry: string } {
  const distDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dist-import-check-")));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(distDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(distDir, rel), body);
  }
  return { distDir, entry: path.join(distDir, "src", "cli", "main.js") };
}

const declared = new Set(["express", "@jini-ai/core"]);

test("a dev-only package imported by reachable code is reported with the file that imports it", () => {
  const { distDir, entry } = fakeDist({
    "src/cli/main.js": `import "../boot.js";\n`,
    "src/boot.js": `import { load } from "js-yaml";\nimport express from "express";\n`,
  });
  assert.deepEqual(undeclaredDistImports({ distDir, entry, declared }), ["js-yaml (src/boot.js)"]);
  assert.throws(() => assertDistImportsDeclared({ distDir, entry, declared }), {
    message: /1 package that is not a root `dependencies` entry[\s\S]*js-yaml \(src\/boot\.js\)/,
  });
});

test("builtins, declared packages, subpaths of declared packages and scoped packages pass", () => {
  const { distDir, entry } = fakeDist({
    "src/cli/main.js": [
      `import fs from "node:fs";`,
      `import path from "path";`,
      `import express from "express/lib/router/index.js";`,
      `import { x } from "@jini-ai/core/dist/x.js";`,
    ].join("\n"),
  });
  assert.deepEqual(undeclaredDistImports({ distDir, entry, declared }), []);
  assert.doesNotThrow(() => assertDistImportsDeclared({ distDir, entry, declared }));
});

test("follows #src/ subpath imports, re-exports and literal dynamic imports", () => {
  const { distDir, entry } = fakeDist({
    "src/cli/main.js": `import { a } from "#src/features/a";\nexport * from "./b.js";\nconst c = await import("./c.js");\n`,
    "src/features/a.js": `import "dev-a";\n`,
    "src/cli/b.js": `export { y } from "dev-b";\n`,
    "src/cli/c.js": `const m = await import("dev-c");\n`,
  });
  assert.deepEqual(undeclaredDistImports({ distDir, entry, declared }), [
    "dev-a (src/features/a.js)",
    "dev-b (src/cli/b.js)",
    "dev-c (src/cli/c.js)",
  ]);
});

test("files unreachable from the entry are not checked; comments and a local `require` are not imports", () => {
  const { distDir, entry } = fakeDist({
    "src/cli/main.js": `// import "dev-commented";\n/* import x from "dev-block"; */\nconst require = (c) => c;\nrequire("backup");\nexport const ok = 1;\n`,
    "src/platform/db/drizzle.config.js": `import { defineConfig } from "drizzle-kit";\n`,
  });
  assert.deepEqual(undeclaredDistImports({ distDir, entry, declared }), []);
});

test("a missing relative target is reported rather than silently skipped", () => {
  const { distDir, entry } = fakeDist({ "src/cli/main.js": `import "./gone.js";\n` });
  assert.deepEqual(undeclaredDistImports({ distDir, entry, declared }), ["./gone.js (src/cli/main.js: file not found)"]);
});
