/**
 * @file The card's action row, asserted where it can be: against source text.
 *
 * Everything here is a WIRING claim — that a correct primitive is actually reached. `powerControl`
 * and `performPowerAction` are unit-tested for real in `use-site-power.hooks.test.ts`; this file
 * exists because either of them could be perfectly correct while the button called neither, the row
 * stayed on the preview image, or the CSS kept fading it out on hover. That is the exact shape of
 * "correct primitive, unwired call site", and there is no React renderer in this package to catch
 * it any other way (see `rescan-wiring.test.ts`'s header).
 *
 * **Revision (2026-09-18).** The owner saw the first layout and asked for two changes: delete moves
 * OFF the card and into the ⋮ menu (their reason is misclicks — a destructive control beside a
 * button pressed often is too easy to hit), and Start/Stop wears the header's "Create website"
 * style instead of its own look. Both are asserted below from source text, the same way the ⋮/trash
 * placement was before. The live check in `scripts/verify-site-power.ts` covers what only a real
 * DOM can prove — computed style equality, and that clicking the menu entry actually opens the
 * confirm overlay rather than deleting.
 *
 * **Second revision, same day.** The owner saw THAT layout and moved the controls again: the ⋮ to
 * the card's top-right, level with the site name, and Start/Stop directly beneath it. The row is a
 * COLUMN now, so the two tests below assert the shape rather than the old bottom-pinned row — and
 * they assert it on `.card__body`/`.card__actions`' CSS, because nothing about either button's own
 * markup changed and every other test in this file stayed green through the move.
 *
 * **Third revision (2026-10-06).** The ⋮ stays top-right, level with the name, but Start/Stop moves
 * to the LEFT, on its own row under the "SQLite" line, with Restart on that same row at the right
 * edge. The ⋮ therefore lives in a `.card__head` row beside the text, and `.card__actions` is the
 * button row beneath it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { elements, hookHarness, sourceFunction } from './source-test-harness.js';
import { IN_FLIGHT_STATUS, performPowerAction, powerControl, runPowerToggle } from './use-site-power.hooks.js';

const grid = fs.readFileSync(path.join(import.meta.dirname, 'SiteGrid.tsx'), 'utf8');
const css = fs.readFileSync(path.join(import.meta.dirname, 'app.css'), 'utf8');
const power = fs.readFileSync(path.join(import.meta.dirname, 'use-site-power.hooks.ts'), 'utf8');
const app = fs.readFileSync(path.join(import.meta.dirname, 'App.tsx'), 'utf8');
const appHooks = fs.readFileSync(path.join(import.meta.dirname, 'App.hooks.ts'), 'utf8');

/** `SiteCard`'s own body — the tile and the info block, without the components defined after it. */
function cardBody(): string {
  const start = grid.indexOf('function SiteCard({');
  const end = grid.indexOf('function CardConfirmOverlay(', start);
  assert.ok(start !== -1 && end > start, 'expected a SiteCard component in SiteGrid.tsx');
  return grid.slice(start, end);
}

/** `CardActions`' own body. */
function actionsBody(): string {
  const start = grid.indexOf('function CardActions({');
  const end = grid.indexOf('function SiteCardMenu(', start);
  assert.ok(start !== -1 && end > start, 'expected a CardActions component in SiteGrid.tsx');
  return grid.slice(start, end);
}

/** `SiteCardMenu`'s own body — where delete now lives. */
function menuBody(): string {
  const start = grid.indexOf('function SiteCardMenu({');
  const end = grid.indexOf('function CardRenameOverlay(', start);
  assert.ok(start !== -1 && end > start, 'expected a SiteCardMenu component in SiteGrid.tsx');
  return grid.slice(start, end);
}

test('the actions row is in the card BODY, and the preview tile carries nothing but the preview', () => {
  const body = cardBody();
  const tile = body.slice(body.indexOf('<div className="card__tile">'), body.indexOf('<div className="card__body">'));
  assert.doesNotMatch(tile, /card__menu|SiteCardMenu/, 'no action control may sit on the screenshot');
  assert.match(body, /<div className="card__body">[\s\S]*<CardActions/, 'CardActions belongs to the info block');
});

test('the card head is two columns — the text on the left, the ⋮ at the right edge level with the name', () => {
  // The owner's layout, in their own words: the ⋮ "parallel right aligned in the card" with the
  // site name. That is not a property of the ⋮ itself; it is the HEAD being a ROW of two columns,
  // so it is asserted on the head's rule. A silent revert to `flex-direction: column` would put the
  // ⋮ back under the text with every other assertion in this file still green.
  const body = cardBody();
  assert.match(body, /<div className="card__body">[\s\S]*<div className="card__head">[\s\S]*<div className="card__info">/, 'the text needs its own column element inside the head');
  // The three lines the card SAYS about the site live in that left column, not beside the buttons.
  const info = body.slice(body.indexOf('<div className="card__info">'), body.indexOf('<SiteCardMenu'));
  for (const cls of ['card__name', 'card__meta', 'card__details', 'card__actionerror']) {
    assert.match(info, new RegExp(`className="${cls}"`), `${cls} belongs in the left column`);
  }
  const head = body.slice(body.indexOf('<div className="card__head">'), body.indexOf('<CardActions'));
  assert.match(head, /<SiteCardMenu/, 'the ⋮ sits in the head, beside the text, not in the row of buttons below it');
  const rule = css.slice(css.indexOf('.card__head {'), css.indexOf('}', css.indexOf('.card__head {')));
  assert.match(rule, /flex-direction:\s*row/, 'the head must lay its two columns side by side');
  for (const override of css.matchAll(/\.card__head\s*\{([^}]*)\}/g)) {
    assert.doesNotMatch(override[1]!, /flex-direction:\s*(?!row\b)[\w-]+/, 'a later or media-query rule must not stack the head columns');
  }
  // Without this a long site name refuses to shrink and shoves the ⋮ off the card's right edge.
  const infoRule = css.slice(css.indexOf('.card__info {'), css.indexOf('}', css.indexOf('.card__info {')));
  assert.match(infoRule, /min-width:\s*0/, 'the text column must be allowed to shrink, or a long name pushes the ⋮ out');
});

test('Start/Stop sits on its own row UNDER the text, with Restart on that same row at the right edge', () => {
  // Third revision (2026-10-06): the owner moved Start/Stop out from under the ⋮ to the left, under
  // the "SQLite" line, and Restart onto that same row, aligned right. The body stacks the head above
  // the button row; the button row is a ROW, not the column it was.
  const bodyRule = css.slice(css.indexOf('.card__body {'), css.indexOf('}', css.indexOf('.card__body {')));
  assert.match(bodyRule, /flex-direction:\s*column/, 'the button row sits below the head, not beside it');
  const rule = css.slice(css.indexOf('.card__actions {'), css.indexOf('}', css.indexOf('.card__actions {')));
  assert.match(rule, /flex-direction:\s*row/, 'Start/Stop and Restart share one row');
  for (const override of css.matchAll(/\.card__actions\s*\{([^}]*)\}/g)) {
    assert.doesNotMatch(override[1]!, /flex-direction:\s*(?!row\b)[\w-]+/, 'a later or media-query rule must not stack Start above Restart');
  }
  const restartRule = css.slice(css.indexOf('.card__restart {'), css.indexOf('}', css.indexOf('.card__restart {')));
  assert.match(restartRule, /margin-left:\s*auto/, 'Restart is pushed to the right edge even when it is alone on the row');
  // DOM order must match the order on screen, or Tab skips around: ⋮ (top right), then Start/Stop
  // (left), then Restart (right).
  const body = cardBody();
  assert.ok(body.indexOf('<SiteCardMenu') < body.indexOf('<CardActions'), 'the ⋮ must render before the button row, the order it is drawn in');
  const actions = actionsBody();
  assert.doesNotMatch(actions, /<SiteCardMenu/, 'the ⋮ no longer lives in the button row');
  assert.ok(actions.indexOf('power.toggle(project)') < actions.indexOf('card__restart'), 'Start/Stop renders before Restart');
  assert.match(actions, /className="button button--quiet card__power card__restart"[\s\S]*?onClick=\{\(\) => void power\.restart\(project\)\}/);
});

test('no standalone trash control exists anywhere — delete lives only inside the ⋮ menu', () => {
  // The owner's requirement, reversing the earlier "trash always visible" layout: their reason is
  // misclicks, a destructive control beside a button pressed often. A regression back to a
  // top-level `card__delete` would be invisible to every OTHER test in this file, since they all
  // scope to one component's body.
  assert.doesNotMatch(grid, /card__delete/, 'a standalone card__delete control regressed the misclick fix');
  assert.doesNotMatch(css, /\.card__delete\b/, 'a standalone card__delete style regressed the misclick fix');
});

test('nothing in the action row is revealed by hover — the owner asked to see the ⋮ either way', () => {
  // `opacity: 0` + `pointer-events: none` with a `:hover` counterpart is the exact pattern these
  // controls used to carry. A regression to it would be invisible in the JSX.
  for (const selector of ['.card__menubutton', '.card__power']) {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `${selector} must have a rule`);
    const rule = css.slice(start, css.indexOf('}', start));
    assert.doesNotMatch(rule, /opacity:\s*0\b/, `${selector} must not start invisible`);
    assert.doesNotMatch(rule, /pointer-events:\s*none/, `${selector} must not start unclickable`);
  }
  assert.doesNotMatch(css, /\.card:hover \.card__menubutton/, 'no hover-reveal rule may come back');
});

test('the ⋮ trigger carries an accessible name, since it has no visible text', () => {
  // The ⋮ button's own label lives in `SiteCardMenu`.
  assert.match(grid, /className="card__menubutton"[\s\S]*?aria-label=\{`More actions for \$\{project\.displayName\}`\}/);
  // The row itself is a labelled group, not a bare div with handlers on it.
  const actions = actionsBody();
  assert.match(actions, /role="group"[\s\S]*?aria-label=\{`Actions for \$\{project\.displayName\}`\}/);
});

test('the power button calls power.toggle and renders the label powerControl decided', () => {
  const actions = actionsBody();
  assert.match(actions, /const control = powerControl\(status\);/);
  assert.match(actions, /className="button button--create card__power"[\s\S]*?onClick=\{\(\) => void power\.toggle\(project\)\}/);
  assert.match(actions, /disabled=\{control\.action === null\}/, 'a busy control must be inert, not merely dimmed');
  assert.match(actions, /\{control\.label\}/, 'the label must come from the control, never from what was clicked');
  // `: control && (` since a missing-folder card renders Locate / Remove in this slot instead.
  assert.match(actions, /: control && \(/, 'a status with no honest button renders none');
});

test('Start opens the site through the SAME onOpen a card click uses — no second open path', () => {
  assert.match(grid, /const power = usePower\(onSiteUpdated, \{ onStarted: onOpen \}\);/);
  assert.match(power, /onStarted\?: \(id: string\) => void/);
});

test('Start/Stop reuses the header\'s "Create website" class rather than a hand-copied look', () => {
  // Both must wear the identical `button--create` token — the owner's requirement was to REUSE the
  // class, not eyeball a matching colour. `app` carries the header button (`App.tsx`); `grid`
  // carries the card's power button (`SiteGrid.tsx`).
  assert.match(app, /className="button button--create"[\s\S]{0,40}onClick=\{onCreateWebsite\}/, 'the header button must still exist as the source of the style');
  assert.match(grid, /className="button button--create card__power"/, 'the power button must carry the same button--create class');
  // The class itself must resolve to a token, not a hand-copied hex value.
  assert.match(css, /\.button--primary,\s*\.button--create\s*\{\s*border:\s*1px solid var\(--primary\);\s*background:\s*var\(--primary\);/);
});

test('the card renders the status the power hook decided, not the raw polled one', () => {
  const body = cardBody();
  assert.match(body, /const status = power\.statusOf\(project\);/);
  assert.match(body, /STATUS_LABEL\[status\]/);
  assert.match(body, /card is-\$\{status\}/);
});

test('every event that starts in the action row stops there — the card underneath is an open target', () => {
  // Clicks AND keys: the card is keyboard-activated too, so Enter on Start would otherwise also
  // open the site in a tab.
  const actions = actionsBody();
  assert.match(actions, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(actions, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  // The ⋮ menu carries the identical pair of its own — asserted in the menu tests below, since the
  // trash no longer lives in this row to assert here.
});

test('the ⋮ menu carries copy and onRequestDelete through to its delete entry', () => {
  const body = cardBody();
  assert.match(
    body,
    /<SiteCardMenu[\s\S]*?copy=\{copy\}[\s\S]*?onRequestDelete=\{onRequestDelete\}[\s\S]*?\/>/,
    'SiteCard must forward copy and onRequestDelete to the menu that now owns delete',
  );
});

test('the delete entry closes the menu BEFORE requesting a delete, same as every other entry', () => {
  const menu = menuBody();
  assert.match(menu, /onClick=\{choose\(\(\) => onRequestDelete\(project\.id\)\)\}/, 'delete must go through closeMenuThen like Rename and Open in browser');
});

test('delete reads as destructive only when it actually erases files, never for an adopted "Remove"', () => {
  const menu = menuBody();
  assert.match(
    menu,
    /className=\{project\.deleteErasesFiles \? 'card__menuitem card__menuitem--danger' : 'card__menuitem'\}/,
    'the danger styling must be conditional on deleteErasesFiles, not blanket-applied',
  );
  assert.match(menu, /\{copy\.menuItemLabel\}/, 'the entry text must come from deleteActionCopy, never a literal string');
  // The danger class must reuse the app's existing danger tokens, not a hand-copied hex value.
  assert.match(css, /\.card__menuitem--danger\s*\{\s*color:\s*var\(--danger\);\s*\}/);
  assert.match(css, /\.card__menuitem--danger:hover\s*\{\s*background:\s*var\(--danger-dim\);\s*\}/);
});

test('the delete entry is last in the menu list, after Rename and the conditional Open in browser', () => {
  const menu = menuBody();
  const rename = menu.indexOf("Rename…");
  const openInBrowser = menu.indexOf('Open in browser');
  const del = menu.indexOf('{copy.menuItemLabel}');
  assert.ok(rename !== -1 && del !== -1, 'expected both Rename and the delete entry in the menu');
  assert.ok(del > rename, 'delete must render after Rename');
  if (openInBrowser !== -1) assert.ok(del > openInBrowser, 'delete must render after Open in browser');
});

test('delete still goes through the confirm overlay — a menu entry makes that no less load-bearing', () => {
  const menu = menuBody();
  assert.match(menu, /onRequestDelete/, 'the menu entry must request a confirmation, never delete directly');
  assert.doesNotMatch(menu, /onConfirmDelete|onDelete\(/, 'no path from the menu entry straight to the delete');
  assert.match(grid, /overlay === 'confirm' && \(/);
  assert.match(grid, /<SiteCard\b[^>]*onRequestDelete=\{requestDelete\}[^>]*onCancelDelete=\{cancelDelete\}[^>]*onConfirmDelete=\{confirmDelete\}/);
  assert.match(cardBody(), /<CardActions\b[^>]*onRequestDelete=\{onRequestDelete\}/);
  assert.match(cardBody(), /<CardConfirmOverlay\b[^>]*onCancel=\{onCancelDelete\}[^>]*onConfirm=\{onConfirmDelete\}/);
  const harness = hookHarness();
  const useDelete = sourceFunction(appHooks, 'useDeleteConfirmation', harness.bindings);
  const deleted: string[] = [];
  const onDelete = async (id: string) => { deleted.push(id); };
  const render = () => harness.render(() => useDelete(onDelete));
  render().requestDelete('/sites/a');
  assert.equal(render().pendingId, '/sites/a');
  assert.deepEqual(deleted, [], 'requesting confirmation cannot delete');
  render().cancelDelete();
  assert.equal(render().pendingId, null);
  assert.deepEqual(deleted, [], 'Cancel cannot delete');
  render().requestDelete('/sites/a');
  const overlay = sourceFunction(grid, 'CardConfirmOverlay');
  const confirm = elements(overlay({ project: { id: '/sites/a' }, copy: { confirmButtonLabel: 'Delete' },
    onCancel: render().cancelDelete, onConfirm: render().confirmDelete })).find((element) => element.type === 'button' && element.props.children === 'Delete');
  assert.ok(confirm);
  confirm.props.onClick();
  assert.deepEqual(deleted, ['/sites/a']);
});

test('the pending mark is cleared on BOTH arms, so a failed start cannot stick on Starting…', async () => {
  // The one thing this control must never do is remember its own press. There is no renderer here
  // to drive the failure arm, so the clearing is asserted structurally: it must not sit inside the
  // success branch.
  const toggle = power.slice(power.indexOf('const toggle = useCallback('), power.indexOf('const restartControlOf = useCallback('));
  assert.match(toggle, /const error = await runPowerToggle\(\{ action, id, bridge: runnerInventoryBridge\(\) \}, \{ onSiteUpdated, onStarted \}\);/);
  assert.match(toggle, /if \(error !== null\) setErrors/);
  const clear = toggle.indexOf('setPending((current) => withoutKey(current, id));');
  assert.notEqual(clear, -1, 'the pending mark must be cleared');
  assert.ok(clear > toggle.indexOf('if (error !== null) setErrors'), 'the clear must follow both arms, not live inside one');
  const harness = hookHarness();
  let reject!: (error: Error) => void;
  const usePower = sourceFunction(power, 'useSitePower', { ...harness.bindings,
    powerControl, performPowerAction, runPowerToggle, IN_FLIGHT_STATUS,
    withoutKey: sourceFunction(power, 'withoutKey'),
    runnerInventoryBridge: () => ({ startSite: () => new Promise((_resolve, fail) => { reject = fail; }) }),
  });
  const project = { id: '/sites/a', status: 'stopped' };
  const other = { id: '/sites/b', status: 'running' };
  const render = () => harness.render(() => usePower());
  const starting = render().toggle(project);
  assert.equal(render().statusOf(project), 'starting');
  assert.equal(render().statusOf(other), 'running');
  assert.equal(powerControl(render().statusOf(project))?.action, null);
  reject(new Error('port busy'));
  await starting;
  assert.equal(render().statusOf(project), 'stopped');
  assert.equal(render().errorOf(project.id), 'port busy');
  assert.equal(powerControl(render().statusOf(project))?.action, 'start', 'retry must be available');
});

test("main's refreshed record reaches the grid, rather than waiting on the 4s poll", () => {
  // The unwired-call-site check for the other direction: `useApplySiteRecord` could be correct and
  // simply never handed to the grid, and the only symptom would be a card four seconds stale.
  assert.match(app, /const applySiteRecord = useApplySiteRecord\(setProjects\);/);
  assert.match(app, /<SiteGrid [^>]*onSiteUpdated=\{onSiteUpdated\}/);
  assert.match(grid, /const power = usePower\(onSiteUpdated, \{ onStarted: onOpen \}\);/);
  for (const [component, callback] of [['MainArea', 'applySiteRecord'], ['MainContent', 'onSiteUpdated'], ['ProjectsBody', 'onSiteUpdated']]) {
    assert.match(app, new RegExp(`<${component}\\b[^>]*onSiteUpdated=\\{${callback}\\}`), `${component} must forward the actual update callback`);
  }
  const harness = hookHarness();
  const useApply = sourceFunction(appHooks, 'useApplySiteRecord', harness.bindings);
  const unchanged = { id: '/sites/b', status: 'running', port: 4002 };
  let projects = [{ id: '/sites/a', status: 'stopped', port: 4001 }, unchanged];
  const updated = { id: '/sites/a', status: 'running', port: 4321 };
  useApply((next: any) => { projects = next(projects); })(updated);
  assert.deepEqual(projects, [updated, unchanged], 'status and port must update before any poll');
});

// ---- A card whose folder is gone (`SiteRecord.folderMissing`) ----

test('a missing-folder card says so in its body', () => {
  assert.match(cardBody(), /\{project\.folderMissing && <p className="card__missing">Folder moved or deleted<\/p>\}/);
  const own = cardBody().slice(0, cardBody().indexOf('\nfunction MissingFolderNotice('));
  assert.match(own, /<MissingFolderNotice\s+project=\{project\}\s+locate=\{locate\}\s*\/>/, 'SiteCard itself must invoke the notice');
  const notice = sourceFunction(grid, 'MissingFolderNotice');
  const locate = { errorOf: () => null };
  assert.ok(elements(notice({ project: { folderMissing: true }, locate })).some((element) => element.props.children === 'Folder moved or deleted'));
  assert.equal(elements(notice({ project: { folderMissing: false }, locate })).filter((element) => element.type === 'p').length, 0);
});

test('a missing-folder card offers Locate and Remove in place of Start/Stop', () => {
  const actions = actionsBody();
  assert.match(actions, /project\.folderMissing \? \(/);
  assert.match(actions, /onClick=\{\(\) => void locate\.locate\(project\.id\)\}/);
  assert.match(actions, /onClick=\{\(\) => onRequestDelete\(project\.id\)\}/);
  // Start is not offered: `tovu serve` on a folder that is not there can only fail.
  assert.ok(actions.indexOf('project.folderMissing ? (') < actions.indexOf('card__power'), 'Locate must replace the power control, not sit beside it');
});

test('a located card replaces the missing one in the grid at once, not on the next poll', () => {
  assert.match(grid, /const locate = useLocate\(onSiteUpdated\);/);
  const hooks = fs.readFileSync(path.join(import.meta.dirname, 'App.hooks.ts'), 'utf8');
  assert.match(hooks, /\(record: SiteRecord, previousId: string = record\.id\) =>/);
  assert.match(hooks, /if \(project\.id === previousId\) return \[record\];/);
  // A Locate onto a folder that already has a card merges into it: that card must not stay twice.
  assert.match(hooks, /return project\.id === record\.id \? \[\] : \[project\];/);
});
