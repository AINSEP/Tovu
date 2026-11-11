// @unrun: authored 2026-10-17; deliberately not executed by the test-authoring dispatch.
import { expect, test, type ElectronApplication } from "@playwright/test";
import {
  closeDesktop, guestEval, guestFetch, launchDesktop, makeSite, openSiteTab,
  removeScratchTree, scratchDir, startSite,
} from "./_fixtures.js";

const SITE = "journey-chat-permissions";
const SETTINGS_URL = "/api/admin/v1/workspaces/workspace-local/system/assistant-full-cli";
let root: string;
let siteDir: string;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  root = scratchDir("chat-permissions");
  siteDir = await makeSite(root, SITE);
});
test.afterAll(() => { if (root) removeScratchTree({ root }, {}); });

/** The guest is a webview, outside Playwright's Page tree. Read labelled controls through the
 * existing guest seam, then send real Chromium mouse input rather than calling DOM .click(). */
async function clickGuestControl(app: ElectronApplication, selector: string, name: string): Promise<void> {
  const query = `(() => {
    const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const control = candidates.find(el => {
      const label = el.getAttribute('aria-label') ?? (el.labels ? [...el.labels].map(l => l.textContent).join(' ') : el.textContent);
      const r = el.getBoundingClientRect();
      return label?.trim() === ${JSON.stringify(name)} && !el.disabled &&
        el.getAttribute('aria-disabled') !== 'true' && r.width > 0 && r.height > 0;
    });
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return null;
    control.scrollIntoView({ block: 'center' });
    const r = control.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  })()`;
  await expect.poll(() => guestEval(app, query), { message: `guest control ${name} is visible and enabled`, timeout: 30_000 }).not.toBeNull();
  const point = await guestEval<{ x: number; y: number }>(app, query);
  await app.evaluate(({ webContents }, position) => {
    const guest = webContents.getAllWebContents().find(c => c.getType() === "webview");
    if (!guest) throw new Error("no webview guest");
    guest.focus();
    guest.sendInputEvent({ type: "mouseMove", ...position });
    guest.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...position });
    guest.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...position });
  }, point);
}

async function openPermissions(app: ElectronApplication): Promise<void> {
  const dockOpen = await guestEval<boolean>(app, `!![...document.querySelectorAll('button[aria-label="Settings"]')].find(el => el.getBoundingClientRect().width > 0)`);
  if (!dockOpen) await clickGuestControl(app, 'button', 'Open assistant');
  await clickGuestControl(app, 'button', 'Settings');
  await expect.poll(() => guestEval(app, `(() => {
    const menu = document.querySelector('[role="menu"][aria-label="Settings"]');
    return menu ? { text: menu.textContent, checks: [...menu.querySelectorAll('[role="menuitemcheckbox"]')].map(el => el.textContent.trim()) } : null;
  })()`)).toMatchObject({ text: expect.stringContaining("Tool calls"), checks: expect.arrayContaining(["Done line", "Thinking"]) });
  await clickGuestControl(app, '[role="menuitem"]', 'More settings…');
  await expect.poll(() => guestEval(app, `(() => {
    const dialog = document.querySelector('dialog[open]');
    return dialog ? [...dialog.querySelectorAll('h3')].map(el => el.textContent) : [];
  })()`)).toEqual(["Display", "Agent permissions"]);
}

async function shellChecked(app: ElectronApplication): Promise<boolean | null> {
  return guestEval(app, `(() => {
    const input = [...document.querySelectorAll('dialog[open] input[role="switch"]')]
      .find(el => [...el.labels].some(label => label.textContent.trim() === 'Bash/shell'));
    return input ? input.checked : null;
  })()`);
}

test("A8 desktop journey: chat gear opens advanced settings and Bash OFF survives a guest reload", { tag: ["@desktop", "@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  try {
    await startSite(launch.win, SITE);
    await openSiteTab(launch.app, launch.win, SITE);
    await openPermissions(launch.app);
    await expect.poll(() => shellChecked(launch.app)).toBe(true);
    const initial = await guestFetch(launch.app, SETTINGS_URL);
    expect(initial.status).toBe(200);
    expect(initial.body.canEdit).toBe(true);
    expect(initial.body.capabilities.shell).toBe(true);

    await clickGuestControl(launch.app, 'dialog[open] input[role="switch"]', 'Bash/shell');
    await expect.poll(() => guestFetch(launch.app, SETTINGS_URL), { message: "the real owner/site ledger saved Bash OFF" })
      .toMatchObject({ status: 200, body: { capabilities: { ...initial.body.capabilities, shell: false } } });
    await expect.poll(() => shellChecked(launch.app)).toBe(false);

    await launch.app.evaluate(({ webContents }) => {
      const guest = webContents.getAllWebContents().find(c => c.getType() === "webview");
      if (!guest) throw new Error("no webview guest");
      guest.reload();
    });
    await expect.poll(() => launch.app.evaluate(({ webContents }) => {
      const guest = webContents.getAllWebContents().find(c => c.getType() === "webview");
      return guest ? guest.isLoading() : true;
    }), { timeout: 60_000 }).toBe(false);
    await openPermissions(launch.app);
    await expect.poll(() => shellChecked(launch.app)).toBe(false);
  } finally {
    await closeDesktop(launch);
  }
});
