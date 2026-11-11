/** F9 (Stryker L15 project-delete-guard 90.6 %, data-loss guard): every refusal of
 * `mayEraseSiteDirectory` broken ONE clause at a time from a fully valid created row (AP8):
 * provenance, repo root, the recorded id, the on-disk identity, and containment. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mayEraseSiteDirectory, readSiteIdentity } from './project-delete-guard.ts';

function layout(t: { after: (fn: () => void) => void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-delete-guard-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repoRoot = path.join(base, 'repo');
  const siteDir = path.join(base, 'site');
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, '.site-meta.json'), JSON.stringify({ siteId: 'site-a' }));
  return { base, repoRoot, siteDir, row: { origin: 'created', siteDir, siteId: 'site-a' } };
}

test('the fully valid created row outside the repo may be erased (the allow case every refusal below breaks once)', t => {
  const { row, repoRoot } = layout(t);
  assert.equal(mayEraseSiteDirectory(row, { repoRoot }), true);
});

test('provenance: only origin "created" — adopted, unknown, missing, or no row at all is refused', t => {
  const { row, repoRoot } = layout(t);
  for (const origin of ['adopted', 'Created', '', undefined, 1]) assert.equal(mayEraseSiteDirectory({ ...row, origin }, { repoRoot }), false, String(origin));
  assert.equal(mayEraseSiteDirectory(undefined, { repoRoot }), false);
});

test('repo root: missing, empty or non-string options refuse', t => {
  const { row } = layout(t);
  for (const options of [undefined, {}, { repoRoot: '' }, { repoRoot: 5 }, { repoRoot: null }]) assert.equal(mayEraseSiteDirectory(row, options as never), false, JSON.stringify(options));
});

test('identity: the row must record a non-empty string id that equals the on-disk site id', t => {
  const { row, repoRoot, siteDir } = layout(t);
  for (const siteId of ['', 5, undefined, 'site-b']) assert.equal(mayEraseSiteDirectory({ ...row, siteId }, { repoRoot }), false, String(siteId));
  for (const meta of ['{"siteId":""}', '{"siteId":5}', '{}', 'null', 'not json', '{"siteId":"site-b"}']) {
    fs.writeFileSync(path.join(siteDir, '.site-meta.json'), meta);
    assert.equal(mayEraseSiteDirectory(row, { repoRoot }), false, meta);
  }
  fs.rmSync(path.join(siteDir, '.site-meta.json'));
  assert.equal(mayEraseSiteDirectory(row, { repoRoot }), false, 'no meta file');
});

test('readSiteIdentity returns the id only for a non-empty string', t => {
  const { siteDir } = layout(t);
  assert.equal(readSiteIdentity(siteDir), 'site-a');
  for (const [meta, expected] of [['{"siteId":""}', null], ['{"siteId":7}', null], ['null', null], ['[]', null], ['{"siteId":"x"}', 'x']] as const) {
    fs.writeFileSync(path.join(siteDir, '.site-meta.json'), meta);
    assert.equal(readSiteIdentity(siteDir), expected, meta);
  }
});

test('containment: the repo root itself, or anything inside it, is never erased even as a valid created site', t => {
  const { repoRoot } = layout(t);
  fs.writeFileSync(path.join(repoRoot, '.site-meta.json'), JSON.stringify({ siteId: 'root' }));
  assert.equal(mayEraseSiteDirectory({ origin: 'created', siteDir: repoRoot, siteId: 'root' }, { repoRoot }), false);
  const inner = path.join(repoRoot, 'sites', 'inner');
  fs.mkdirSync(inner, { recursive: true });
  fs.writeFileSync(path.join(inner, '.site-meta.json'), JSON.stringify({ siteId: 'inner' }));
  assert.equal(mayEraseSiteDirectory({ origin: 'created', siteDir: inner, siteId: 'inner' }, { repoRoot }), false);
});
