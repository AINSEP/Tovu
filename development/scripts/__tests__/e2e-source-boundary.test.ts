import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

test("the e2e TypeScript program does not pull in admin app source", () => {
  const configPath = path.join(REPO_ROOT, "development/tsconfig.e2e.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  assert.deepEqual(parsed.errors, []);
  assert.ok(parsed.fileNames.length > 0, "the e2e config must discover specs");

  // Use TypeScript's actual resolved graph: type-only and transitive imports count too.
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const adminRoot = path.join(REPO_ROOT, "apps/admin/src") + path.sep;
  const adminSources = program.getSourceFiles()
    .map(source => path.resolve(source.fileName))
    .filter(filename => filename.startsWith(adminRoot))
    .map(filename => path.relative(REPO_ROOT, filename))
    .sort();

  assert.deepEqual(adminSources, [], "e2e specs must consume fixtures or contracts without importing admin app source");
});
