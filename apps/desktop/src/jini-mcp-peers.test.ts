/** Regression coverage for both dependency trees that ship the jini-mcp executable. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import { createTypeScriptImportReader } from '@jini-ai/devops/packaging/electron/typescript';
import { load } from 'js-yaml';

import { declaredDependencies, findPackageDir, isExcluded } from "./stage-payload-lib.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
import { optionalPeerContractProblems } from '@jini-ai/devops/packaging/electron';

test('every Jini package selected for either packaged consumer classifies optional peers', () => {
  for (const hostDirectory of [REPO_ROOT, path.join(REPO_ROOT, 'apps', 'desktop')]) {
    const problems = packagedJiniDirectories({ hostDirectory }).flatMap(directory => {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
      return optionalPeerContractProblems({ manifest }).map((problem: string) => `${manifest.name}: ${problem}`);
    });
    assert.deepEqual(problems, [], `${hostDirectory}: rebuild/publish/install the Jini manifest contract before release`);
  }
});

test('a default runtime peer cannot be exempted just because it is installed', () => {
  assert.deepEqual(optionalPeerContractProblems({ manifest: {
    peerDependencies: { parser: '*' }, peerDependenciesMeta: { parser: { optional: true } },
  } }), ['unclassified optional peer parser; declare jini.optionalPeers with opt-in feature and user-facing message, or make it required']);
});

test('an explicit opt-in contract is the sole optional-peer exemption', () => {
  assert.deepEqual(optionalPeerContractProblems({ manifest: {
    peerDependencies: { terminal: '*' }, peerDependenciesMeta: { terminal: { optional: true } },
    jini: { optionalPeers: { terminal: 'opt-in: terminal sessions — This feature needs terminal.' } },
  } }), []);
});

/** Exercise staging's edge policy on the fixture without depending on the host install.
 * @complexity O(packages + edges × ancestor depth) filesystem reads; each directory is visited once. */
function packagedJiniDirectories({ hostDirectory }: { hostDirectory: string }): string[] {
  const seen = new Set<string>();
  const queue = [fs.realpathSync(hostDirectory)];
  const jini: string[] = [];
  while (queue.length > 0) {
    const directory = queue.pop()!; // The loop guard proves the queue is nonempty.
    if (seen.has(directory)) continue;
    seen.add(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    if (manifest.name?.startsWith("@jini-ai/")) jini.push(directory);
    for (const dependency of declaredDependencies(directory).filter((name) => !isExcluded(name))) {
      const resolved = findPackageDir(directory, dependency);
      assert.ok(resolved, `${directory} cannot resolve packaged dependency ${dependency}`);
      queue.push(resolved);
    }
  }
  return jini;
}

test("packaged peer discovery follows transitive and required peer edges, but not development or optional peers", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-runtime-peers-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packages = {
    "": { name: "host", dependencies: { carrier: "1" }, devDependencies: { "@jini-ai/dev-only": "1" } },
    "node_modules/carrier": { name: "carrier", dependencies: { "@jini-ai/transitive": "1" } },
    "node_modules/@jini-ai/transitive": { name: "@jini-ai/transitive", peerDependencies: { "@jini-ai/required": "1", "@jini-ai/opt-in": "1" },
      peerDependenciesMeta: { "@jini-ai/opt-in": { optional: true } } },
    "node_modules/@jini-ai/required": { name: "@jini-ai/required", dependencies: { carrier: "1" } },
    "node_modules/@jini-ai/dev-only": { name: "@jini-ai/dev-only" },
    "node_modules/@jini-ai/opt-in": { name: "@jini-ai/opt-in" },
  };
  for (const [relative, manifest] of Object.entries(packages)) {
    const directory = path.join(root, relative);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest));
  }
  // macOS temp paths can enter via /var and resolve through /private/var; compare canonical paths.
  assert.deepEqual(packagedJiniDirectories({ hostDirectory: root }).map((directory) => fs.realpathSync(directory)).sort(),
    ["required", "transitive"].map((name) => fs.realpathSync(path.join(root, "node_modules", "@jini-ai", name))).sort());
});

test('desktop model discovery declares its integrations runtime library', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'apps', 'desktop', 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@jini-ai/integrations'], '^0.6.17');
});

test('the packaged desktop can load its shared agent daemon supervisor without the site payload', () => {
  const directory = path.join(REPO_ROOT, 'apps', 'desktop');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  assert.equal(manifest.dependencies['@jini-ai/sidecar'], '^0.6.17');
  assert.equal(lock.packages[''].dependencies['@jini-ai/sidecar'], manifest.dependencies['@jini-ai/sidecar']);
  assert.equal(lock.packages['node_modules/@jini-ai/sidecar'].version, '0.6.17');
});

/** Source inputs only: build output, tests and fixtures are not shipped runtime modules. */
function runtimeSources({ directory }: { directory: string }, _options = {}): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (/^(node_modules|dist|build|release|staging|coverage|__tests__|__mocks__|__fixtures__|__measurements__|fixtures|test|tests)$/.test(entry.name)) return [];
    if (entry.isDirectory()) return runtimeSources({ directory: file });
    return /\.[cm]?[jt]sx?$/.test(file) && !/\.(test|spec|typecheck|d)\.[cm]?[jt]sx?$/.test(file) ? [file] : [];
  });
}

test('runtime source imports declare their packages instead of relying on hoisting', () => {
  const reader = createTypeScriptImportReader({ compiler: ts });
  // Root workspaces are staged by stage-payload.ts even without dependency entries.
  const workspaces = fs.readdirSync(path.join(REPO_ROOT, 'packages')).map(folder =>
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', folder, 'package.json'), 'utf8')).name);
  const problems: string[] = [];
  // Bundled browser inputs are checked by their bundlers; this checks Node-loaded app source.
  for (const folder of ['apps/website/src', 'apps/desktop/src', 'packages']) for (const file of runtimeSources({ directory: path.join(REPO_ROOT, folder) })) {
    let owner = path.dirname(file);
    while (!fs.existsSync(path.join(owner, 'package.json'))) owner = path.dirname(owner);
    const manifest = JSON.parse(fs.readFileSync(path.join(owner, 'package.json'), 'utf8'));
    // This source-wide guard includes build/test utilities under src; the existing dist/staged
    // guards additionally require production selection for the files actually loaded after staging.
    const declared = new Set(Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies,
      ...manifest.peerDependencies, ...manifest.devDependencies }));
    if (owner === REPO_ROOT) for (const workspace of workspaces) declared.add(workspace);
    for (const specifier of reader.imports({ file, source: fs.readFileSync(file, 'utf8') })) {
      if (/^[.#/]/.test(specifier) || specifier.startsWith('@/') || isBuiltin(specifier)) continue;
      const name = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
      if (!declared.has(name)) problems.push(`${path.relative(REPO_ROOT, file)}: ${name}`);
    }
  }
  assert.equal(problems.join('\n'), '', 'runtime imports must be declared by the package that loads them');
});

test('desktop terminal opt-in enters the required packaged dependency closure with its helper unpacked', () => {
  const desktop = path.join(REPO_ROOT, 'apps/desktop');
  const manifest = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['node-pty'], '^1.1.0', 'an optional daemon peer is not selected for shipping');
  assert.ok(declaredDependencies(desktop).includes('node-pty'));
  const config = load(fs.readFileSync(path.join(desktop, 'electron-builder.yml'), 'utf8')) as {
    asarUnpack: string[];
  };
  assert.ok(config.asarUnpack.includes('**/node-pty/**'), 'PTY helper executables must be real disk files too');
});
