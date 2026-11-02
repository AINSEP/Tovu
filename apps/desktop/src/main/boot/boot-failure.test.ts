/**
 * @file Behaviour of how a failed launch ends and how a self-test launch reports (`boot-failure.ts`).
 * No equivalent existed: `main.ts`'s `reportBootFailure` and `buildSelftestTracker` were only ever
 * checked by position in source text.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildSelftestTracker, reportBootFailure, type BootFailurePorts } from "./boot-failure.ts";

class Cancelled extends Error {}

function harness(overrides: Partial<BootFailurePorts> = {}) {
  const effects: string[] = [];
  const infos: unknown[] = [];
  const ports: BootFailurePorts = {
    isSelectionCancelled: (error) => error instanceof Cancelled,
    selftest: false,
    isUnattended: () => false,
    showInfo: async (options) => { effects.push("info"); infos.push(options); },
    showError: ({ title, content }) => { effects.push(`errorBox:${title}:${content}`); },
    logError: (message) => { effects.push(`log:${message}`); },
    setExitCode: (code) => { effects.push(`exitCode:${code}`); },
    openSiteCount: () => 0,
    quit: () => { effects.push("quit"); },
    exit: (code) => { effects.push(`exit:${code}`); },
    ...overrides,
  };
  return { ports, effects, infos };
}

test("a cancelled picker is a decline: an info dialog, then a plain quit with no error exit code", async () => {
  const h = harness();
  await reportBootFailure({ error: new Cancelled("cancelled"), ports: h.ports });
  assert.deepEqual(h.effects, ["info", "quit"]);
  assert.deepEqual(h.infos, [{ type: "info", title: "Tovu", message: "No site folder was chosen.",
    detail: "Tovu needs a folder to store your site before it can start. Launch again to choose one." }]);
});

test("a cancelled picker in a self-test quits without a dialog nobody could dismiss", async () => {
  const h = harness({ selftest: true });
  await reportBootFailure({ error: new Cancelled("cancelled"), ports: h.ports });
  assert.deepEqual(h.effects, ["quit"]);
});

test("the quit after a decline waits for the dialog to close", async () => {
  let release!: () => void;
  const h = harness({ showInfo: () => new Promise<void>((resolve) => { release = resolve; }) });
  const pending = reportBootFailure({ error: new Cancelled("c"), ports: h.ports });
  await Promise.resolve();
  assert.deepEqual(h.effects, []);
  release();
  await pending;
  assert.deepEqual(h.effects, ["quit"]);
});

test("a real failure with nothing open: logged, exit code 1, error box, then a hard exit(1)", async () => {
  const h = harness();
  await reportBootFailure({ error: new Error("SITE_NEWER_THAN_RUNTIME"), ports: h.ports });
  assert.deepEqual(h.effects, [
    "log:tovu desktop: SITE_NEWER_THAN_RUNTIME", "exitCode:1", "errorBox:Tovu could not start:SITE_NEWER_THAN_RUNTIME", "exit:1",
  ]);
});

test("a failure after an earlier site opened quits gracefully so before-quit can stop that child", async () => {
  const h = harness({ openSiteCount: () => 1 });
  await reportBootFailure({ error: new Error("second site failed"), ports: h.ports });
  assert.equal(h.effects.at(-1), "quit");
  assert.equal(h.effects.includes("exit:1"), false);
});

test("self-test and unattended launches never show the blocking error box; self-test never asks unattended", async () => {
  const selftest = harness({ selftest: true, isUnattended: () => assert.fail("not consulted in a self-test") });
  await reportBootFailure({ error: new Error("x"), ports: selftest.ports });
  assert.deepEqual(selftest.effects, ["log:tovu desktop: x", "exitCode:1", "exit:1"]);
  const unattended = harness({ isUnattended: () => true });
  await reportBootFailure({ error: new Error("x"), ports: unattended.ports });
  assert.deepEqual(unattended.effects, ["log:tovu desktop: x", "exitCode:1", "exit:1"]);
});

function fakeWindow(url: string, title: string) {
  const handlers: Record<string, (...args: never[]) => void> = {};
  return {
    window: { webContents: {
      on: (event: string, listener: (...args: never[]) => void) => { handlers[event] = listener; },
      once: (event: string, listener: (...args: never[]) => void) => { handlers[event] = listener; },
      getURL: () => url, getTitle: () => title,
    } },
    finish: () => (handlers["did-finish-load"] as () => void)(),
    fail: (code: number, description: string) =>
      (handlers["did-fail-load"] as unknown as (e: unknown, c: number, d: string, u: string, main: boolean) => void)({}, code, description, url, true),
  };
}

function selftestHarness(expectedCount: number) {
  const out: string[] = [];
  const tracker = buildSelftestTracker({
    expectedCount,
    log: (message) => out.push(`log:${message}`),
    logError: (message) => out.push(`error:${message}`),
    setExitCode: (code) => out.push(`exitCode:${code}`),
    quit: () => out.push("quit"),
  });
  return { tracker, out };
}

test("self-test: each loaded window reports its url and quoted title; quit only once every expected window loaded", () => {
  const h = selftestHarness(2);
  const a = fakeWindow("http://127.0.0.1:1/admin/", "Site \"A\"");
  const b = fakeWindow("http://127.0.0.1:2/admin/", "Site B");
  h.tracker.add(a.window);
  h.tracker.add(b.window);
  a.finish();
  assert.equal(h.out.includes("quit"), false, "one of two loaded must not quit");
  b.finish();
  assert.deepEqual(h.out, [
    "log:tovu desktop: loaded http://127.0.0.1:1/admin/", "log:tovu desktop: title=\"Site \\\"A\\\"\"",
    "log:tovu desktop: loaded http://127.0.0.1:2/admin/", "log:tovu desktop: title=\"Site B\"", "quit",
  ]);
});

test("self-test: a failed load reports the failure, sets exit code 1 and quits", () => {
  const h = selftestHarness(1);
  const a = fakeWindow("http://127.0.0.1:1/admin/", "A");
  h.tracker.add(a.window);
  a.fail(-102, "ERR_CONNECTION_REFUSED");
  assert.deepEqual(h.out, ["error:tovu desktop: FAILED to load http://127.0.0.1:1/admin/ (-102 ERR_CONNECTION_REFUSED)", "exitCode:1", "quit"]);
});
