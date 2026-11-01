/** Regression coverage for both dependency trees that ship the jini-mcp executable. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  assert.equal(manifest.dependencies['@jini-ai/integrations'], '^0.6.15');
});
