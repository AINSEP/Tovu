/** F9 (Stryker L15 tracked-sites 84.7 %, 44 survivors): provenance is the erase authorization, so
 * every path that could forge or keep it is driven: the ok-shape guard per clause (null, array,
 * non-list projects), damaged files losing origin AND siteId per row (hostile rows kept as-is),
 * the usable-row filter per field, and `siteId` stamped only on a created row with a non-empty id. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readProjectsFile, trackSite, SITE_ORIGIN } from './tracked-sites.ts';

function projectsFile(t: { after: (fn: () => void) => void }, contents?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-tracked-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'projects.json');
  if (contents !== undefined) fs.writeFileSync(file, contents);
  return file;
}
const created = { siteDir: '/sites/a', createdAt: '2026-10-24T00:00:00.000Z', origin: 'created', siteId: 'site-a' };

test('a well-formed file keeps provenance; a missing file is "missing" and empty', t => {
  const read = readProjectsFile(projectsFile(t, JSON.stringify({ projects: [created], dismissed: ['/gone'] })));
  assert.deepEqual(read, { state: 'ok', rows: [created], dismissed: ['/gone'], dismissedRecorded: true });
  assert.deepEqual(readProjectsFile(projectsFile(t)), { state: 'missing', rows: [], dismissed: [], dismissedRecorded: false });
});

test('a parsed value of the wrong shape is damaged (never ok), and every recovered row loses origin and siteId', t => {
  for (const value of [null, [created], { projects: 'x' }, { projects: { 0: created } }, 'text', 7]) {
    const read = readProjectsFile(projectsFile(t, JSON.stringify(value)));
    assert.equal(read.state, 'unreadable', JSON.stringify(value));
    assert.deepEqual(read.rows, [], JSON.stringify(value));
  }
});

test('a truncated file is salvaged, but recovered rows come back adopted without a siteId; hostile rows are dropped', t => {
  const whole = JSON.stringify({ projects: [created, null, 5, { ...created, siteDir: '/sites/b', siteId: 'site-b' }], dismissed: ['/x'] });
  const read = readProjectsFile(projectsFile(t, whole.slice(0, whole.indexOf('"dismissed"') + 3)));
  assert.equal(read.state, 'unreadable');
  assert.deepEqual(read.rows, [
    { siteDir: '/sites/a', createdAt: created.createdAt, origin: 'adopted' },
    { siteDir: '/sites/b', createdAt: created.createdAt, origin: 'adopted' },
  ]);
});

test('a row needs BOTH a string siteDir and a string createdAt; dismissals keep only strings; origin normalises', t => {
  const rows = [
    { siteDir: '/ok', createdAt: 'c' }, { siteDir: 5, createdAt: 'c' }, { siteDir: '/no-date' }, { createdAt: 'c' },
    { siteDir: '/weird-origin', createdAt: 'c', origin: 'CREATED' }, null,
  ];
  const read = readProjectsFile(projectsFile(t, JSON.stringify({ projects: rows, dismissed: ['/a', 5, null, '/b'] })));
  assert.deepEqual(read.rows, [{ siteDir: '/ok', createdAt: 'c', origin: 'adopted' }, { siteDir: '/weird-origin', createdAt: 'c', origin: 'adopted' }]);
  assert.deepEqual([read.dismissed, read.dismissedRecorded], [['/a', '/b'], true]);
  const noDismissals = readProjectsFile(projectsFile(t, JSON.stringify({ projects: [], dismissed: 'x' })));
  assert.deepEqual([noDismissals.dismissed, noDismissals.dismissedRecorded], [[], false]);
});

test('trackSite stamps siteId only on a CREATED row with a non-empty string id', t => {
  const cases: [string, unknown, boolean][] = [
    [SITE_ORIGIN.created, 'site-x', true], [SITE_ORIGIN.created, '', false], [SITE_ORIGIN.created, null, false], [SITE_ORIGIN.created, 7, false],
    [SITE_ORIGIN.adopted, 'site-x', false], ['bogus', 'site-x', false],
  ];
  for (const [origin, siteId, stamped] of cases) {
    const file = projectsFile(t);
    const [row] = trackSite(file, '/sites/new', origin as never, { siteId: siteId as never });
    assert.equal(row?.origin, origin === SITE_ORIGIN.created ? 'created' : 'adopted', `${origin}/${String(siteId)}`);
    assert.equal('siteId' in (row ?? {}), stamped, `${origin}/${String(siteId)}`);
    if (stamped) assert.equal((row as { siteId?: string }).siteId, siteId);
  }
});

test('re-tracking a known dir adds no row, but clears its tombstone', t => {
  const file = projectsFile(t, JSON.stringify({ projects: [{ siteDir: '/a', createdAt: 'c', origin: 'adopted' }], dismissed: ['/a', '/b'] }));
  assert.equal(trackSite(file, '/a').length, 1);
  assert.deepEqual(readProjectsFile(file).dismissed, ['/b']);
});
