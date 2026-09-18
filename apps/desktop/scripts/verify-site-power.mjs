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
  path.join(REPO, 'ADS-memory/.local-artifacts/site-card-actions-v2-screenshots-2026-09-18');
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
      // Which site this card is actually about. Read so the run can prove, BEFORE it clicks Start,
      // that the card it is driving is the scratch site it seeded — see `CARD_IS_SEEDED_SITE`.
      name: card.querySelector('.card__name')?.textContent?.trim() ?? null,
      status: card.querySelector('.state')?.textContent?.trim() ?? '',
      port: card.querySelector('.card__port')?.textContent?.trim() ?? null,
      power: power ? { label: power.textContent.trim(), disabled: power.disabled, visible: visible(power) } : null,
      // The one control the owner asked to be visible without hovering, now that delete no longer
      // sits beside it. Read WITHOUT any pointer over the card, which is the whole claim being
      // checked.
      menuVisible: visible(card.querySelector('.card__menubutton')),
      menuInTile: Boolean(card.querySelector('.card__tile .card__menu')),
      // Must be absent at the TOP level of the card — delete lives only inside the closed ⋮ menu.
      trashOnCard: Boolean(card.querySelector('.card__delete')),
      actionsInBody: Boolean(card.querySelector('.card__body .card__actions')),
      // The owner's layout, as boxes. `null` for anything absent so a missing element reads as a
      // failed check rather than a thrown script.
      layout: (() => {
        const box = (sel) => {
          const el = card.querySelector(sel);
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { top: b.top, right: b.right, bottom: b.bottom, left: b.left };
        };
        return { name: box('.card__name'), menu: box('.card__menubutton'), power: box('.card__power'), info: box('.card__info') };
      })(),
      error: card.querySelector('.card__actionerror')?.textContent?.trim() ?? null,
    };
  });

/**
 * The three geometric claims the owner's second layout makes, each with the tolerance that belongs
 * to it: sub-pixel rounding for two edges that must line up, and a real gap where one element sits
 * under another. Returns a reason per claim rather than a bare boolean, so a failure names the
 * pixels rather than sending the reader back to the screenshot.
 */
function layoutClaims(layout) {
  const { name, menu, power, info } = layout ?? {};
  if (!name || !menu || !info) return null;
  return {
    // "align dotes with tovu-com" — same row as the name, not under it.
    onNameRow: {
      ok: Math.abs(menu.top - name.top) <= 4 && menu.left >= info.right,
      why: `⋮ top ${menu.top.toFixed(1)} vs name top ${name.top.toFixed(1)}; ⋮ left ${menu.left.toFixed(1)} vs text column right ${info.right.toFixed(1)}`,
    },
    // "right aligned in the card" — the ⋮ and Start/Stop share ONE edge, the card's.
    sharedRightEdge: {
      ok: power === null || Math.abs(menu.right - power.right) <= 1,
      why: power === null ? 'no power button for this status' : `⋮ right ${menu.right.toFixed(1)} vs power right ${power.right.toFixed(1)}`,
    },
    // "have stop button right under it" — below the ⋮, never beside it.
    powerBelowMenu: {
      ok: power === null || power.top >= menu.bottom - 1,
      why: power === null ? 'no power button for this status' : `power top ${power.top.toFixed(1)} vs ⋮ bottom ${menu.bottom.toFixed(1)}`,
    },
  };
}

/** Computed style of the card's power button versus the header's "Create website" button — the
 *  live proof that Start/Stop actually wears that style rather than merely sharing a class name
 *  that some other rule overrides. */
const powerMatchesCreate = (win) =>
  win.evaluate(() => {
    const power = document.querySelector('.card__power');
    const create = document.querySelector('.button--create');
    if (!power || !create) return null;
    const p = getComputedStyle(power);
    const c = getComputedStyle(create);
    return {
      sameBackground: p.backgroundColor === c.backgroundColor,
      sameBorderColor: p.borderColor === c.borderColor,
      sameFontWeight: p.fontWeight === c.fontWeight,
      powerBg: p.backgroundColor,
      createBg: c.backgroundColor,
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
  // The display name the seeded card must carry, read from the site's own config.json rather than
  // passed in a second env var that could disagree with it. `CARD_IS_SEEDED_SITE` below is the
  // reason this exists.
  const expectedSiteName = JSON.parse(fs.readFileSync(path.join(SITE_DIR, 'config.json'), 'utf8')).name;
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
    // Every check below reads `document.querySelector('.card')` — the FIRST card — and this script
    // goes on to really start and really stop whatever site that card is about. The seeded profile
    // is not the only thing that puts cards on this screen: `rescanSites` adopts every site under
    // the app's scan roots at boot, which on a dev checkout means the repo's own `sites/` — the
    // operator's real site, very possibly already being served by their own running app. Two `tovu
    // serve` children on one content.db is not a thing to discover from a screenshot afterwards, so
    // the run stops here rather than clicking Start on a card it cannot name.
    check(
      'CARD_IS_SEEDED_SITE',
      idle?.name === expectedSiteName,
      `first card is "${idle?.name}", seeded site's config.json says "${expectedSiteName}"`,
    );
    if (idle?.name !== expectedSiteName) {
      throw new Error(
        `refusing to drive a card this run did not seed: first card is "${idle?.name}", expected "${expectedSiteName}" (${SITE_DIR})`,
      );
    }
    check(
      'ACTIONS_IN_BODY',
      idle.actionsInBody && !idle.menuInTile,
      `actions row in the info block (menu on preview: ${idle.menuInTile})`,
    );
    check(
      'ALWAYS_VISIBLE',
      idle.menuVisible,
      `⋮ visible ${idle.menuVisible} — with no pointer over the card`,
    );
    check(
      'NO_TOP_LEVEL_TRASH',
      !idle.trashOnCard,
      `a standalone .card__delete exists on the card outside the ⋮ menu (${idle.trashOnCard})`,
    );
    const layout = layoutClaims(idle.layout);
    check('LAYOUT_KEBAB_ON_NAME_ROW', Boolean(layout?.onNameRow.ok), layout?.onNameRow.why ?? 'card is missing a name, a ⋮ or a text column');
    check('LAYOUT_SHARED_RIGHT_EDGE', Boolean(layout?.sharedRightEdge.ok), layout?.sharedRightEdge.why ?? 'no layout to read');
    check('LAYOUT_POWER_BELOW_KEBAB', Boolean(layout?.powerBelowMenu.ok), layout?.powerBelowMenu.why ?? 'no layout to read');
    check('POWER_OFFERS_START', idle.power?.label === 'Start', `power button reads "${idle.power?.label}"`);
    const startStyle = await powerMatchesCreate(win);
    check(
      'POWER_MATCHES_CREATE_STYLE',
      startStyle !== null && startStyle.sameBackground && startStyle.sameBorderColor && startStyle.sameFontWeight,
      `power bg ${startStyle?.powerBg} vs create bg ${startStyle?.createBg} (border match: ${startStyle?.sameBorderColor}, weight match: ${startStyle?.sameFontWeight})`,
    );
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
    // Re-read with the WIDER label in place: "Stop" is a bigger box than "Start", and a column that
    // only lines up around the narrow one is not right-aligned, it is coincidental.
    const runningLayout = layoutClaims(running.layout);
    check(
      'LAYOUT_HOLDS_WITH_STOP',
      Boolean(runningLayout?.onNameRow.ok && runningLayout.sharedRightEdge.ok && runningLayout.powerBelowMenu.ok),
      `with "Stop" — ${runningLayout?.sharedRightEdge.why}; ${runningLayout?.powerBelowMenu.why}`,
    );
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

    // --- the ⋮ menu still opens from its new home, and now carries delete ---
    await win.click('.card__menubutton');
    // The menu's background is theme-derived (`var(--surface)`), and screenshotting in the same
    // tick as the click can catch the freshly-mounted popover before that paints — a genuine paint
    // race, not a styling bug: `getComputedStyle` on it is correct even in the same tick a
    // screenshot taken then is not. The wait is for the SHOT below to be trustworthy, not for the
    // checks, which already read computed truth.
    await win.waitForTimeout(150);
    const menuItems = await win.evaluate(() =>
      [...document.querySelectorAll('.card__menulist [role="menuitem"]')].map((el) => el.textContent.trim()),
    );
    check('MENU_OPENS', menuItems.length > 0, `menu items: ${menuItems.join(' | ')}`);
    // New risk from the ⋮ moving to the TOP of the body: `.card` clips to its rounded corners, and
    // the list opens upward over the preview tile. Too tall a list, or a trigger that drifts back
    // down, and the top of the menu is silently cut off — a screenshot shows a shorter menu, not an
    // obviously broken one, so this is read from boxes.
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

    // --- the seeded site is adopted (origin: 'adopted'), so its entry must read as the SAFE
    //     branch — plain text, not the danger styling erasing-file deletes get — and clicking it
    //     must still land on the confirm overlay rather than deleting straight away. ---
    const deleteEntry = await win.evaluate(() => {
      const item = [...document.querySelectorAll('.card__menulist [role="menuitem"]')].find((el) =>
        /Delete|Remove from Projects/.test(el.textContent),
      );
      return item ? { text: item.textContent.trim(), danger: item.classList.contains('card__menuitem--danger') } : null;
    });
    check(
      'ADOPTED_SITE_ENTRY_NOT_DANGER_STYLED',
      deleteEntry?.text === 'Remove from Projects…' && deleteEntry.danger === false,
      `entry "${deleteEntry?.text}", danger class present: ${deleteEntry?.danger}`,
    );
    await win.click('.card__menulist [role="menuitem"]:has-text("Remove from Projects")');
    const confirmShown = await win.evaluate(() => document.querySelector('.card__confirm') !== null);
    check('DELETE_ENTRY_OPENS_CONFIRM', confirmShown, 'clicking the menu entry must open the confirm overlay, not delete directly');
    await shot(win, 'light-menu-delete-confirm');
    // Cancel rather than confirm: the scratch site stays intact for any rerun of this script.
    await win.click('.card__confirmacts .button--quiet');
    const confirmDismissed = await win.evaluate(() => document.querySelector('.card__confirm') === null);
    check('CONFIRM_CANCEL_DISMISSES', confirmDismissed, 'Cancel must close the overlay without deleting');

    await win.keyboard.press('Escape');
    await win.click('body', { position: { x: 5, y: 5 } });

    // --- dark mode ---
    await setTheme(win, 'dark');
    const dark = await cardState(win);
    check(
      'DARK_ALWAYS_VISIBLE',
      dark.menuVisible && !dark.trashOnCard && dark.power !== null,
      `dark mode: ⋮ ${dark.menuVisible}, top-level trash present ${dark.trashOnCard}, power "${dark.power?.label}"`,
    );
    const darkLayout = layoutClaims(dark.layout);
    check(
      'DARK_LAYOUT_HOLDS',
      Boolean(darkLayout?.onNameRow.ok && darkLayout.sharedRightEdge.ok && darkLayout.powerBelowMenu.ok),
      `dark mode — ${darkLayout?.onNameRow.why}`,
    );
    await shot(win, 'dark-stopped');
    await win.click('.card__menubutton');
    await win.waitForTimeout(150); // see the identical wait above — the same paint race.
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
