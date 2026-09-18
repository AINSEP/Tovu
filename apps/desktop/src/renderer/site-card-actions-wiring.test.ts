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
 * placement was before. The live check in `scripts/verify-site-power.mjs` covers what only a real
 * DOM can prove — computed style equality, and that clicking the menu entry actually opens the
 * confirm overlay rather than deleting.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const grid = fs.readFileSync(path.join(import.meta.dirname, 'SiteGrid.tsx'), 'utf8');
const css = fs.readFileSync(path.join(import.meta.dirname, 'app.css'), 'utf8');
const power = fs.readFileSync(path.join(import.meta.dirname, 'use-site-power.hooks.ts'), 'utf8');
const app = fs.readFileSync(path.join(import.meta.dirname, 'App.tsx'), 'utf8');

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
  assert.match(actions, /\{control && \(/, 'a status with no honest button renders none');
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
  const actions = actionsBody();
  assert.match(
    actions,
    /<SiteCardMenu[\s\S]*?copy=\{copy\}[\s\S]*?onRequestDelete=\{onRequestDelete\}[\s\S]*?\/>/,
    'CardActions must forward copy and onRequestDelete to the menu that now owns delete',
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
});

test('the pending mark is cleared on BOTH arms, so a failed start cannot stick on Starting…', () => {
  // The one thing this control must never do is remember its own press. There is no renderer here
  // to drive the failure arm, so the clearing is asserted structurally: it must not sit inside the
  // success branch.
  const toggle = power.slice(power.indexOf('const toggle = useCallback('), power.indexOf('return { statusOf, errorOf, toggle };'));
  assert.match(toggle, /if \(result\.error === undefined\) onSiteUpdated\?\.\(result\.record\);/);
  assert.match(toggle, /else setErrors/);
  const clear = toggle.indexOf('setPending((current) => withoutKey(current, id));');
  assert.notEqual(clear, -1, 'the pending mark must be cleared');
  assert.ok(clear > toggle.indexOf('else setErrors'), 'the clear must follow both arms, not live inside one');
});

test("main's refreshed record reaches the grid, rather than waiting on the 4s poll", () => {
  // The unwired-call-site check for the other direction: `useApplySiteRecord` could be correct and
  // simply never handed to the grid, and the only symptom would be a card four seconds stale.
  assert.match(app, /const applySiteRecord = useApplySiteRecord\(setProjects\);/);
  assert.match(app, /<SiteGrid [^>]*onSiteUpdated=\{onSiteUpdated\}/);
  assert.match(grid, /const power = usePower\(onSiteUpdated\);/);
});
