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
 *
 * `verifyColdGuest` runs FIRST, before `verifyTopLevel` or `verifyGuest`, on a window that has not
 * run a single find yet — the one path those two phases never exercised (2026-09-18's live run
 * always warmed the window with `verifyTopLevel` first) and the one path the 2026-09-21 focus-loss
 * bug actually lived on. It types a multi-character query at human speed (80ms/key, not the other
 * phases' 350ms — see that function's own doc for why the gap matters) and checks
 * `document.hasFocus()` in addition to `activeElement`, because the bug leaves `activeElement`
 * still reporting the find input even after the page itself has lost focus.
 *
 * Every `BrowserWindow` lookup targets a `homeWindowId` captured once at startup, never
 * `BrowserWindow.getAllWindows()[0]`. `[0]` is the most-recently-CREATED window, not the app shell:
 * `main.ts`'s `captureSitePreview` opens a short-lived `show: false` window on every site start to
 * screenshot it for the project card, and that window outlives the few seconds `verifyColdGuest`
 * waits after a guest attaches. Sending the toggle to `[0]` during that overlap delivered it to the
 * hidden capture window instead — which renders the bare site page, no Tovu shell, so the find bar
 * never opened and every later assertion in the phase failed. Reproduced live, twice, with
 * `BrowserWindow.getAllWindows()` logged at the point of failure: `[{id:2, visible:false, title:
 * "<the site's own title>"}, {id:1, visible:true, title:"Tovu"}]`. `verifyGuest`'s later, warm run
 * never hit this because by then the capture window from its own site's start had long since closed.
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
 *  run cannot assume. Targets `homeWindowId` — see this file's header — not `getAllWindows()[0]`. */
async function openBar(app, win, homeWindowId) {
  await app.evaluate(
    ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.webContents.send('runner:find:toggle'),
    homeWindowId,
  );
  await win.waitForTimeout(600);
}

/** Types `text` one real key at a time with NO re-focus in between — the whole point: a search that
 *  blurs the input silently eats every character after the first, and `locator.fill()`/
 *  `locator.press()` both re-focus and would hide exactly that.
 *
 * @param msPerKey gap between keystrokes. The default 350ms is generous enough that a deferred
 *   focus-reclaim always wins its race before the next key, which is fine for the phases pinning
 *   OTHER behaviour (cycling, Escape, the Chromium anchor). `verifyColdGuest` passes a human-speed
 *   80ms instead, because that race is exactly what it exists to catch. */
async function typeQuery(win, text, msPerKey = 350) {
  for (const character of text) {
    await win.keyboard.type(character);
    await win.waitForTimeout(msPerKey);
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

async function verifyTopLevel(app, win, homeWindowId) {
  await shot(win, 'projects-before-find');
  await openBar(app, win, homeWindowId);
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
  const rawFind = (text) =>
    app.evaluate(
      ({ BrowserWindow }, { id, findText }) => {
        BrowserWindow.fromId(id)?.webContents.findInPage(findText, { forward: true, findNext: false });
      },
      { id: homeWindowId, findText: text },
    );

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

/** Opens the first openable project card and waits for its `<webview>` guest to attach with a real
 *  `src`. Shared by the cold and warm guest phases, so neither duplicates the start-button/attach
 *  poll. `available: false` means there was no card to click at all — a different failure from
 *  `attached: false` (a card existed but its guest never came up). */
async function openGuestTab(win) {
  const card = win.locator('.card.is-openable').first();
  if ((await card.count()) === 0) return { available: false, attached: false };
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

  let attached = false;
  for (let i = 0; i < 60; i += 1) {
    attached = await win.evaluate(() => {
      const guest = document.querySelector('webview');
      return !!guest && !!guest.getAttribute('src') && guest.src !== 'about:blank';
    });
    if (attached) break;
    await win.waitForTimeout(2000);
  }
  return { available: true, attached };
}

/**
 * The COLD guest path — the bug the owner actually hit. Must run FIRST, before any find has been
 * issued on this window: once the window itself has run one find (`verifyTopLevel`'s Cmd+F on the
 * Projects screen), Chromium reroutes every later guest find to the WINDOW's own find manager, and
 * it is specifically the guest's OWN find manager — the one serving THIS phase — whose result used
 * to restore no focus at all (see `use-find-in-page.hooks.ts`'s file header).
 *
 * `document.hasFocus()` is checked alongside `activeElement`, because `activeElement` alone did not
 * catch this regression: the bug leaves the host document still reporting the find input as its
 * active element even after Chromium has moved keyboard focus into the guest frame.
 */
async function verifyColdGuest(app, win, homeWindowId) {
  const { available, attached } = await openGuestTab(win);
  check('COLD_GUEST_TAB_AVAILABLE', available, 'an openable project card exists in this profile');
  if (!available) return;
  check('COLD_GUEST_ATTACHED', attached, 'a project tab webview attached with a real src, before any find has run on this window');
  if (!attached) return;
  await win.waitForTimeout(6000);
  await shot(win, 'cold-tab-loaded');

  await openBar(app, win, homeWindowId);
  check('COLD_GUEST_BAR_OPENS', await barOpen(win), 'find bar present over the project tab, window still cold');

  // 'the' rather than a site-specific word like 'site': it must be a query this test can trust to
  // MATCH regardless of which project fixture the profile happens to have (measured "No results"
  // for 'site' against the real tovu-com fixture's rendered text) — a near-universal English word,
  // still multi-character, still exercises the same one-letter-then-nothing regression.
  const query = 'the';
  await typeQuery(win, query, 80);
  const afterTyping = await inputState(win);
  const hasFocus = await win.evaluate(() => document.hasFocus());
  check('COLD_GUEST_INPUT_KEEPS_FOCUS', afterTyping.active === 'findbar__input', `activeElement after typing = ${afterTyping.active}`);
  check(
    'COLD_GUEST_EVERY_KEYSTROKE_LANDS',
    afterTyping.value === query,
    `input value = ${JSON.stringify(afterTyping.value)}, typed ${JSON.stringify(query)} — a cold guest focus theft used to drop every letter after the first`,
  );
  check(
    'COLD_GUEST_DOCUMENT_HAS_FOCUS',
    hasFocus === true,
    `document.hasFocus() = ${hasFocus} — activeElement alone does not catch a guest theft, since the host keeps reporting the input as active even after losing page focus`,
  );
  await shot(win, 'cold-tab-typed');

  const start = await waitForCount(win);
  check('COLD_GUEST_COUNTER_SHOWS_MATCHES', start !== null && start.total >= 1, `counter = ${JSON.stringify(await countText(win))}`);
  if (start === null) return;

  const forward = await pressEnter(win, 1, { shotName: 'cold-tab-enter' });
  check(
    'COLD_GUEST_ENTER_ADVANCES',
    advancesEveryStep(start.ordinal, forward, start.total),
    `${start.ordinal} -> ${forward.map((s) => s?.ordinal).join(' -> ')} of ${start.total}`,
  );

  await win.keyboard.press('Escape');
  await win.waitForTimeout(400);
  check('COLD_GUEST_ESCAPE_CLOSES', !(await barOpen(win)), 'find bar gone after Escape');

  // Back to the Projects screen so `verifyTopLevel` and `verifyGuest` start from the surface they
  // expect — the only route home (see `App.tsx`'s `TabStrip` doc: the "All" tab is not closable by
  // design). Polls for the grid to actually be back rather than a flat sleep: a fixed 400ms
  // measured as too short for `showSitesHome` to flip and `SiteGrid` to re-render its cards,
  // leaving `verifyGuest`'s own `GUEST_TAB_AVAILABLE` finding a still-transitioning, cardless grid.
  await win.locator('.tab--sites-home').click();
  for (let i = 0; i < 10; i += 1) {
    if ((await win.locator('.card.is-openable').count()) > 0) break;
    await win.waitForTimeout(300);
  }
}

async function verifyGuest(app, win, homeWindowId) {
  const { available, attached } = await openGuestTab(win);
  check('GUEST_TAB_AVAILABLE', available, 'an openable project card exists in this profile — the guest path went unverified');
  if (!available) return;
  check('GUEST_ATTACHED', attached, 'a project tab webview attached with a real src');
  if (!attached) return;
  await win.waitForTimeout(6000);
  await shot(win, 'tab-loaded');

  await openBar(app, win, homeWindowId);
  check('GUEST_BAR_OPENS', await barOpen(win), 'find bar present over the project tab');

  // WHERE a guest's find is reported is Chromium's choice, not ours, and it is not stable:
  // `WebContents::GetFindRequestManager` walks up the outer-WebContents chain and reuses the first
  // manager it finds, so once this WINDOW has run one find (the top-level phase above did), every
  // later guest find is served by the window's manager and reported on the window's own
  // `found-in-page` instead of the `<webview>`'s. Measured here, both ways. So counting window
  // results proves nothing about routing — what matters is that the guest's CONTENT was searched,
  // which the match total below establishes: the Projects screen alone reports ~12 for this query.
  await app.evaluate(({ BrowserWindow }, id) => {
    const contents = BrowserWindow.fromId(id)?.webContents;
    globalThis.__topLevelFinds = 0;
    contents?.on('found-in-page', () => {
      globalThis.__topLevelFinds += 1;
    });
  }, homeWindowId);

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
  const here = parseCount(await countText(win));
  check(
    'GUEST_CONTENT_IS_SEARCHED',
    here !== null && here.total > 30,
    `${here?.total} matches over the tab (the Projects screen alone reports ~12 for this query, so a search that reached only the shell would land there); the window's own webContents reported ${topLevelFinds} of these results, which is Chromium's find-manager reuse, not a routing fallback`,
  );
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
    // Captured once, here, while this is still the only window — see this file's header doc for why
    // every later `BrowserWindow` lookup targets this id instead of `getAllWindows()[0]`.
    const homeWindowId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id);
    if (process.env.FIND_VERIFY_SKIP_GUEST !== '1') await verifyColdGuest(app, win, homeWindowId);
    await verifyTopLevel(app, win, homeWindowId);
    if (process.env.FIND_VERIFY_SKIP_GUEST !== '1') await verifyGuest(app, win, homeWindowId);
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
