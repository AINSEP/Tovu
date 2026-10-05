// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { expect, test } from "@playwright/test";
import fs from "node:fs";

import { visibleSections } from "../../../apps/desktop/src/contracts/sections.ts";
import { closeDesktop, expectPreloadBridge, launchDesktop, makeSite, scratchDir, siteCard } from "./_fixtures.js";

/**
 * D1 (SCOPE.md §3.3): launch lands on the sites home (Websites), every nav-visible section is
 * present, and nothing on the home screen blanks the window.
 *
 * Only Websites (`projects`) is live today: `App.tsx`'s `TopNav` renders every other section and the
 * Settings gear as `aria-disabled` buttons on purpose (owner decision, unbuilt sections signposted).
 * So "each section opens" is asserted as "each section is present, inert, and clicking it keeps the
 * Websites screen drawn", which is the shipped contract. Section labels come from
 * `contracts/sections.ts`, so a newly visible section becomes part of this check automatically.
 */
const SITE = "journey-smoke";
let root: string;
let siteDir: string;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  root = scratchDir("smoke-sites");
  siteDir = await makeSite(root, SITE);
});
test.afterAll(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

test("launch lands on Websites with every section present and the tracked site's card", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { win } = launch;
  try {
    const nav = win.getByRole("navigation", { name: "Tovu sections" });
    for (const section of visibleSections()) {
      await expect(nav.getByRole("button", { name: section.label, exact: true }), section.id).toBeVisible();
    }
    await expect(nav.getByRole("button", { name: "Websites", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(win.locator("h1.main__title")).toHaveText("Websites");
    await expect(win.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    await expect(siteCard(win, SITE)).toBeVisible();
    for (const label of ["Rescan", "Add Tovu Website", "Create website"]) {
      await expect(win.getByRole("button", { name: new RegExp(label) })).toBeVisible();
    }
    await expect(win).toHaveScreenshot("sites-home.png", { mask: [win.locator(".card")] });
  } finally {
    await closeDesktop(launch);
  }
});

test("clicking every inert section and the Settings gear keeps the Websites screen drawn", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { win } = launch;
  try {
    const nav = win.getByRole("navigation", { name: "Tovu sections" });
    for (const section of visibleSections().filter((s) => s.id !== "projects")) {
      const button = nav.getByRole("button", { name: section.label, exact: true });
      await expect(button).toHaveAttribute("aria-disabled", "true");
      await button.click({ force: true });
      await expect(win.locator(".app")).toBeVisible();
      await expect(win.locator("h1.main__title"), `after clicking ${section.label}`).toHaveText("Websites");
      await expect(siteCard(win, SITE)).toBeVisible();
    }
    const gear = nav.getByRole("button", { name: "Settings", exact: true });
    await expect(gear).toHaveAttribute("aria-disabled", "true");
    await gear.click({ force: true });
    await expect(win.getByRole("menu")).toHaveCount(0);
  } finally {
    await closeDesktop(launch);
  }
});

test("a renderer reload comes back drawn with the preload bridge intact", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { win } = launch;
  try {
    await win.reload();
    await expect(win.locator(".app")).toBeVisible();
    await expectPreloadBridge(win);
    await expect(siteCard(win, SITE)).toBeVisible();
  } finally {
    await closeDesktop(launch);
  }
});

test("a phone-narrow window (the 480 px minimum) still shows the nav and the card without sideways scroll", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { app, win } = launch;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(480, 800));
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(480);
    await expect(win.getByRole("navigation", { name: "Tovu sections" })).toBeVisible();
    await expect(siteCard(win, SITE)).toBeVisible();
    const scrolls = await win.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(scrolls, "the sites home scrolls sideways at the minimum window width").toBe(false);
  } finally {
    await closeDesktop(launch);
  }
});
