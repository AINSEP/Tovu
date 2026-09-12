/**
 * @file Coverage for `use-add-site.hooks.ts` and the "Add Tovu Website" button's wiring.
 *
 * Two halves, for two different kinds of mistake:
 *
 * 1. **The pure helpers**, asserted directly. `describeAddFailure` is where this feature could go
 *    quietly wrong: main writes one refusal per folder problem, each naming the fix, and every
 *    surface — CLI, assistant, this button — is supposed to say the same sentence. A helper that
 *    flattened them into "Couldn't add that website." would pass any test that only checked "an
 *    error is shown", so the tests here assert on the REAL refusal strings.
 * 2. **The wiring**, asserted against the source text, the way `rescan-wiring.test.js` does for
 *    the sibling button. These catch what a unit test structurally cannot: logic creeping into
 *    `.tsx`, the button never being rendered, or the deleted dashed tile coming back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANCELLED_MESSAGE, describeAddFailure, mergeAddedSite } from './use-add-site.hooks.js';
import type { SiteRecord } from '../contracts/project.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appTsx = fs.readFileSync(path.join(here, 'App.tsx'), 'utf8');
const gridTsx = fs.readFileSync(path.join(here, 'SiteGrid.tsx'), 'utf8');
const hookSource = fs.readFileSync(path.join(here, 'use-add-site.hooks.ts'), 'utf8');
const pointerSource = fs.readFileSync(path.join(here, '..', 'add-site-pointer.ts'), 'utf8');

/**
 * Source with every comment removed.
 *
 * Required, not tidiness: both files here EXPLAIN the deleted dashed tile and the header order in
 * prose, so "Add project" and "Create website" both appear in comments. A source scan that did not
 * strip them asserted against its own documentation — which is exactly how the first draft of this
 * file reported the button in the wrong position and the deleted tile as still present, while the
 * rendered markup was correct in both cases.
 *
 * Deliberately crude (it would also cut a `//` inside a string literal). That direction is safe for
 * what these tests ask — they look for JSX label text and class names, never for a URL.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

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

test("a refusal reaches the operator VERBATIM, fix and all", () => {
  // Not a paraphrase of a refusal — the real one, lifted from `add-site-pointer.js`'s own source so
  // this test fails if that message is ever rewritten without this surface being reconsidered.
  const real =
    '/Users/la/Documents is a folder of unrelated files, not a Tovu site (no config.json and no ' +
    '.site-meta.json). If your site lives in a subfolder, point at that subfolder instead.';
  assert.ok(pointerSource.includes('If your site lives in a subfolder'), 'the refusal text moved');

  const shown = describeAddFailure(new Error(`Error invoking remote method 'runner:sites:add-site': Error: ${real}`));

  // The whole sentence, including the part that tells them what to do. `useSiteRescan` flattens
  // every failure into one string; doing that here would throw away the only actionable half.
  assert.equal(shown, real);
});

test("the Electron IPC prefix is stripped but nothing after it is", () => {
  const shown = describeAddFailure(
    new Error("Error invoking remote method 'runner:sites:add-site': Error: /tmp/x has no Tovu site in it yet."),
  );

  assert.equal(shown, '/tmp/x has no Tovu site in it yet.');
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

  const merged = mergeAddedSite([existing, other], siteRecord('/sites/a', '2026-05-05T00:00:00.000Z'));

  // The duplicate case is real, not defensive: `addSitePointer` is idempotent and returns the
  // EXISTING record, so a plain append would show two identical cards for one website until the
  // next poll quietly removed one.
  assert.equal(merged.length, 2);
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

test("the add logic lives in a hook, not in App.tsx — this repo keeps logic out of .tsx", () => {
  assert.match(hookSource, /export function useAddSite\(/);
  assert.match(hookSource, /bridge\.addSite\(\)/);
  // The component must not reach the bridge itself.
  assert.doesNotMatch(appTsx, /addSite\(\)\s*;/);
  assert.match(appTsx, /import \{ useAddSite \} from '\.\/use-add-site\.hooks\.js'/);
});

test("the Projects header renders the Add Tovu Website button, wired and disableable", () => {
  assert.match(appTsx, /Add Tovu Website/);
  assert.match(appTsx, /onClick=\{\(\) => void onAddSite\(\)\}/);
  // Disabled while in flight, so a second folder picker cannot be opened over the first.
  assert.match(appTsx, /onClick=\{\(\) => void onAddSite\(\)\} disabled=\{adding\}/);
});

test("the button sits between Rescan and Create website", () => {
  // The owner's chosen order for the header row. Positional, so it is asserted positionally.
  const markup = withoutComments(appTsx);
  const tools = markup.slice(markup.indexOf('main__tools'));
  const row = tools.slice(0, tools.indexOf('</header>'));
  assert.ok(row.indexOf('Rescan') < row.indexOf('Add Tovu Website'), 'Rescan must come first');
  assert.ok(row.indexOf('Add Tovu Website') < row.indexOf('Create website'), 'Create website must come last');
});

test("a refused add is reported ALONGSIDE the grid, never in place of it", () => {
  const body = appTsx.slice(appTsx.indexOf('function ProjectsBody('));
  const ownBody = body.slice(0, body.indexOf('\nfunction '));
  // Same property `rescanError` has, for the same reason: the websites already on screen stay real
  // and openable whatever happened to ONE folder the operator pointed at.
  assert.ok(ownBody.includes('if (loadError)'), 'loadError still owns the replace-the-grid path');
  const addRender = ownBody.indexOf('{addError &&');
  assert.ok(addRender !== -1, 'addError is not rendered at all');
  assert.doesNotMatch(ownBody.slice(addRender, ownBody.indexOf('<SiteGrid')), /\breturn\b/);
});

test("the redundant dashed add tile is GONE from the grid", () => {
  // It called the identical zero-argument handler the header's "Create website" button calls, and
  // its subtitle described the create path — one action wearing two controls. Asserted on the class
  // and the label both, so restoring either half fails.
  const markup = withoutComments(gridTsx);
  assert.doesNotMatch(markup, /card--add/);
  assert.doesNotMatch(markup, /Add project/);
  assert.doesNotMatch(markup, /New site on its own port/);
  // And the prop it needed is gone rather than left dangling.
  assert.doesNotMatch(markup, /onCreate/);
});

test("removing the tile did not leave an operator with no websites staring at nothing", () => {
  // The tile WAS the empty state. Deleting it without replacing it would make a first launch render
  // a blank page — a regression hidden behind a passing "the tile is gone" assertion.
  assert.match(appTsx, /function NoWebsitesYet\(/);
  assert.match(appTsx, /projects\.length === 0 \? <NoWebsitesYet \/>/);
  const markup = withoutComments(appTsx);
  const empty = markup.slice(markup.indexOf('function NoWebsitesYet('));
  const ownBody = empty.slice(0, empty.indexOf('\nfunction '));
  // It points at the header buttons rather than duplicating them — a fourth control here would be
  // the same mistake the dashed tile was.
  for (const label of ['Create website', 'Add Tovu Website', 'Rescan']) {
    assert.ok(ownBody.includes(label), `the empty state does not mention ${label}`);
  }
  assert.doesNotMatch(ownBody, /onClick/);
});

test("runner-api declares addSite, or the renderer cannot see the bridge method", () => {
  const runnerApi = fs.readFileSync(path.join(here, 'runner-api.ts'), 'utf8');
  assert.match(runnerApi, /addSite: \(\) => Promise<SiteRecord>/);
});
