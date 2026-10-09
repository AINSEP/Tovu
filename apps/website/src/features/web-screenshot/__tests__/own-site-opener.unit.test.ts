import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { createOwnSiteOpener, type RenderableTheme } from "../own-site-opener.js";

/**
 * @file The own-site opener behind `web_screenshot_page`'s `themeId`: an unknown or broken theme is
 * refused BEFORE a server is booted (the site render would otherwise silently fall back to the
 * default theme and the agent would compare the wrong picture), and a good one is handed to the
 * loopback server as a render override. The theme roster is read per call because discovery
 * mutates it in place.
 */

function theme(id: string, status: "valid" | "invalid" = "valid"): RenderableTheme {
  return { manifest: { id }, status };
}

function harness(themes: RenderableTheme[]) {
  const opened: Array<{ themeId?: string }> = [];
  const open = createOwnSiteOpener({
    themes,
    openLoopback: async (_required, optional) => { opened.push(optional); return { origin: "http://127.0.0.1:1", close: async () => {} }; },
  });
  return { open, opened };
}

test("no themeId: the site opens with no override (its active theme)", async () => {
  const { open, opened } = harness([theme("tovu-starter")]);
  await open();
  assert.deepEqual(opened, [{}]);
});

test("an installed, valid themeId is passed through as the render override", async () => {
  const { open, opened } = harness([theme("tovu-starter"), theme("luvira-copy")]);
  await open({}, { themeId: "luvira-copy" });
  assert.deepEqual(opened, [{ themeId: "luvira-copy" }]);
});

test("an unknown themeId is refused with the installed ids, and nothing is booted", async () => {
  const { open, opened } = harness([theme("tovu-starter"), theme("luvira-copy"), theme("broken", "invalid")]);
  await assert.rejects(open({}, { themeId: "luvira" }), (error: unknown) => error instanceof ToolInputError
    && error.message === "web_screenshot_page: themeId 'luvira' is not an installed theme. Installed themes: tovu-starter, luvira-copy.");
  assert.deepEqual(opened, []);
});

test("an installed but invalid theme is refused rather than silently rendered as the default theme", async () => {
  const { open, opened } = harness([theme("tovu-starter"), theme("broken", "invalid")]);
  await assert.rejects(open({}, { themeId: "broken" }), /themeId 'broken' is installed but invalid \(it fails theme validation\), so the site would render a different theme instead/);
  assert.deepEqual(opened, []);
});

test("the roster is read at call time, so a theme duplicated after boot is accepted", async () => {
  const themes = [theme("tovu-starter")];
  const { open, opened } = harness(themes);
  themes.push(theme("fresh-copy"));
  await open({}, { themeId: "fresh-copy" });
  assert.deepEqual(opened, [{ themeId: "fresh-copy" }]);
});
