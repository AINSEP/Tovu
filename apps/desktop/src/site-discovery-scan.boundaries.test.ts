/** F9 (Stryker L15: site-discovery-scan 38.5 % and remove-site-tree 80 %, both with no-coverage
 * ranges): the real `discoverForInput` and the real fs/rm defaults, run against test-owned temp
 * trees only (never the user's home). */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDesktopDiscovery } from './site-discovery-scan.ts';
import { removeSiteTree } from './remove-site-tree.ts';

function tempRoot(t: { after: (fn: () => void) => void }, prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => { makeWritable(root); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
function makeWritable(root: string): void {
  if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) return;
  fs.chmodSync(root, 0o755);
  if (fs.statSync(root).isDirectory()) for (const child of fs.readdirSync(root)) makeWritable(path.join(root, child));
}

test('the real discovery scan of an explicit, empty, specific root finds nothing and does not fail', t => {
  const home = tempRoot(t, 'tovu-discovery-home-');
  const scanRoot = path.join(home, 'work', 'sites');
  fs.mkdirSync(scanRoot, { recursive: true });
  const result = runDesktopDiscovery({ input: { statePath: path.join(home, 'missing-state.json'), scanRoots: [scanRoot], workspaceOptions: { homeDir: home, env: {} } } });
  assert.deepEqual(result, { found: [] });
});

test('the real discovery scan refuses a broad root with the policy message instead of scanning it', t => {
  const home = tempRoot(t, 'tovu-discovery-home-');
  const result = runDesktopDiscovery({ input: { statePath: path.join(home, 'missing-state.json'), scanRoots: ['/'], workspaceOptions: { homeDir: home, env: {} } } });
  assert.deepEqual(result, { error: 'Sites folder is too broad: /. Choose a specific folder containing your Tovu websites.' });
});

// POSIX modes and an unprivileged symlink: not meaningful on Windows.
test('removeSiteTree with the real fs defaults removes a read-only tree, and never chmods through a symlink', { skip: process.platform === 'win32' }, async t => {
  const base = tempRoot(t, 'tovu-remove-tree-');
  const outside = path.join(base, 'outside.txt');
  fs.writeFileSync(outside, 'keep');
  fs.chmodSync(outside, 0o444);
  const root = path.join(base, 'site');
  fs.mkdirSync(path.join(root, 'package'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package', 'mcp.json'), '{}');
  fs.symlinkSync(outside, path.join(root, 'package', 'link'));
  fs.chmodSync(path.join(root, 'package', 'mcp.json'), 0o444);
  fs.chmodSync(path.join(root, 'package'), 0o555);
  await removeSiteTree({ root });
  assert.equal(fs.existsSync(root), false);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
  assert.equal(fs.statSync(outside).mode & 0o777, 0o444, 'the symlink target keeps its mode');
});

test('removeSiteTree of an absent tree is a no-op with the real defaults', async t => {
  const base = tempRoot(t, 'tovu-remove-tree-');
  await removeSiteTree({ root: path.join(base, 'never-created') });
  assert.deepEqual(fs.readdirSync(base), []);
});
