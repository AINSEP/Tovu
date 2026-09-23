/**
 * @file Live verification for a site card's Start/Stop button and its action row — the behaviour no
 * unit test in this package can reach, because it ends in a real `tovu serve` being spawned and
 * drained.
 *
 * **Revision (2026-09-18):** delete moved OFF the card and into the ⋮ menu — the owner's own reason
 * is misclicks, a destructive control beside a button pressed often. Only the ⋮ trigger is now
 * always-visible without hovering; the trash is checked ABSENT at top level and present only once
 * the menu is opened, and a click through it still lands on the same confirm overlay rather than
 * deleting directly. Start/Stop was also restyled to the header's "Create website" look
 * (`.button--create`), checked here by comparing computed styles rather than trusting a class name.
 *
 * **Second revision, same day.** The owner moved the controls again after seeing that layout: the
 * ⋮ to the card's top-right, level with the site name, and Start/Stop directly beneath it. The
 * card body is two columns now (`.card__info` and `.card__actions`). Everything above still holds —
 * nothing about what either control DOES changed — and `LAYOUT_*` below adds the three geometric
 * claims that only a laid-out window can settle, read from `getBoundingClientRect` rather than from
 * pixels: a screenshot cannot tell a right-aligned column from one that merely looks flush.
 *
 * Not part of `npm test`: it launches a real Electron app and a real site server, so it is opt-in
 * and slow. Run it after touching `src/renderer/use-site-power.hooks.ts`, `src/renderer/SiteGrid.tsx`,
 * `src/project-ipc.ts`'s `handleStart`/`handleStop`, or `src/site-transitions.ts`:
 *
 *   cd apps/desktop
 *   npm run build:renderer                       # the window loads dist/, never src/
 *   SITE_POWER_SITE_DIR=<a real Tovu site> node scripts/verify-site-power.ts
 *
 * It always launches an ISOLATED instance with its own `TOVU_DESKTOP_USER_DATA_DIR`, so it never
 * touches a running app's session (this app takes no single-instance lock), and it SEEDS that
 * profile's `desktop-projects.json` itself — a fresh profile has no projects and no scan would find
 * one outside the scan roots, so without the seed the Websites screen is simply empty.
 *
 * `SITE_POWER_SITE_DIR` must be a site nothing else is serving. The site it names really is booted
 * and really is stopped; pointing it at a site another app instance has open would leave two
 * `tovu serve` children on one content.db.
 *
 * Screenshots land in `ADS-memory/.local-artifacts/site-card-actions-screenshots-<date>/` unless
 * `SITE_POWER_SHOT_DIR` says otherwise. Exits non-zero on the first failed check.
 */
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const DESKTOP = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(DESKTOP, '../..');
const SHOT_DIR =
  process.env.SITE_POWER_SHOT_DIR ??
  path.join(REPO, 'ADS-memory/.local-artifacts/site-card-actions-v2-screenshots-2026-09-18');
const USER_DATA =
  process.env.SITE_POWER_USERDATA ?? fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'tovu-site-power-'));
const SITE_DIR = process.env.SITE_POWER_SITE_DIR;

/** A laid-out element's edges, from `getBoundingClientRect`. */
interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Everything the first card is currently saying — see `cardState`. */
interface CardState {
  className: string;
  name: string | null;
  status: string;
  port: string | null;
  power: { label: string; disabled: boolean; visible: boolean } | null;
  menuVisible: boolean;
  menuInTile: boolean;
  trashOnCard: boolean;
  actionsInBody: boolean;
  layout: { name: Box | null; menu: Box | null; power: Box | null; info: Box | null };
  error: string | null;
}

/** One geometric claim's verdict, with the pixels that decided it. */
interface Claim {
  ok: boolean;
  why: string;
}

interface LayoutClaims {
  onNameRow: Claim;
  sharedRightEdge: Claim;
  powerBelowMenu: Claim;
}

const MISSING_BOX: Claim = { ok: false, why: 'card is missing a name, a ⋮ or a text column' };
/** What `layoutClaims` reports when there is no layout to read: every claim fails, and says why. */
const NO_LAYOUT: LayoutClaims = { onNameRow: MISSING_BOX, sharedRightEdge: MISSING_BOX, powerBelowMenu: MISSING_BOX };

const failures: string[] = [];
let shotN = 0;

function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}:: ${name} — ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
}

async function shot(win: Page, name: string): Promise<string> {
  shotN += 1;
  const file = path.join(SHOT_DIR, `${String(shotN).padStart(2, '0')}-${name}.png`);
  await win.screenshot({ path: file });
  console.log(`SHOT:: ${file}`);
  return file;
}

/** Everything the first card is currently saying, read straight off the DOM. The small helpers are
 *  declared INSIDE the evaluated function because Playwright serializes it into the page, where
 *  nothing from this module's scope exists. */
const cardState = (win: Page): Promise<CardState | null> =>
  win.evaluate((): CardState | null => {
    const card = document.querySelector('.card');
    if (!card) return null;
    const text = (sel: string): string | null => card.querySelector(sel)?.textContent?.trim() ?? null;
    const has = (sel: string): boolean => card.querySelector(sel) !== null;
    const visible = (el: Element | null): boolean => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01;
    };
    // `null` for anything absent so a missing element reads as a failed check rather than a thrown
    // script.
    const box = (sel: string): Box | null => {
      const el = card.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top, right: b.right, bottom: b.bottom, left: b.left };
    };
    const power = card.querySelector<HTMLButtonElement>('.card__power');
    return {
      className: card.className,
      // Which site this card is actually about. Read so the run can prove, BEFORE it clicks Start,
      // that the card it is driving is the scratch site it seeded — see `CARD_IS_SEEDED_SITE`.
      name: text('.card__name'),
      status: text('.state') ?? '',
      port: text('.card__port'),
      power: power ? { label: (power.textContent ?? '').trim(), disabled: power.disabled, visible: visible(power) } : null,
      // The one control the owner asked to be visible without hovering, now that delete no longer
      // sits beside it. Read WITHOUT any pointer over the card, which is the whole claim being
      // checked.
      menuVisible: visible(card.querySelector('.card__menubutton')),
      menuInTile: has('.card__tile .card__menu'),
      // Must be absent at the TOP level of the card — delete lives only inside the closed ⋮ menu.
      trashOnCard: has('.card__delete'),
      actionsInBody: has('.card__body .card__actions'),
      // The owner's layout, as boxes.
      layout: { name: box('.card__name'), menu: box('.card__menubutton'), power: box('.card__power'), info: box('.card__info') },
      error: text('.card__actionerror'),
    };
  });

/** "align dotes with tovu-com" — the ⋮ sits on the same row as the name, not under it. */
function onNameRow(name: Box, menu: Box, info: Box): Claim {
  return {
    ok: Math.abs(menu.top - name.top) <= 4 && menu.left >= info.right,
    why: `⋮ top ${menu.top.toFixed(1)} vs name top ${name.top.toFixed(1)}; ⋮ left ${menu.left.toFixed(1)} vs text column right ${info.right.toFixed(1)}`,
  };
}

/** "right aligned in the card" — the ⋮ and Start/Stop share ONE edge, the card's. */
function sharedRightEdge(menu: Box, power: Box | null): Claim {
  if (power === null) return { ok: true, why: 'no power button for this status' };
  return {
    ok: Math.abs(menu.right - power.right) <= 1,
    why: `⋮ right ${menu.right.toFixed(1)} vs power right ${power.right.toFixed(1)}`,
  };
}

/** "have stop button right under it" — below the ⋮, never beside it. */
function powerBelowMenu(menu: Box, power: Box | null): Claim {
  if (power === null) return { ok: true, why: 'no power button for this status' };
  return {
    ok: power.top >= menu.bottom - 1,
    why: `power top ${power.top.toFixed(1)} vs ⋮ bottom ${menu.bottom.toFixed(1)}`,
  };
}

/**
 * The three geometric claims the owner's second layout makes, each with the tolerance that belongs
 * to it: sub-pixel rounding for two edges that must line up, and a real gap where one element sits
 * under another. Returns a reason per claim rather than a bare boolean, so a failure names the
 * pixels rather than sending the reader back to the screenshot.
 */
function layoutClaims(state: CardState | null): LayoutClaims {
  const layout = state === null ? null : state.layout;
  if (!layout || !layout.name || !layout.menu || !layout.info) return NO_LAYOUT;
  return {
    onNameRow: onNameRow(layout.name, layout.menu, layout.info),
    sharedRightEdge: sharedRightEdge(layout.menu, layout.power),
    powerBelowMenu: powerBelowMenu(layout.menu, layout.power),
  };
}

/** True when every one of `layoutClaims`' three claims holds. */
function allLayoutClaimsHold(claims: LayoutClaims): boolean {
  return claims.onNameRow.ok && claims.sharedRightEdge.ok && claims.powerBelowMenu.ok;
}

/** A card state with the optional parts flattened out, so the checks below read plain fields
 *  instead of chaining through a possibly-absent card and a possibly-absent power button. Every
 *  field is `undefined` when there was no card at all. */
interface FlatCard {
  name?: string | null;
  status?: string;
  port?: string | null;
  error?: string | null;
  menuVisible?: boolean;
  menuInTile?: boolean;
  trashOnCard?: boolean;
  actionsInBody?: boolean;
  label?: string;
  disabled?: boolean;
  hasPower?: boolean;
}

function flat(state: CardState | null): FlatCard {
  if (state === null) return {};
  const { power, ...rest } = state;
  return { ...rest, label: power?.label, disabled: power?.disabled, hasPower: power !== null };
}

/** Computed style of the card's power button versus the header's "Create website" button — the
 *  live proof that Start/Stop actually wears that style rather than merely sharing a class name
 *  that some other rule overrides. */
const powerMatchesCreate = (win: Page) =>
  win.evaluate(() => {
    const power = document.querySelector('.card__power');
    const create = document.querySelector('.button--create');
    if (!power || !create) {
      return { found: false, sameBackground: false, sameBorderColor: false, sameFontWeight: false, powerBg: 'absent', createBg: 'absent' };
    }
    const p = getComputedStyle(power);
    const c = getComputedStyle(create);
    return {
      found: true,
      sameBackground: p.backgroundColor === c.backgroundColor,
      sameBorderColor: p.borderColor === c.borderColor,
      sameFontWeight: p.fontWeight === c.fontWeight,
      powerBg: p.backgroundColor,
      createBg: c.backgroundColor,
    };
  });

/** Poll until the card's status label reads `want`, or give up. Returns the last state seen. */
async function waitForStatus(win: Page, want: string, timeoutMs: number): Promise<CardState | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const last = await cardState(win);
    if (last?.status === want || Date.now() > deadline) return last;
    await win.waitForTimeout(250);
  }
}

async function setTheme(win: Page, theme: string): Promise<void> {
  await win.evaluate((value) => localStorage.setItem('tovu-runner.theme', value), theme);
  await win.reload();
  await win.waitForSelector('.card', { timeout: 20_000 });
  await win.waitForTimeout(400);
}

/** Validates `SITE_POWER_SITE_DIR` and seeds the isolated profile with it. Returns the site's
 *  display name, or `null` (after printing the FAIL line) when the directory is not a real site. */
function seedProfile(siteDir: string | undefined): string | null {
  if (!siteDir || !fs.existsSync(path.join(siteDir, 'config.json'))) {
    console.log('FAIL:: SITE_POWER_SITE_DIR must name a real Tovu site directory (one with config.json)');
    return null;
  }
  // The display name the seeded card must carry, read from the site's own config.json rather than
  // passed in a second env var that could disagree with it. `CARD_IS_SEEDED_SITE` below is the
  // reason this exists.
  const expectedSiteName = (JSON.parse(fs.readFileSync(path.join(siteDir, 'config.json'), 'utf8')) as { name: string }).name;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA, { recursive: true });
  // The seed a fresh profile cannot produce for itself: `handleList` renders this file and there is
  // no scan that would reach a site outside the scan roots.
  fs.writeFileSync(
    path.join(USER_DATA, 'desktop-projects.json'),
    JSON.stringify(
      { projects: [{ siteDir, createdAt: new Date().toISOString(), origin: 'adopted' }], dismissed: [] },
      null,
      2,
    ),
  );
  return expectedSiteName;
}

/** Reads the first card and refuses to go on unless it is the seeded site. Throws — ending the
 *  run — when it is not.
 *
 * Every check after this reads `document.querySelector('.card')` — the FIRST card — and this script
 * goes on to really start and really stop whatever site that card is about. The seeded profile is
 * not the only thing that puts cards on this screen: `rescanSites` adopts every site under the
 * app's scan roots at boot, which on a dev checkout means the repo's own `sites/` — the operator's
 * real site, very possibly already being served by their own running app. Two `tovu serve`
 * children on one content.db is not a thing to discover from a screenshot afterwards, so the run
 * stops here rather than clicking Start on a card it cannot name. */
async function requireSeededCard(win: Page, expectedSiteName: string): Promise<CardState> {
  const idle = await cardState(win);
  const seen = flat(idle);
  check('CARD_SEEDED', idle !== null, `card rendered, status ${seen.status}`);
  check(
    'CARD_IS_SEEDED_SITE',
    seen.name === expectedSiteName,
    `first card is "${seen.name}", seeded site's config.json says "${expectedSiteName}"`,
  );
  if (idle === null || idle.name !== expectedSiteName) {
    throw new Error(
      `refusing to drive a card this run did not seed: first card is "${seen.name}", expected "${expectedSiteName}" (${SITE_DIR})`,
    );
  }
  return idle;
}

/** The three `LAYOUT_*` checks for one card state. */
function checkLayout(claims: LayoutClaims): void {
  check('LAYOUT_KEBAB_ON_NAME_ROW', claims.onNameRow.ok, claims.onNameRow.why);
  check('LAYOUT_SHARED_RIGHT_EDGE', claims.sharedRightEdge.ok, claims.sharedRightEdge.why);
  check('LAYOUT_POWER_BELOW_KEBAB', claims.powerBelowMenu.ok, claims.powerBelowMenu.why);
}

/** The stopped card, before anything is clicked: it is the seeded site, its controls sit where the
 *  owner put them, and Start wears the "Create website" style. */
async function verifyIdleCard(win: Page, expectedSiteName: string): Promise<void> {
  const idle = await requireSeededCard(win, expectedSiteName);
  check(
    'ACTIONS_IN_BODY',
    idle.actionsInBody && !idle.menuInTile,
    `actions row in the info block (menu on preview: ${idle.menuInTile})`,
  );
  check('ALWAYS_VISIBLE', idle.menuVisible, `⋮ visible ${idle.menuVisible} — with no pointer over the card`);
  check(
    'NO_TOP_LEVEL_TRASH',
    !idle.trashOnCard,
    `a standalone .card__delete exists on the card outside the ⋮ menu (${idle.trashOnCard})`,
  );
  checkLayout(layoutClaims(idle));
  const label = flat(idle).label;
  check('POWER_OFFERS_START', label === 'Start', `power button reads "${label}"`);
  const startStyle = await powerMatchesCreate(win);
  check(
    'POWER_MATCHES_CREATE_STYLE',
    startStyle.found && startStyle.sameBackground && startStyle.sameBorderColor && startStyle.sameFontWeight,
    `power bg ${startStyle.powerBg} vs create bg ${startStyle.createBg} (border match: ${startStyle.sameBorderColor}, weight match: ${startStyle.sameFontWeight})`,
  );
  await shot(win, 'light-stopped');
}

/** Clicks the power button and checks the mid-transition label (`Starting…`/`Stopping…`) and that
 *  the button is disabled while it lasts. */
async function clickPowerExpectingTransition(win: Page, checkName: string, label: string, verb: string): Promise<void> {
  await win.click('.card__power');
  const mid = flat(await cardState(win));
  check(
    checkName,
    mid.label === label && mid.disabled === true,
    `mid-${verb} the button reads "${mid.label}" (disabled: ${mid.disabled})`,
  );
}

/** Clicks Start and waits for Running; the card offers Stop and keeps its layout with the wider
 *  label in place. */
async function verifyStarted(win: Page): Promise<void> {
  await clickPowerExpectingTransition(win, 'START_SAYS_STARTING', 'Starting…', 'start');
  await shot(win, 'light-starting');

  const runningState = await waitForStatus(win, 'Running', 90_000);
  const running = flat(runningState);
  check('STARTED', running.status === 'Running', `status after start: ${running.status}`);
  check('POWER_OFFERS_STOP', running.label === 'Stop', `power button reads "${running.label}"`);
  // Re-read with the WIDER label in place: "Stop" is a bigger box than "Start", and a column that
  // only lines up around the narrow one is not right-aligned, it is coincidental.
  const runningLayout = layoutClaims(runningState);
  check(
    'LAYOUT_HOLDS_WITH_STOP',
    allLayoutClaimsHold(runningLayout),
    `with "Stop" — ${runningLayout.sharedRightEdge.why}; ${runningLayout.powerBelowMenu.why}`,
  );
  await shot(win, 'light-running');
}

/** Clicks Stop and waits for Stopped; the card offers Start again with no stale port or error. */
async function verifyStopped(win: Page): Promise<void> {
  await clickPowerExpectingTransition(win, 'STOP_SAYS_STOPPING', 'Stopping…', 'stop');
  await shot(win, 'light-stopping');

  const stopped = flat(await waitForStatus(win, 'Stopped', 30_000));
  check('STOPPED', stopped.status === 'Stopped', `status after stop: ${stopped.status}`);
  check('POWER_BACK_TO_START', stopped.label === 'Start', `power button reads "${stopped.label}"`);
  // The port is reassigned on every start, so a stopped card must not keep showing the one it had.
  check('NO_STALE_PORT', stopped.port == null || stopped.port === '0', `port fallback shows ${stopped.port}`);
  check('NO_ERROR', stopped.error == null, `no failure text on the card (${stopped.error})`);
  await shot(win, 'light-stopped-again');
}

/** New risk from the ⋮ moving to the TOP of the body: `.card` clips to its rounded corners, and
 *  the list opens upward over the preview tile. Too tall a list, or a trigger that drifts back
 *  down, and the top of the menu is silently cut off — a screenshot shows a shorter menu, not an
 *  obviously broken one, so this is read from boxes. */
async function checkMenuNotClipped(win: Page): Promise<void> {
  const menuClip = await win.evaluate(() => {
    const list = document.querySelector('.card__menulist');
    const card = document.querySelector('.card');
    if (!list || !card) return null;
    const l = list.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return { listTop: l.top, listBottom: l.bottom, cardTop: c.top, cardBottom: c.bottom };
  });
  check(
    'MENU_LIST_NOT_CLIPPED',
    menuClip !== null && menuClip.listTop >= menuClip.cardTop && menuClip.listBottom <= menuClip.cardBottom,
    menuClip === null
      ? 'no open menu list to measure'
      : `list ${menuClip.listTop.toFixed(1)}–${menuClip.listBottom.toFixed(1)} inside card ${menuClip.cardTop.toFixed(1)}–${menuClip.cardBottom.toFixed(1)}`,
  );
}

/** The seeded site is adopted (origin: 'adopted'), so its entry must read as the SAFE branch —
 *  plain text, not the danger styling erasing-file deletes get — and clicking it must still land
 *  on the confirm overlay rather than deleting straight away. Cancels, so the scratch site stays
 *  intact for any rerun of this script. */
async function verifyDeleteEntry(win: Page): Promise<void> {
  const deleteEntry = await win.evaluate(() => {
    const item = [...document.querySelectorAll('.card__menulist [role="menuitem"]')].find((el) =>
      /Delete|Remove from Projects/.test(el.textContent ?? ''),
    );
    return item ? { text: (item.textContent ?? '').trim(), danger: item.classList.contains('card__menuitem--danger') } : null;
  });
  check(
    'ADOPTED_SITE_ENTRY_NOT_DANGER_STYLED',
    deleteEntry?.text === 'Remove from Projects…' && !deleteEntry.danger,
    `entry "${deleteEntry?.text}", danger class present: ${deleteEntry?.danger}`,
  );
  await win.click('.card__menulist [role="menuitem"]:has-text("Remove from Projects")');
  const confirmShown = await win.evaluate(() => document.querySelector('.card__confirm') !== null);
  check('DELETE_ENTRY_OPENS_CONFIRM', confirmShown, 'clicking the menu entry must open the confirm overlay, not delete directly');
  await shot(win, 'light-menu-delete-confirm');
  await win.click('.card__confirmacts .button--quiet');
  const confirmDismissed = await win.evaluate(() => document.querySelector('.card__confirm') === null);
  check('CONFIRM_CANCEL_DISMISSES', confirmDismissed, 'Cancel must close the overlay without deleting');
}

/** Closes an open ⋮ menu the way a user would: Escape, then a click on empty page. */
async function closeMenu(win: Page): Promise<void> {
  await win.keyboard.press('Escape');
  await win.click('body', { position: { x: 5, y: 5 } });
}

/** The ⋮ menu still opens from its new home, and now carries delete. */
async function verifyMenu(win: Page): Promise<void> {
  await win.click('.card__menubutton');
  // The menu's background is theme-derived (`var(--surface)`), and screenshotting in the same
  // tick as the click can catch the freshly-mounted popover before that paints — a genuine paint
  // race, not a styling bug: `getComputedStyle` on it is correct even in the same tick a
  // screenshot taken then is not. The wait is for the SHOT below to be trustworthy, not for the
  // checks, which already read computed truth.
  await win.waitForTimeout(150);
  const menuItems = await win.evaluate(() =>
    [...document.querySelectorAll('.card__menulist [role="menuitem"]')].map((el) => (el.textContent ?? '').trim()),
  );
  check('MENU_OPENS', menuItems.length > 0, `menu items: ${menuItems.join(' | ')}`);
  await checkMenuNotClipped(win);
  check(
    'MENU_HAS_NO_LIFECYCLE',
    !menuItems.some((item) => item === 'Start' || item === 'Stop'),
    'neither Start nor Stop is duplicated in the ⋮ menu',
  );
  check(
    'MENU_HAS_DELETE_ENTRY',
    menuItems.some((item) => item === 'Delete…' || item === 'Remove from Projects…'),
    `menu items: ${menuItems.join(' | ')}`,
  );
  await shot(win, 'light-menu-open');
  await verifyDeleteEntry(win);
  await closeMenu(win);
}

/** Dark mode: the same controls stay visible and laid out, and the site still starts and stops. */
async function verifyDark(win: Page): Promise<void> {
  await setTheme(win, 'dark');
  const darkState = await cardState(win);
  const dark = flat(darkState);
  check(
    'DARK_ALWAYS_VISIBLE',
    dark.menuVisible === true && dark.trashOnCard === false && dark.hasPower === true,
    `dark mode: ⋮ ${dark.menuVisible}, top-level trash present ${dark.trashOnCard}, power "${dark.label}"`,
  );
  const darkLayout = layoutClaims(darkState);
  check('DARK_LAYOUT_HOLDS', allLayoutClaimsHold(darkLayout), `dark mode — ${darkLayout.onNameRow.why}`);
  await shot(win, 'dark-stopped');
  await win.click('.card__menubutton');
  await win.waitForTimeout(150); // see the identical wait in `verifyMenu` — the same paint race.
  await shot(win, 'dark-menu-open');
  await closeMenu(win);
  await win.click('.card__power');
  const darkRunning = flat(await waitForStatus(win, 'Running', 90_000));
  check('DARK_STARTED', darkRunning.status === 'Running', `dark mode status after start: ${darkRunning.status}`);
  await shot(win, 'dark-running');
  await win.click('.card__power');
  const darkStopped = flat(await waitForStatus(win, 'Stopped', 30_000));
  check('DARK_STOPPED', darkStopped.status === 'Stopped', `dark mode status after stop: ${darkStopped.status}`);
  await shot(win, 'dark-stopped-again');
}

function launchIsolatedApp(): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: path.join(DESKTOP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    cwd: DESKTOP,
    env: { ...process.env, TOVU_DESKTOP_USER_DATA_DIR: USER_DATA, TOVU_DESKTOP_UI: 'runner' },
  });
}

async function main(): Promise<void> {
  const expectedSiteName = seedProfile(SITE_DIR);
  if (expectedSiteName === null) {
    process.exitCode = 1;
    return;
  }

  const app = await launchIsolatedApp();
  try {
    const win = await app.firstWindow();
    win.on('pageerror', (error) => console.log('PAGEERROR::', error.message));
    await win.waitForLoadState('domcontentloaded');
    await win.waitForSelector('.card', { timeout: 30_000 });
    await verifyIdleCard(win, expectedSiteName);
    await verifyStarted(win);
    await verifyStopped(win);
    await verifyMenu(win);
    await verifyDark(win);
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

await main();
