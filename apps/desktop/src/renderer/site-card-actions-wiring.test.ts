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
 * The owner's requirement is specific and testable: the ⋮ and the trash must be in the card's info
 * block and visible WITHOUT hovering. Both halves are asserted below — placement from the JSX,
 * always-visible from the stylesheet — plus the live check in `scripts/verify-site-power.mjs`,
 * which reads the real computed opacity with no pointer over the card.
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

test('the actions row is in the card BODY, and the preview tile carries nothing but the preview', () => {
  const body = cardBody();
  const tile = body.slice(body.indexOf('<div className="card__tile">'), body.indexOf('<div className="card__body">'));
  assert.doesNotMatch(tile, /card__menu|SiteCardMenu|card__delete/, 'no action control may sit on the screenshot');
  assert.match(body, /<div className="card__body">[\s\S]*<CardActions/, 'CardActions belongs to the info block');
});

test('nothing in the action row is revealed by hover — the owner asked to see it either way', () => {
  // `opacity: 0` + `pointer-events: none` with a `:hover` counterpart is the exact pattern these
  // two controls used to carry. A regression to it would be invisible in the JSX.
  for (const selector of ['.card__delete', '.card__menubutton', '.card__power']) {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `${selector} must have a rule`);
    const rule = css.slice(start, css.indexOf('}', start));
    assert.doesNotMatch(rule, /opacity:\s*0\b/, `${selector} must not start invisible`);
    assert.doesNotMatch(rule, /pointer-events:\s*none/, `${selector} must not start unclickable`);
  }
  assert.doesNotMatch(css, /\.card:hover \.card__(delete|menubutton)/, 'no hover-reveal rule may come back');
});

test('both icon-only controls carry an accessible name, since neither has visible text', () => {
  const actions = actionsBody();
  assert.match(actions, /className="card__delete"[\s\S]*?aria-label=\{copy\.cardButtonLabel\}/);
  // The ⋮ button's own label lives in `SiteCardMenu`; assert it from there.
  assert.match(grid, /className="card__menubutton"[\s\S]*?aria-label=\{`More actions for \$\{project\.displayName\}`\}/);
  // The row itself is a labelled group, not a bare div with handlers on it.
  assert.match(actions, /role="group"[\s\S]*?aria-label=\{`Actions for \$\{project\.displayName\}`\}/);
});

test('the power button calls power.toggle and renders the label powerControl decided', () => {
  const actions = actionsBody();
  assert.match(actions, /const control = powerControl\(status\);/);
  assert.match(actions, /className="card__power"[\s\S]*?onClick=\{\(\) => void power\.toggle\(project\)\}/);
  assert.match(actions, /disabled=\{control\.action === null\}/, 'a busy control must be inert, not merely dimmed');
  assert.match(actions, /\{control\.label\}/, 'the label must come from the control, never from what was clicked');
  assert.match(actions, /\{control && \(/, 'a status with no honest button renders none');
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
  // The trash keeps its own stopper as well, because a leak there erases a site directory.
  assert.match(actions, /onClick=\{cardDeleteClick\(onRequestDelete, project\.id\)\}/);
});

test('delete still goes through the confirm overlay — a permanently visible trash makes that MORE load-bearing', () => {
  const actions = actionsBody();
  assert.match(actions, /onRequestDelete/, 'the trash must request a confirmation, never delete directly');
  assert.doesNotMatch(actions, /onConfirmDelete|onDelete\(/, 'no path from the trash icon straight to the delete');
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
