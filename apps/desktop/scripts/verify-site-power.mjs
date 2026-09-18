/**
 * @file Live verification for a site card's Start/Stop button and its always-visible action row —
 * the behaviour no unit test in this package can reach, because it ends in a real `tovu serve`
 * being spawned and drained.
 *
 * Not part of `npm test`: it launches a real Electron app and a real site server, so it is opt-in
 * and slow. Run it after touching `src/renderer/use-site-power.hooks.ts`, `src/renderer/SiteGrid.tsx`,
 * `src/project-ipc.ts`'s `handleStart`/`handleStop`, or `src/site-transitions.ts`:
 *
 *   cd apps/desktop
 *   npm run build:renderer                       # the window loads dist/, never src/
 *   SITE_POWER_SITE_DIR=<a real Tovu site> node scripts/verify-site-power.mjs
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
import path from 'node:path';
import fs from 'node:fs';

const DESKTOP = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(DESKTOP, '../..');
const SHOT_DIR =
  process.env.SITE_POWER_SHOT_DIR ??
  path.join(REPO, 'ADS-memory/.local-artifacts/site-card-actions-screenshots-2026-09-18');
const USER_DATA =
  process.env.SITE_POWER_USERDATA ?? fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'tovu-site-power-'));
const SITE_DIR = process.env.SITE_POWER_SITE_DIR;

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
  console.log(`SHOT:: ${file}`);
  return file;
}

/** Everything the first card is currently saying, read straight off the DOM. */
const cardState = (win) =>
  win.evaluate(() => {
    const card = document.querySelector('.card');
    if (!card) return null;
    const power = card.querySelector('.card__power');
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01;
    };
    return {
      className: card.className,
      status: card.querySelector('.state')?.textContent?.trim() ?? '',
      port: card.querySelector('.card__port')?.textContent?.trim() ?? null,
      power: power ? { label: power.textContent.trim(), disabled: power.disabled, visible: visible(power) } : null,
      // The two controls the owner asked to be visible without hovering. Read WITHOUT any pointer
      // over the card, which is the whole claim being checked.
      menuVisible: visible(card.querySelector('.card__menubutton')),
      trashVisible: visible(card.querySelector('.card__delete')),
      menuInTile: Boolean(card.querySelector('.card__tile .card__menu')),
      trashInTile: Boolean(card.querySelector('.card__tile .card__delete')),
      actionsInBody: Boolean(card.querySelector('.card__body .card__actions')),
      error: card.querySelector('.card__actionerror')?.textContent?.trim() ?? null,
    };
  });

/** Poll until the card's status label reads `want`, or give up. Returns the last state seen. */
async function waitForStatus(win, want, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await cardState(win);
    if (last?.status === want || Date.now() > deadline) return last;
    await win.waitForTimeout(250);
  }
}

async function setTheme(win, theme) {
  await win.evaluate((value) => localStorage.setItem('tovu-runner.theme', value), theme);
  await win.reload();
  await win.waitForSelector('.card', { timeout: 20_000 });
  await win.waitForTimeout(400);
}

async function main() {
  if (!SITE_DIR || !fs.existsSync(path.join(SITE_DIR, 'config.json'))) {
    console.log('FAIL:: SITE_POWER_SITE_DIR must name a real Tovu site directory (one with config.json)');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA, { recursive: true });
  // The seed a fresh profile cannot produce for itself: `handleList` renders this file and there is
  // no scan that would reach a site outside the scan roots.
  fs.writeFileSync(
    path.join(USER_DATA, 'desktop-projects.json'),
    JSON.stringify(
      { projects: [{ siteDir: SITE_DIR, createdAt: new Date().toISOString(), origin: 'adopted' }], dismissed: [] },
      null,
      2,
    ),
  );

  const app = await electron.launch({
    executablePath: path.join(DESKTOP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    cwd: DESKTOP,
    env: { ...process.env, TOVU_DESKTOP_USER_DATA_DIR: USER_DATA, TOVU_DESKTOP_UI: 'runner' },
  });

  try {
    const win = await app.firstWindow();
    win.on('pageerror', (error) => console.log('PAGEERROR::', error.message));
    await win.waitForLoadState('domcontentloaded');
    await win.waitForSelector('.card', { timeout: 30_000 });

    const idle = await cardState(win);
    check('CARD_SEEDED', idle !== null, `card rendered, status ${idle?.status}`);
    check(
      'ACTIONS_IN_BODY',
      idle.actionsInBody && !idle.menuInTile && !idle.trashInTile,
      `actions row in the info block (menu on preview: ${idle.menuInTile}, trash on preview: ${idle.trashInTile})`,
    );
    check(
      'ALWAYS_VISIBLE',
      idle.menuVisible && idle.trashVisible,
      `⋮ visible ${idle.menuVisible}, trash visible ${idle.trashVisible} — with no pointer over the card`,
    );
    check('POWER_OFFERS_START', idle.power?.label === 'Start', `power button reads "${idle.power?.label}"`);
    await shot(win, 'light-stopped');

    // --- the site really starts ---
    await win.click('.card__power');
    const starting = await cardState(win);
    check(
      'START_SAYS_STARTING',
      starting.power?.label === 'Starting…' && starting.power.disabled,
      `mid-start the button reads "${starting.power?.label}" (disabled: ${starting.power?.disabled})`,
    );
    await shot(win, 'light-starting');

    const running = await waitForStatus(win, 'Running', 90_000);
    check('STARTED', running.status === 'Running', `status after start: ${running.status}`);
    check('POWER_OFFERS_STOP', running.power?.label === 'Stop', `power button reads "${running.power?.label}"`);
    await shot(win, 'light-running');

    // --- and really stops ---
    await win.click('.card__power');
    const stopping = await cardState(win);
    check(
      'STOP_SAYS_STOPPING',
      stopping.power?.label === 'Stopping…' && stopping.power.disabled,
      `mid-stop the button reads "${stopping.power?.label}" (disabled: ${stopping.power?.disabled})`,
    );
    await shot(win, 'light-stopping');

    const stopped = await waitForStatus(win, 'Stopped', 30_000);
    check('STOPPED', stopped.status === 'Stopped', `status after stop: ${stopped.status}`);
    check('POWER_BACK_TO_START', stopped.power?.label === 'Start', `power button reads "${stopped.power?.label}"`);
    // The port is reassigned on every start, so a stopped card must not keep showing the one it had.
    check('NO_STALE_PORT', stopped.port === null || stopped.port === '0', `port fallback shows ${stopped.port}`);
    check('NO_ERROR', stopped.error === null, `no failure text on the card (${stopped.error})`);
    await shot(win, 'light-stopped-again');

    // --- the ⋮ menu still opens from its new home ---
    await win.click('.card__menubutton');
    const menuItems = await win.evaluate(() =>
      [...document.querySelectorAll('.card__menulist [role="menuitem"]')].map((el) => el.textContent.trim()),
    );
    check('MENU_OPENS', menuItems.length > 0, `menu items: ${menuItems.join(' | ')}`);
    check(
      'MENU_HAS_NO_LIFECYCLE',
      !menuItems.some((item) => item === 'Start' || item === 'Stop'),
      'neither Start nor Stop is duplicated in the ⋮ menu',
    );
    await shot(win, 'light-menu-open');
    await win.keyboard.press('Escape');
    await win.click('body', { position: { x: 5, y: 5 } });

    // --- dark mode ---
    await setTheme(win, 'dark');
    const dark = await cardState(win);
    check(
      'DARK_ALWAYS_VISIBLE',
      dark.menuVisible && dark.trashVisible && dark.power !== null,
      `dark mode: ⋮ ${dark.menuVisible}, trash ${dark.trashVisible}, power "${dark.power?.label}"`,
    );
    await shot(win, 'dark-stopped');
    await win.click('.card__menubutton');
    await shot(win, 'dark-menu-open');
    await win.keyboard.press('Escape');
    await win.click('body', { position: { x: 5, y: 5 } });
    await win.click('.card__power');
    const darkRunning = await waitForStatus(win, 'Running', 90_000);
    check('DARK_STARTED', darkRunning.status === 'Running', `dark mode status after start: ${darkRunning.status}`);
    await shot(win, 'dark-running');
    await win.click('.card__power');
    const darkStopped = await waitForStatus(win, 'Stopped', 30_000);
    check('DARK_STOPPED', darkStopped.status === 'Stopped', `dark mode status after stop: ${darkStopped.status}`);
    await shot(win, 'dark-stopped-again');
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
