import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

import type { IsolatedJourneySite } from "../support/isolated-journey-site.js";
import { IS_PACKAGED_SERVER, expect, test } from "./_fixtures.js";
import { ENTRY_SLUG, TYPE_KEY, readSeeded, type Seeded } from "./mobile-visual.setup.js";

/**
 * Admin phone-width screenshot baselines (owner 2026-10-07: "take screenshots so we dont regress").
 * Config: `playwright.mobile-visual.config.ts` (its own fresh site, so lists hold only the first-boot
 * seed plus the fixed rows `mobile-visual.setup.ts` creates). Projects: `phone-375` (every screen) and `phone-414` (`@list`).
 *
 *   npx playwright test -c development/playwright.mobile-visual.config.ts
 *   ... --update-snapshots   # only on SOURCE; refused against a packaged app (see below)
 *
 * One `toHaveScreenshot` per screen, of the WHOLE content column: the viewport is stretched to the
 * content's height first, so a broken card far down a list still fails. Anything that changes per
 * run (dates written now, temp paths, theme preview frames) is masked, not stubbed.
 *
 * Sweep mode (`TOVU_MOBILE_SWEEP_DIR=<dir>`) writes the same screens as plain PNGs plus an
 * overflow/tap-target audit JSON instead of comparing, for looking at the admin by eye.
 */
const SWEEP_DIR = process.env.TOVU_MOBILE_SWEEP_DIR;
const SWEEP_WIDTH = Number(process.env.TOVU_MOBILE_SWEEP_WIDTH) || 0;

/** One screen: how to reach it from a seeded site. `list` screens also run at 414px. */
interface Screen {
  name: string;
  list?: boolean;
  open(page: Page, s: Seeded): Promise<void>;
}

const route = (name: string, url: string, list = false): Screen => ({ name, list, open: async (page) => { await page.goto(url); } });

const SCREENS: Screen[] = [
  route("dashboard", "/admin/dashboard", true),
  route("posts", "/admin/posts", true),
  route("pages", "/admin/pages", true),
  route("media", "/admin/media", true),
  route("collections", "/admin/collections", true),
  route("collection-entries", `/admin/collections/${TYPE_KEY}`, true),
  route("menus", "/admin/menus", true),
  route("widgets", "/admin/widgets", true),
  route("taxonomy", "/admin/taxonomy", true),
  route("forms", "/admin/forms", true),
  route("users", "/admin/users", true),
  route("roles", "/admin/roles", true),
  route("comments", "/admin/comments", true),
  route("themes", "/admin/themes", true),
  route("agent-plugins", "/admin/agent-plugins", true),
  route("access-tokens", "/admin/access-tokens", true),
  route("redirects", "/admin/redirects", true),
  route("trash", "/admin/trash", true),
  route("authentication", "/admin/authentication"),
  route("members", "/admin/members"),
  route("playground", "/admin/playground"),
  route("plugins", "/admin/plugins"),
  route("skills", "/admin/skills"),
  route("providers", "/admin/providers"),
  route("payments", "/admin/payments"),
  route("database", "/admin/database"),
  route("recovery", "/admin/recovery"),
  route("deployment", "/admin/deployment"),
  route("source-control", "/admin/source-control"),
  route("seo", "/admin/seo"),
  route("analytics", "/admin/analytics"),
  {
    // The Local CLI sub-tab lists whatever agent CLIs this machine has installed, so the baseline
    // shows the BYOK form instead: the same tab chrome, with nothing that depends on the host.
    name: "settings-execution",
    open: async (page) => {
      await page.goto("/admin/settings?tab=execution");
      await page.getByRole("tab", { name: /^BYOK/ }).click();
    },
  },
  ...["instructions", "notifications", "privacy", "appearance", "language", "interface", "memory", "workspace", "about"]
    .map((tab) => route(`settings-${tab}`, `/admin/settings?tab=${tab}`)),
  { name: "post-editor", open: async (page, s) => { await page.goto(`/admin/posts/${s.postId}`); } },
  { name: "page-editor", open: async (page, s) => { await page.goto(`/admin/pages/${s.pageSlug}`); } },
  { name: "form-builder", open: async (page, s) => { await page.goto(`/admin/forms/${s.formId}`); } },
  { name: "form-submissions", open: async (page, s) => { await page.goto(`/admin/forms/${s.formId}/submissions`); } },
  route("collection-entry-editor", `/admin/collections/${TYPE_KEY}/${ENTRY_SLUG}`),
  { name: "menu-editor", open: async (page, s) => { await page.goto(`/admin/menus/${s.menuId}`); } },
  { name: "widget-editor", open: async (page, s) => { await page.goto(`/admin/widgets/${s.widgetId}`); } },
  route("widget-regions", "/admin/widgets/regions"),
  {
    name: "media-detail",
    open: async (page) => {
      await page.goto("/admin/media");
      await page.getByRole("button", { name: `Edit "mobile-baseline-image"` }).click();
    },
  },
  {
    name: "theme-explore",
    open: async (page) => {
      await page.goto("/admin/themes");
      await page.getByRole("button", { name: "Explore" }).first().click();
      await expect(page).toHaveURL(/\/admin\/themes\/explore/);
    },
  },
  route("change-password", "/admin/users/change-password"),
];

/** Waits until the screen stops loading: no busy region and no "Loading…" placeholder left. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator(".admin-layout")).toBeVisible();
  await page.waitForFunction(() => {
    const root = document.querySelector(".admin-content");
    if (!root) return false;
    if (root.querySelector('[aria-busy="true"]')) return false;
    return !/\bLoading\b/i.test((root as HTMLElement).innerText);
  }, undefined, { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Tags every leaf whose text is a date or time written at run time, or a temp path, so the
 * screenshot masks it. Seeded first-boot rows carry fixed dates, so this only hides what changes.
 */
async function tagVolatile(page: Page): Promise<void> {
  await page.evaluate(() => {
    const volatile = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\b|\bago\b|\bjust now\b|\/var\/folders\/|\/tmp\/|tovu-journeys-mobile-|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}\b/i;
    const root = document.querySelector(".admin-content");
    if (!root) return;
    for (const el of root.querySelectorAll("*")) {
      const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("");
      if (volatile.test(own) || el.tagName === "TIME") el.setAttribute("data-mobile-visual-mask", "");
    }
  });
}

/** Stretches the viewport to the content's full height so one image holds the whole screen. */
async function withWholeContent<T>(page: Page, run: () => Promise<T>): Promise<T> {
  const base = page.viewportSize()!;
  const extra = await page.evaluate(() => {
    const scrollers = [document.scrollingElement, document.querySelector(".admin-content")].filter(Boolean) as Element[];
    return Math.max(0, ...scrollers.map((el) => el.scrollHeight - el.clientHeight));
  });
  if (extra > 0) await page.setViewportSize({ width: base.width, height: Math.min(base.height + extra, 6000) });
  try {
    return await run();
  } finally {
    await page.setViewportSize(base);
  }
}

/** Reads overflow and tap-target problems the way the sweep looks for them by eye. */
async function audit(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const describe = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const insideScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const content = document.querySelector(".admin-content") ?? document.body;
    const all = [...content.querySelectorAll("*")].filter(visible);
    return {
      docScroll: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : 0,
      overflowing: all.filter((el) => el.getBoundingClientRect().right > vw + 1 && !insideScroller(el)).slice(0, 8).map(describe),
      small: all
        .filter((el) => el.matches("a[href], button, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), [role=button], [role=tab], summary"))
        .filter((el) => el.getBoundingClientRect().height < 40)
        .map((el) => `${Math.round(el.getBoundingClientRect().height)}px ${describe(el)}`),
    };
  });
}

test.describe("admin at phone width", () => {
  let seeded: Seeded;
  test.beforeAll(async ({}, testInfo) => {
    // A baseline written from a packaged build would bless whatever that build drew; baselines
    // come from source only, so `--update-snapshots` against a packaged app is refused.
    if (IS_PACKAGED_SERVER && !["none", "missing"].includes(testInfo.config.updateSnapshots)) {
      throw new Error("Refusing to write mobile baselines from a packaged app: regenerate them on source");
    }
    const site = testInfo.config.metadata.isolatedJourneySite as IsolatedJourneySite;
    seeded = readSeeded(site);
  });

  for (const screen of SCREENS) {
    test(screen.name, { tag: screen.list ? ["@list"] : [] }, async ({ page }, testInfo) => {
      // Sweep only: `TOVU_MOBILE_SWEEP_WIDTH=768` spot-checks a wider viewport with the same screens.
      if (SWEEP_DIR && SWEEP_WIDTH) await page.setViewportSize({ width: SWEEP_WIDTH, height: 900 });
      await screen.open(page, seeded);
      await settle(page);
      if (SWEEP_DIR) {
        const dir = path.join(SWEEP_DIR, SWEEP_WIDTH ? `w${SWEEP_WIDTH}` : testInfo.project.name);
        mkdirSync(dir, { recursive: true });
        await page.waitForTimeout(800);
        writeFileSync(path.join(dir, `${screen.name}.json`), JSON.stringify(await audit(page), null, 2));
        await withWholeContent(page, () => page.screenshot({ path: path.join(dir, `${screen.name}.png`) }));
        return;
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
        "the page scrolls sideways at phone width").toBe(false);
      await tagVolatile(page);
      await withWholeContent(page, () => expect(page).toHaveScreenshot(`${screen.name}.png`, {
        mask: [page.locator("[data-mobile-visual-mask]"), page.locator(".admin-content iframe")],
      }));
    });
  }
});
