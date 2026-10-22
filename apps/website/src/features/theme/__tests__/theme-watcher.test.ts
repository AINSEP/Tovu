import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes } from "../theme.js";
import { createThemePreviewFeed, readThemePreviewRefresh, type ThemePreviewRefresh } from "../preview-refresh.js";
import { startThemeWatcher, type ThemeWatchPort } from "../theme-watcher.js";

/** Real discovery/marker/feed, fake watcher and clock: no OS watch, server or waiting. */
function fixture(t: test.TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-watch-"));
  const themesDir = path.join(root, "site", "themes");
  const writeTheme = (id: string, ink = "#000") => {
    const dir = path.join(themesDir, "static", id);
    fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
    fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id, name: id, version: "1.0.0", tier: "declarative", engine: 1 }));
    fs.writeFileSync(path.join(dir, "tokens.json"), JSON.stringify({ "--ink": ink }));
    fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}");
    for (const name of ["home", "entry"]) fs.writeFileSync(path.join(dir, "templates", `${name}.json`), '{"type":"doc","content":[]}');
  };
  writeTheme("basic");
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  const frames: ThemePreviewRefresh[] = [];
  const feed = createThemePreviewFeed({ read: () => readThemePreviewRefresh({ themesDir }), emit: (frame) => {
    assert.deepEqual(themes.map((theme) => theme.manifest.id), discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }).map((theme) => theme.manifest.id),
      "discovery is current before an SSE consumer receives the frame");
    frames.push(frame);
  } });
  let callbacks!: Parameters<ThemeWatchPort["open"]>[0];
  let closes = 0;
  const watchPort: ThemeWatchPort = { open(input) {
    assert.equal(input.themesDir, themesDir);
    callbacks = input;
    return { close() { closes += 1; } };
  } };
  const errors: unknown[] = [];
  const start = () => startThemeWatcher({ themes, themesDir }, { watchPort, onError: ({ error }) => errors.push(error) });
  const watcher = start();
  t.after(async () => { await watcher.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, themesDir, themes, writeTheme, frames, feed, errors, watcher, start,
    change: (filename: string | null) => callbacks.onChange(filename),
    currentChange: () => callbacks.onChange,
    fail: (error: unknown) => callbacks.onError(error),
    closes: () => closes,
  };
}

test("settle-then-refresh coalesces adds, changes and removals before the existing SSE feed", (t) => {
  const f = fixture(t);
  const roster = f.themes;
  f.writeTheme("new-theme");
  f.change("static/new-theme/theme.json");
  t.mock.timers.tick(300);
  fs.writeFileSync(path.join(f.themesDir, "static", "new-theme", "tokens.json"), '{"--ink":"#abc"}');
  f.change("static/new-theme/tokens.json");
  fs.rmSync(path.join(f.themesDir, "static", "basic"), { recursive: true });
  f.change("static/basic");
  t.mock.timers.tick(399);
  f.feed();
  assert.deepEqual([...f.frames], []);
  assert.deepEqual(f.themes.map((theme) => theme.manifest.id), ["basic"]);
  t.mock.timers.tick(1);
  f.feed();
  assert.equal(f.themes, roster, "all readers keep the same live roster array");
  assert.deepEqual(f.themes.map((theme) => theme.manifest.id), ["new-theme"]);
  assert.equal(f.themes[0]?.tokens["--ink"], "#abc");
  assert.equal(f.frames.length, 1);
  const revision = f.frames[0].revision;
  t.mock.timers.tick(2_000);
  assert.equal(readThemePreviewRefresh({ themesDir: f.themesDir })?.revision, revision, "no trailing duplicate refresh");
});

test("a nested external edit reloads source maps without an in-app marker or folder membership change", (t) => {
  const f = fixture(t);
  const previous = f.themes[0];
  fs.writeFileSync(path.join(f.themesDir, "static", "basic", "tokens.json"), '{"--ink":"#f0f"}');
  f.change("static/basic/tokens.json");
  t.mock.timers.tick(400);
  f.feed();
  assert.notEqual(f.themes[0], previous);
  assert.equal(f.themes[0]?.tokens["--ink"], "#f0f");
  assert.equal(f.frames.length, 1);
});

test("metadata, node_modules and editor temp paths never trigger or postpone a refresh", (t) => {
  const f = fixture(t);
  const ignored = [".preview-refresh.json", ".git/index", "static/basic/.DS_Store", "static/basic/node_modules/pkg/index.js",
    "static\\basic\\node_modules\\pkg\\index.js", "static/basic/.style.css.swp", "static/basic/style.css.swo",
    "static/basic/style.css.swn", "static/basic/style.css~", "static/basic/#style.css#", "static/basic/style.tmp",
    "static/basic/style.temp", "static/basic/style.bak", "static/basic/style.css___jb_tmp___", "static/basic/style.css___jb_old___"];
  for (const filename of ignored) f.change(filename);
  t.mock.timers.tick(400);
  assert.equal(readThemePreviewRefresh({ themesDir: f.themesDir }), null);
  f.change("static/basic/styles.css");
  t.mock.timers.tick(300);
  for (const filename of ignored) f.change(filename);
  t.mock.timers.tick(100);
  f.feed();
  assert.equal(f.frames.length, 1, "ignored events do not reset the quiet-period timer");
  f.change(".preview-refresh.json"); // Our own notification must not create a feedback loop.
  t.mock.timers.tick(1_000);
  assert.equal(readThemePreviewRefresh({ themesDir: f.themesDir })?.revision, f.frames[0].revision);
});

test("an event with no filename still refreshes discovery", (t) => {
  const f = fixture(t);
  f.change(null);
  t.mock.timers.tick(400);
  f.feed();
  assert.equal(f.frames.length, 1);
});

test("stop cancels pending work, ignores late events and closes exactly once", async (t) => {
  const f = fixture(t);
  f.change("static/basic/styles.css");
  await f.watcher.stop();
  await f.watcher.stop();
  f.change("static/basic/styles.css");
  t.mock.timers.tick(1_000);
  assert.equal(f.closes(), 1);
  assert.equal(readThemePreviewRefresh({ themesDir: f.themesDir }), null);
});

test("restarts and site switches replace the sole watcher; an old stop cannot close its successor", async (t) => {
  const f = fixture(t);
  const oldChange = f.currentChange();
  f.change("static/basic/styles.css");
  const restarted = f.start();
  t.after(() => restarted.stop());
  assert.equal(f.closes(), 1);
  await f.watcher.stop();
  assert.equal(f.closes(), 1);
  let nextClosed = 0;
  const switched = startThemeWatcher({ themes: [], themesDir: "/other-site/themes" }, {
    watchPort: { open: () => ({ close: () => { nextClosed += 1; } }) },
  });
  t.after(() => switched.stop());
  assert.equal(f.closes(), 2);
  await restarted.stop();
  oldChange("static/basic/styles.css");
  t.mock.timers.tick(1_000);
  assert.equal(readThemePreviewRefresh({ themesDir: f.themesDir }), null);
  assert.equal(nextClosed, 0);
  await switched.stop();
  assert.equal(nextClosed, 1);
});

test("watch errors cancel pending work and close the failed handle", (t) => {
  const f = fixture(t);
  const error = new Error("watch failed");
  f.change("static/basic/styles.css");
  f.fail(error);
  t.mock.timers.tick(400);
  assert.deepEqual(f.errors, [error]);
  assert.equal(f.closes(), 1);
  assert.equal(readThemePreviewRefresh({ themesDir: f.themesDir }), null);
});

test("opening failure is reported and a subsequent start can recover", async (t) => {
  const f = fixture(t);
  const error = new Error("watch unavailable");
  const failed = startThemeWatcher({ themes: f.themes, themesDir: f.themesDir }, {
    watchPort: { open() { throw error; } }, onError: ({ error }) => f.errors.push(error),
  });
  assert.deepEqual(f.errors, [error]);
  assert.equal(f.closes(), 1);
  const recovered = f.start();
  t.after(() => recovered.stop());
  await failed.stop();
  f.change("static/basic/styles.css");
  t.mock.timers.tick(400);
  f.feed();
  assert.equal(f.frames.length, 1);
});

test("a notification I/O failure is reported without a frame; a later edit retries", (t) => {
  const f = fixture(t);
  fs.rmSync(path.join(f.root, "site"), { recursive: true });
  f.change("static/basic/styles.css");
  t.mock.timers.tick(400);
  f.feed();
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.frames, []);
  f.writeTheme("basic", "#abc");
  f.change("static/basic/theme.json");
  t.mock.timers.tick(400);
  f.feed();
  assert.equal(f.themes[0]?.tokens["--ink"], "#abc");
  assert.equal(f.frames.length, 1);
});

test("the default OS watcher refreshes discovery and the preview marker after a real file write", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-watch-native-"));
  const themesDir = path.join(root, "themes");
  fs.mkdirSync(themesDir);
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  const errors: unknown[] = [];
  const watcher = startThemeWatcher({ themes, themesDir }, { settleMs: 10, onError: ({ error }) => errors.push(error) });
  t.after(async () => { await watcher.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  const deadline = Date.now() + 10_000;
  let frame: ThemePreviewRefresh | null = null;
  for (let attempt = 0; frame === null && Date.now() < deadline; attempt += 1) {
    fs.writeFileSync(path.join(themesDir, `touch-${attempt}.txt`), "x");
    await new Promise((resolve) => setTimeout(resolve, 100));
    frame = readThemePreviewRefresh({ themesDir });
  }
  assert.ok(frame, "a real filesystem event reached the settle-then-refresh path");
  assert.deepEqual(errors, []);
});

test("without an onError option, an opening failure is logged rather than thrown", async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  const missing = path.join(os.tmpdir(), `tovu-theme-watch-missing-${process.pid}-${Date.now()}`);
  const watcher = startThemeWatcher({ themes: [], themesDir: missing });
  await watcher.stop();
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], "[theme-watcher] theme refresh failed");
  assert.equal((logged[0][1] as NodeJS.ErrnoException).code, "ENOENT");
});
