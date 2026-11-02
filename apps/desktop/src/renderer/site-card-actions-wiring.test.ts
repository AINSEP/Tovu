/**
 * @file The card's layout rules in `app.css`, asserted as text because a stylesheet rule is only
 * checkable that way here (jsdom computes no layout). Everything the card's MARKUP owns — where each
 * control sits, the order it renders in, what it calls — is asserted on the real rendered grid in
 * `SiteGrid.jsdom.test.ts`; the live check in `scripts/verify-site-power.ts` covers what only a real
 * browser can prove (computed style equality, and that clicking the menu entry actually opens the
 * confirm overlay rather than deleting).
 *
 * **Revision (2026-09-18).** The owner saw the first layout and asked for two changes: delete moves
 * OFF the card and into the ⋮ menu (their reason is misclicks — a destructive control beside a
 * button pressed often is too easy to hit), and Start/Stop wears the header's "Create website"
 * style instead of its own look.
 *
 * **Second revision, same day.** The owner saw THAT layout and moved the controls again: the ⋮ to
 * the card's top-right, level with the site name, and Start/Stop directly beneath it. The row was a
 * COLUMN then, asserted on `.card__body`/`.card__actions`' CSS, because nothing about either
 * button's own markup changed.
 *
 * **Third revision (2026-10-06).** The ⋮ stays top-right, level with the name, but Start/Stop moves
 * to the LEFT, on its own row under the "SQLite" line, with Restart on that same row at the right
 * edge. The ⋮ therefore lives in a `.card__head` row beside the text, and `.card__actions` is the
 * button row beneath it.
 *
 * **Fourth revision, same day.** The status moves under the ⋮ on the right, "SQLite" directly under
 * the name on the left: `.card__head` is a 2x2 grid (name | ⋮, SQLite | status).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(import.meta.dirname, 'app.css'), 'utf8');

/** The body of the first `selector {…}` rule in `app.css`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} must have a rule`);
  return css.slice(start, css.indexOf('}', start));
}

test('the card head is a 2x2 grid — name | ⋮ on row 1, SQLite | status on row 2', () => {
  // Fourth revision (2026-10-06, 11:10): the owner kept the ⋮ level with the name and the buttons
  // below, but moved the status ("● Stopped") to the RIGHT, under the ⋮, with "SQLite" directly
  // under the name on the left — one row fewer. That is a property of the head's GRID, so it is
  // asserted on the head's rule here, and on the DOM order that fills it in `SiteGrid.jsdom.test.ts`.
  const head = rule('.card__head');
  assert.match(head, /display:\s*grid/);
  // `minmax(0, 1fr)`, not `1fr`: a bare `1fr` track refuses to shrink below a long name's width and
  // shoves the ⋮ off the card's right edge.
  assert.match(head, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/, 'text column left (shrinkable), ⋮/status column right');
  assert.match(rule('.card__meta'), /justify-self:\s*end/, 'the status is right-aligned under the ⋮');
  // Anything else the head says (a failure reason, "Provisioning setup", a refused start, a
  // missing folder) spans both columns below row 2 rather than squeezing into one.
  assert.match(css, /\.card__detail,\s*\.card__draft,\s*\.card__actionerror,\s*\.card__missing\s*\{\s*grid-column:\s*1 \/ -1;/);
});

test('Start/Stop sits on its own row UNDER the text, with Restart on that same row at the right edge', () => {
  // Third revision (2026-10-06): the owner moved Start/Stop out from under the ⋮ to the left, under
  // the "SQLite" line, and Restart onto that same row, aligned right. The body stacks the head above
  // the button row; the button row is a ROW, not the column it was.
  assert.match(rule('.card__body'), /flex-direction:\s*column/, 'the button row sits below the head, not beside it');
  assert.match(rule('.card__actions'), /flex-direction:\s*row/, 'Start/Stop and Restart share one row');
  for (const override of css.matchAll(/\.card__actions\s*\{([^}]*)\}/g)) {
    assert.doesNotMatch(override[1]!, /flex-direction:\s*(?!row\b)[\w-]+/, 'a later or media-query rule must not stack Start above Restart');
  }
  assert.match(rule('.card__restart'), /margin-left:\s*auto/, 'Restart is pushed to the right edge even when it is alone on the row');
});

test('no standalone trash style exists — delete lives only inside the ⋮ menu', () => {
  // The owner's requirement, reversing the earlier "trash always visible" layout: their reason is
  // misclicks, a destructive control beside a button pressed often. The rendered card is checked
  // for the control itself in `SiteGrid.jsdom.test.ts`; this keeps its style from coming back.
  assert.doesNotMatch(css, /\.card__delete\b/, 'a standalone card__delete style regressed the misclick fix');
});

test('nothing in the action row is revealed by hover — the owner asked to see the ⋮ either way', () => {
  // `opacity: 0` + `pointer-events: none` with a `:hover` counterpart is the exact pattern these
  // controls used to carry. A regression to it would be invisible in the JSX.
  for (const selector of ['.card__menubutton', '.card__power']) {
    const body = rule(selector);
    assert.doesNotMatch(body, /opacity:\s*0\b/, `${selector} must not start invisible`);
    assert.doesNotMatch(body, /pointer-events:\s*none/, `${selector} must not start unclickable`);
  }
  assert.doesNotMatch(css, /\.card:hover \.card__menubutton/, 'no hover-reveal rule may come back');
});

test('the "Create website" class the running ⏻ reuses resolves to a token, not a hand-copied colour', () => {
  // The owner's requirement was to REUSE the header's class, not eyeball a matching colour — that
  // both buttons wear `button--create` is asserted on the rendered app in
  // `App.sites-home.render.test.ts`. The class itself must resolve to a token, not a hex value.
  assert.match(css, /\.button--primary,\s*\.button--create\s*\{\s*border:\s*1px solid var\(--primary\);\s*background:\s*var\(--primary\);/);
});

test('the ⋮ menu\'s destructive entry reuses the app\'s danger tokens', () => {
  // Applied only when `deleteErasesFiles` (asserted on the rendered menu in `SiteGrid.jsdom.test.ts`);
  // the class must reuse the existing danger tokens, not a hand-copied hex value.
  assert.match(css, /\.card__menuitem--danger\s*\{\s*color:\s*var\(--danger\);\s*\}/);
  assert.match(css, /\.card__menuitem--danger:hover\s*\{\s*background:\s*var\(--danger-dim\);\s*\}/);
});
