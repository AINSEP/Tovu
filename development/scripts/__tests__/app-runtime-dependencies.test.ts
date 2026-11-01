/** Guard browser consumers against imports hidden by another package's node_modules. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createTypeScriptImportReader } from "@jini-ai/devops/packaging/electron/typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const importReader = createTypeScriptImportReader({ compiler: ts });

type Manifest = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Read only source inputs, excluding test helpers and erased declaration files. O(entries). */
function runtimeSources({ directory }: { directory: string }, _options = {}): string[] {
  return readdirSync(directory, { recursive: true }).filter(file =>
    /\.[cm]?[jt]sx?$/.test(file) &&
    !/(?:^|\/)(?:__tests__|__mocks__|__fixtures__|tests?|fixtures)(?:\/|$)|\.(?:test|spec|typecheck|d)\.[cm]?[jt]sx?$/.test(file)
  ).map(file => path.join(directory, file));
}

/** Classify bare imports using this consumer's manifest and tsconfig paths, never installation state.
 * O(imports × aliases); no I/O. Dev dependencies deliberately cannot satisfy runtime imports. */
function undeclaredImports({ specifiers, manifest, aliases = [] }: {
  specifiers: string[]; manifest: Manifest; aliases?: string[];
}, _options = {}): string[] {
  const declared = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }));
  return specifiers.filter(specifier => {
    if (/^[./]/.test(specifier) || isBuiltin(specifier)) return false;
    if (aliases.some(alias => alias.endsWith("/*")
      ? specifier.startsWith(alias.slice(0, -1)) : specifier === alias)) return false;
    const bare = specifier.split("?")[0];
    const name = bare.split("/").slice(0, bare.startsWith("@") ? 2 : 1).join("/");
    return !declared.has(name);
  });
}

test("class guard detects static, re-exported and dynamic packages without executing source", () => {
  const source = `
    import { plugin } from '@vendor/plugin/host';
    export { other } from 'other/subpath';
    const load = () => import('dev-only/production');
    import type { Contract } from 'contract';
    type Query = import('type-query-only').Contract;
    // import('comment-is-not-a-dependency');
    const text = "import('string-is-not-a-dependency')";
  `;
  // Reuse the desktop guard's parser: erased types cannot cause a runtime missing-module error.
  const specifiers = importReader.imports({ file: "fixture.tsx", source });
  assert.deepEqual(undeclaredImports({ specifiers, manifest: {
    peerDependencies: { other: "1" },
    devDependencies: { "dev-only": "1" },
  } }), ["@vendor/plugin/host", "dev-only/production"]);
});

test("class guard allows builtins and configured paths, but no namespace-wide exemptions", () => {
  assert.deepEqual(undeclaredImports({
    specifiers: ["node:fs", "path", "./local", "/absolute", "@/lib/api", "@tovu/headless",
      "@tovu/undeclared", "@vendor/library/style.css?inline", "plain?raw"],
    aliases: ["@/*", "@tovu/headless"],
    manifest: { dependencies: { "@vendor/library": "1", plain: "1" } },
  }), ["@tovu/undeclared"]);
});

for (const app of ["admin", "site-chat"]) {
  test(`${app} source imports declare dependencies in their own package`, () => {
    const directory = path.join(repoRoot, "apps", app);
    const manifest: Manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
    const config = JSON.parse(readFileSync(path.join(directory, "tsconfig.json"), "utf8"));
    const aliases = Object.keys(config.compilerOptions.paths ?? {});
    const problems = runtimeSources({ directory: path.join(directory, "src") }).flatMap(file => {
      const specifiers = importReader.imports({ file, source: readFileSync(file, "utf8") });
      return undeclaredImports({ specifiers, manifest, aliases })
        .map(specifier => `${path.relative(repoRoot, file)}: ${specifier}`);
    });
    assert.deepEqual(problems, [], "declare imports in dependencies/peerDependencies; hoisting is not a contract");
  });
}
