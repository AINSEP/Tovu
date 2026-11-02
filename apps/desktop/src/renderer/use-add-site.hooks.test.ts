/**
 * @file The pure helpers of `use-add-site.hooks.ts`, asserted directly.
 *
 * `describeAddFailure` is where this feature could go quietly wrong: main writes one refusal per
 * folder problem, each naming the fix, and every surface — CLI, assistant, this button — needs the
 * same recovery instruction. A helper that flattened them into "Couldn't add that website." would
 * pass any test that only checked "an error is shown", so the tests here use the REAL refusals and
 * assert exact recovery text.
 *
 * The hook itself is rendered from its real module in `site-create-hooks.jsdom.test.ts`; the header
 * button in `app/MainHeader.render.test.ts`; the refusal beside the grid and the empty state in
 * `app/MainContent.render.test.ts`; the grid without its old dashed tile in
 * `SiteGrid.no-add-tile.render.test.ts`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANCELLED_MESSAGE, describeAddFailure, mergeAddedSite } from './use-add-site.hooks.js';
import type { SiteRecord } from '../contracts/project.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Main-process source, read as text: the renderer test cannot produce the refusal without driving
// `addSitePointer` against a real folder, and this only pins that the sentence still exists there.
const pointerSource = fs.readFileSync(path.join(here, '..', 'add-site-pointer.ts'), 'utf8');

function siteRecord(id: string, createdAt = '2026-01-01T00:00:00.000Z'): SiteRecord {
  return {
    id,
    slug: path.basename(id),
    displayName: path.basename(id),
    installDir: id,
    port: 0,
    partition: `persist:tovu-site-${path.basename(id)}`,
    templateId: 'tovu',
    templateVersion: null,
    database: { kind: 'sqlite' },
    desiredState: 'stopped',
    status: 'stopped',
    statusDetail: null,
    deleteErasesFiles: false,
    createdAt,
    updatedAt: createdAt,
  } as SiteRecord;
}

test("a folder refusal keeps the recovery instruction without exposing the path", () => {
  // Not a paraphrase of a refusal — the real one, lifted from `add-site-pointer.ts`'s own source so
  // this test fails if that message is ever rewritten without this surface being reconsidered.
  const real =
    '/Users/la/Documents is a folder of unrelated files, not a Tovu site (no config.json and no ' +
    '.site-meta.json). If your site lives in a subfolder, point at that subfolder instead.';
  assert.ok(pointerSource.includes('If your site lives in a subfolder'), 'the refusal text moved');

  const shown = describeAddFailure(new Error(`Error invoking remote method 'runner:sites:add-site': Error: ${real}`));

  // Keep the part that tells them what to do. `useSiteRescan` flattens
  // every failure into one string; doing that here would throw away the only actionable half.
  assert.equal(shown, 'This folder is not a Tovu website. Choose the folder containing your website.');
});

test("the Electron IPC prefix and folder path are replaced by recovery text", () => {
  const shown = describeAddFailure(
    new Error("Error invoking remote method 'runner:sites:add-site': Error: /tmp/x has no Tovu site in it yet."),
  );

  assert.equal(shown, 'No Tovu website was found in this folder. Choose an existing website or use Create website.');
  assert.doesNotMatch(shown ?? '', /invoking remote method/);
  assert.doesNotMatch(shown ?? '', /^Error:/);
});

test("a cancelled folder picker shows NOTHING", () => {
  // A refusal, but reporting the operator's own decision back to them as an error is noise.
  assert.equal(describeAddFailure(new Error(`Error invoking remote method 'x': Error: ${CANCELLED_MESSAGE}`)), null);
  assert.equal(describeAddFailure(new Error(CANCELLED_MESSAGE)), null);
});

test("an empty or non-Error rejection still produces something sayable", () => {
  assert.equal(describeAddFailure(new Error('')), "Couldn't add that website.");
  assert.equal(describeAddFailure(new Error('Error: ')), "Couldn't add that website.");
  assert.equal(describeAddFailure('plain string'), 'plain string');
});

test("re-adding a tracked website REPLACES its row instead of showing a second card", () => {
  const existing = siteRecord('/sites/a', '2026-01-01T00:00:00.000Z');
  const other = siteRecord('/sites/b');

  const added = siteRecord('/sites/a', '2026-05-05T00:00:00.000Z');
  const merged = mergeAddedSite([existing, other], added);

  // The duplicate case is real, not defensive: `addSitePointer` is idempotent and returns the
  // EXISTING record, so a plain append would show two identical cards for one website until the
  // next poll quietly removed one.
  assert.equal(merged.length, 2);
  assert.deepEqual(merged, [added, other]);
  assert.equal(merged[1], other);
  assert.deepEqual(
    merged.map((project) => project.id),
    ['/sites/a', '/sites/b'],
  );
});

test("a newly added website appears first", () => {
  const merged = mergeAddedSite([siteRecord('/sites/a')], siteRecord('/sites/new'));

  assert.deepEqual(
    merged.map((project) => project.id),
    ['/sites/new', '/sites/a'],
  );
});
