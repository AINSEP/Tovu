/**
 * @file Live verification for the sites home window's Cmd+F find bar — the behaviour no unit test
 * in this package can reach, because what it pins is CHROMIUM's, not ours.
 *
 * Not part of `npm test`: it launches a real Electron app, so it is opt-in and slow. Run it after
 * touching anything in `src/renderer/use-find-in-page.hooks.ts`, `src/find-in-page-ipc.ts`,
 * `src/find-menu.ts` or `src/contracts/find-in-page.ts`:
 *
 *   cd apps/desktop
 *   npm run build:renderer            # the window loads dist/, never src/
 *   node scripts/verify-find-in-page.mjs
 *
 * It always launches an ISOLATED instance with its own `TOVU_DESKTOP_USER_DATA_DIR`, so it never
 * touches a running app's session (this app takes no single-instance lock). Exits non-zero on the
 * first failed check and prints `FAIL::` lines; screenshots land in
 * `ADS-memory/.local-artifacts/find-enter-fix-screenshots-<date>/` unless `FIND_SHOT_DIR` says
 * otherwise.
 *
 * The load-bearing check is CHROMIUM_ANCHOR: a find issued while a caret sits in the find bar's own
 * input does NOT advance, and the same find issued with the document selection cleared DOES. That
 * is the platform behaviour `runFind`'s selection clearing exists to compensate for — if a future
 * Chromium stops anchoring on the live selection, this check fails loudly and the compensation can
 * go, rather than quietly becoming cargo cult.
 */
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const DESKTOP = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(DESKTOP, '../..');
const SHOT_DIR = process.env.FIND_SHOT_DIR ?? path.join(REPO, 'ADS-memory/.local-artifacts/find-enter-fix-screenshots-2026-09-18');
const USER_DATA = process.env.FIND_VERIFY_USERDATA ?? fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'tovu-find-verify-'));

const failures = [];
let shotN = 0;

function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}:: ${name} — ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
}

async function shot(win, name) {
  shotN += 1;
  const file = path.join(SHOT_DIR, `${String(shotN).padStart(2, '0')}-${name}.png`);
  await win.screenshot({ path: file });
  return file;
}

/** `"3 of 17"` -> `{ ordinal: 3, total: 17 }`; anything else -> `null` (no result, or "No results"). */
function parseCount(text) {
  const match = /^(\d+) of (\d+)$/.exec((text ?? '').trim());
  return match ? { ordinal: Number(match[1]), total: Number(match[2]) } : null;
}

const countText = (win) => win.evaluate(() => document.querySelector('.findbar__count')?.textContent ?? '');

/** The counter arrives asynchronously (`found-in-page` -> relay -> renderer), so the first read
 *  after typing has to wait for it rather than assume it has landed. */
async function waitForCount(win, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const parsed = parseCount(await countText(win));
    if (parsed !== null || Date.now() > deadline) return parsed;
    await win.waitForTimeout(250);
  }
}
const barOpen = (win) => win.evaluate(() => !!document.querySelector('.findbar'));
const inputState = (win) =>
  win.evaluate(() => ({
    active: document.activeElement?.className || document.activeElement?.tagName || 'none',
    value: document.querySelector('.findbar__input')?.value ?? null,
  }));

/** Opens the bar the way the app menu does — `find-menu.ts` just sends this channel. A real
 *  `Meta+F` only reaches a menu accelerator when the app owns the OS focus, which a headed test
 *  run cannot assume. */
async function openBar(app, win) {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('runner:find:toggle'));
  await win.waitForTimeout(600);
}

/** Types `text` one real key at a time with NO re-focus in between — the whole point: a search that
 *  blurs the input silently eats every character after the first, and `locator.fill()`/
 *  `locator.press()` both re-focus and would hide exactly that. */
async function typeQuery(win, text) {
  for (const character of text) {
    await win.keyboard.type(character);
    await win.waitForTimeout(350);
  }
}

/** Presses Enter `times` times with no re-focus, collecting the counter after each — and, when
 *  `shotName` is given, a screenshot per press, since "the counter advanced" is a claim worth
 *  being able to look at rather than take on trust. */
async function pressEnter(win, times, { modifier = '', shotName = null } = {}) {
  const seen = [];
  for (let i = 0; i < times; i += 1) {
    await win.keyboard.press(modifier ? `${modifier}+Enter` : 'Enter');
    await win.waitForTimeout(450);
    seen.push(parseCount(await countText(win)));
    if (shotName) await shot(win, `${shotName}-${i + 1}`);
  }
  return seen;
}

/** Every step is `previous + 1`, wrapping `total -> 1`. */
function advancesEveryStep(start, steps, total) {
  let expected = start;
  return steps.every((step) => {
    expected = (expected % total) + 1;
    return step !== null && step.ordinal === expected && step.total === total;
  });
}

async function verifyTopLevel(app, win) {
  await shot(win, 'projects-before-find');
  await openBar(app, win);
  check('BAR_OPENS', await barOpen(win), 'find bar present after the menu channel fired');

  // A query with several matches on the Projects screen. 'e' is deliberately unambitious: what is
  // under test is cycling, not matching.
  const query = 'e';
  await typeQuery(win, query);
  const afterTyping = await inputState(win);
  check('INPUT_KEEPS_FOCUS', afterTyping.active === 'findbar__input', `activeElement after typing = ${afterTyping.active}`);
  check('EVERY_KEYSTROKE_LANDS', afterTyping.value === query, `input value = ${JSON.stringify(afterTyping.value)}, typed ${JSON.stringify(query)}`);

  const start = await waitForCount(win);
  check('COUNTER_SHOWS_MATCHES', start !== null && start.total >= 3, `counter = ${JSON.stringify(await countText(win))}`);
  await shot(win, 'projects-typed');
  if (start === null || start.total < 3) return;

  const forward = await pressEnter(win, 3, { shotName: 'projects-enter' });
  check('ENTER_ADVANCES', advancesEveryStep(start.ordinal, forward, start.total), `${start.ordinal} -> ${forward.map((s) => s?.ordinal).join(' -> ')} of ${start.total}`);
  const here = parseCount(await countText(win));
  const [back] = await pressEnter(win, 1, { modifier: 'Shift', shotName: 'projects-shift-enter' });
  const expectedBack = ((here.ordinal - 2 + here.total) % here.total) + 1;
  check('SHIFT_ENTER_GOES_BACK', back !== null && back.ordinal === expectedBack, `${here.ordinal} -> ${back?.ordinal} (expected ${expectedBack}) of ${here.total}`);

  // --- CHROMIUM_ANCHOR: the platform behaviour the fix compensates for, pinned both ways. ---
  const rawFind = (forwardDirection) =>
    app.evaluate(({ BrowserWindow }, text) => {
      BrowserWindow.getAllWindows()[0].webContents.findInPage(text, { forward: true, findNext: false });
    }, forwardDirection);

  await win.evaluate(() => document.querySelector('.findbar__input')?.focus());
  await win.waitForTimeout(250);
  const anchored = parseCount(await countText(win));
  await rawFind(query);
  await win.waitForTimeout(500);
  const afterAnchoredFind = parseCount(await countText(win));
  check(
    'CHROMIUM_ANCHOR_STILL_BITES',
    afterAnchoredFind !== null && afterAnchoredFind.ordinal !== ((anchored.ordinal % anchored.total) + 1),
    `caret in the input: ${anchored.ordinal} -> ${afterAnchoredFind?.ordinal} (a plain follow-up find must NOT advance; if it does, Chromium changed and runFind's selection clearing can go)`,
  );

  await win.evaluate(() => document.querySelector('.findbar__input')?.focus());
  await win.waitForTimeout(250);
  const cleared = parseCount(await countText(win));
  await win.evaluate(() => document.getSelection()?.removeAllRanges());
  await rawFind(query);
  await win.waitForTimeout(500);
  const afterClearedFind = parseCount(await countText(win));
  check(
    'CLEARING_THE_SELECTION_IS_WHAT_FIXES_IT',
    afterClearedFind !== null && afterClearedFind.ordinal === (cleared.ordinal % cleared.total) + 1,
    `selection cleared first: ${cleared.ordinal} -> ${afterClearedFind?.ordinal} of ${cleared.total}`,
  );

  await win.keyboard.press('Escape');
  await win.waitForTimeout(400);
  check('ESCAPE_CLOSES', !(await barOpen(win)), 'find bar gone after Escape');
  await shot(win, 'projects-after-escape');
}

async function verifyGuest(app, win) {
  const card = win.locator('.card.is-openable').first();
  if ((await card.count()) === 0) {
    check('GUEST_TAB_AVAILABLE', false, 'no openable project card in this profile — the guest path went unverified');
    return;
  }
  await card.click();
  // A tab whose site server is not running yet shows a Start affordance first; it takes a moment
  // to render, so poll for it rather than assuming it is already there.
  const startButton = win.getByRole('button', { name: /^start site$/i });
  for (let i = 0; i < 12; i += 1) {
    await win.waitForTimeout(1000);
    if ((await startButton.count()) > 0) {
      await startButton.first().click();
      break;
    }
  }

  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    ready = await win.evaluate(() => {
      const guest = document.querySelector('webview');
      return !!guest && !!guest.getAttribute('src') && guest.src !== 'about:blank';
    });
    if (ready) break;
    await win.waitForTimeout(2000);
  }
  check('GUEST_ATTACHED', ready, 'a project tab webview attached with a real src');
  if (!ready) return;
  await win.waitForTimeout(6000);
  await shot(win, 'tab-loaded');

  await openBar(app, win);
  check('GUEST_BAR_OPENS', await barOpen(win), 'find bar present over the project tab');

  // Which surface did the search actually reach? A guest search never touches the WINDOW's own
  // webContents, so one `found-in-page` there means the routing fell back to the top-level target
  // while a tab was on screen — the guest would then never be searched at all.
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    globalThis.__topLevelFinds = 0;
    contents.on('found-in-page', () => {
      globalThis.__topLevelFinds += 1;
    });
  });

  const query = 'e';
  await typeQuery(win, query);
  const afterTyping = await inputState(win);
  check('GUEST_INPUT_KEEPS_FOCUS', afterTyping.active === 'findbar__input', `activeElement after typing = ${afterTyping.active}`);
  check('GUEST_EVERY_KEYSTROKE_LANDS', afterTyping.value === query, `input value = ${JSON.stringify(afterTyping.value)}`);

  const start = await waitForCount(win);
  check('GUEST_COUNTER_SHOWS_MATCHES', start !== null && start.total >= 3, `counter = ${JSON.stringify(await countText(win))}`);
  await shot(win, 'tab-typed');
  if (start === null || start.total < 3) return;

  const forward = await pressEnter(win, 3, { shotName: 'tab-enter' });
  check('GUEST_ENTER_ADVANCES', advancesEveryStep(start.ordinal, forward, start.total), `${start.ordinal} -> ${forward.map((s) => s?.ordinal).join(' -> ')} of ${start.total}`);
  const topLevelFinds = await app.evaluate(() => globalThis.__topLevelFinds ?? -1);
  check('GUEST_TARGET_IS_THE_GUEST', topLevelFinds === 0, `the window's own webContents reported ${topLevelFinds} found-in-page result(s) while a tab was on screen (must be 0)`);
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA, { recursive: true });
  console.log('USER_DATA::', USER_DATA);
  console.log('SHOT_DIR::', SHOT_DIR);

  const app = await electron.launch({
    executablePath: path.join(DESKTOP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    cwd: DESKTOP,
    env: { ...process.env, TOVU_DESKTOP_USER_DATA_DIR: USER_DATA },
  });
  try {
    const win = await app.firstWindow();
    win.on('pageerror', (error) => console.log('PAGEERROR::', error.message));
    await win.waitForLoadState('domcontentloaded');
    for (let i = 0; i < 30; i += 1) {
      if ((await win.evaluate(() => document.body.innerText)).trim().length > 0) break;
      await win.waitForTimeout(800);
    }
    await verifyTopLevel(app, win);
    if (process.env.FIND_VERIFY_SKIP_GUEST !== '1') await verifyGuest(app, win);
  } finally {
    await app.close();
  }

  if (failures.length > 0) {
    console.log(`\nVERIFY_FAILED:: ${failures.length} check(s)\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nVERIFY_OK:: every check passed');
}

main().catch((error) => {
  console.error('SCRIPT_FAILED::', error);
  process.exitCode = 1;
});
