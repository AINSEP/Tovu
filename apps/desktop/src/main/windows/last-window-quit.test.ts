/**
 * @file The last-window quit ask's host copy and main-process bindings.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lastWindowQuitDialog } from "@jini-ai/desktop-host/shutdown";
import { desktopCopy } from "../../desktop-i18n.ts";

const [QUIT, , CANCEL] = [0, 1, 2];

test("the box's buttons: Quit first, Escape cancels, plain buttons on Windows", () => {
  const options = lastWindowQuitDialog({ title: "Tovu", labels: desktopCopy({ locale: "en" }).lastWindowQuit, stops: 3, keeps: 0 });
  assert.equal(options.type, "question");
  assert.deepEqual(options.buttons, ["Quit", "Keep running in background", "Cancel"]);
  assert.equal(options.defaultId, QUIT);
  assert.equal(options.cancelId, CANCEL);
  assert.equal(options.noLink, true);
  assert.equal(options.title, "Tovu");
  assert.equal("detail" in options, false, "no empty second line when every site stops");
  assert.equal(lastWindowQuitDialog({ title: "Tovu", labels: desktopCopy({ locale: "en" }).lastWindowQuit, stops: 1, keeps: 2 }).detail, "2 sites this app didn’t start keep running.");
});

test("the box follows the app's locale", () => {
  const options = lastWindowQuitDialog({ title: "Tovu", labels: desktopCopy({ locale: "ru-RU" }).lastWindowQuit, stops: 21, keeps: 5 });
  assert.equal(options.message, "Выйти из Tovu и остановить работающие сайты (21)?");
  assert.equal(options.detail, "Сайты, запущенные не этим приложением, продолжат работать (5).");
  assert.deepEqual(options.buttons, ["Выйти", "Оставить работать в фоне", "Отмена"]);
});

test("main wires the ask to both app window kinds, never a capture window, and to every quit", () => {
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.equal(source.match(/trackWindow: \(window\) => trackAppWindow\(\{ window \}\)/g)?.length, 2, "admin windows and the sites home window");
  assert.match(source, /if \(!SELFTEST\) lastWindowQuit\.watch\(\{ window \}\)/, "nobody is there to answer a self-test");
  assert.match(source, /platform: process\.platform,/, "Keep running follows the real platform");
  assert.match(source, /dialogCopy: \(\) => \(\{ title: "Tovu", labels: desktopCopy\(\{ locale: app\.getLocale\(\) \}\)\.lastWindowQuit \}\)/, "the locale is read when asking");
  assert.match(source, /keepChildrenRunning: \(\) => siteLifecycle\?\.keepAwake\(\)/, "Keep running turns idle sleep off");
  assert.match(source, /startCaptureBridge: \(\) => startDesktopCaptureBridge\(\{ createWindow: \(options\) => new BrowserWindow\(options\), capturePool \}\)/,
    "hidden capture windows must not count as open windows");
  const beforeQuit = source.slice(source.indexOf('\napp.on("before-quit", '));
  assert.match(beforeQuit.slice(0, beforeQuit.indexOf("stopSiteLifecycle")), /lastWindowQuit\.onQuitStarted\(\);/, "first, before anything can close a window");
});
