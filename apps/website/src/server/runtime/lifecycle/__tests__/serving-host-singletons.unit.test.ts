import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { SiteBinding } from "#src/platform/site-dir/index";
import { localSiteSupervisorForHost, shutdownLocalSiteHosts } from "../local-site-host.js";
import { sitePreviewServiceForHost } from "../site-preview-host.js";
import { themePreviewServiceForHost } from "../theme-preview-host.js";

/**
 * @file The three per-binding serving-host singletons (`local-site-host.ts`, `site-preview-host.ts`,
 * `theme-preview-host.ts`) against their REAL dependencies: each is off unless local site
 * management is on AND the binding can host it, each assembles at most one instance per binding
 * directory, and assembly itself launches nothing (no child, no browser) — which is what lets these
 * run in a unit test at all.
 */

const ENV_KEYS = ["NODE_ENV", "TOVU_ENABLE_SITE_SWITCHER", "PORT", "JINI_AGENT_DAEMON_PORT", "JINI_AGENT_DAEMON_URL", "TOVU_LOCAL_SITE_LIMIT"] as const;

/** Sets `values` on `process.env` for one test and restores every touched key afterwards. */
function withEnv(t: test.TestContext, values: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  t.after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

let counter = 0;
/** A switcher-compatible binding at a fresh `<tmp>/sites/<name>` path (nothing is written there). */
function binding(overrides: Partial<SiteBinding> = {}): SiteBinding {
  counter += 1;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "serving-host-"));
  const name = `site-${counter}`;
  return {
    dir: path.join(root, "sites", name),
    name,
    dirOverridden: false,
    switcherCompatible: true,
    ...overrides,
  } as SiteBinding;
}

for (const [label, forHost] of [
  ["site preview", sitePreviewServiceForHost],
  ["theme preview", themePreviewServiceForHost],
  ["local site supervisor", localSiteSupervisorForHost],
] as const) {
  test(`${label}: off when local site management is off, including under NODE_ENV=production with the flag set`, (t) => {
    withEnv(t, {});
    assert.equal(forHost({ binding: binding() }), undefined);
    withEnv(t, { NODE_ENV: "production", TOVU_ENABLE_SITE_SWITCHER: "1" });
    assert.equal(forHost({ binding: binding() }), undefined);
  });

  test(`${label}: off for a binding that is not switcher-compatible (an install-dir boot)`, (t) => {
    withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1" });
    assert.equal(forHost({ binding: binding({ switcherCompatible: false }) }), undefined);
  });
}

for (const [label, forHost] of [
  ["site preview", sitePreviewServiceForHost],
  ["theme preview", themePreviewServiceForHost],
] as const) {
  test(`${label}: one service per binding directory, a distinct one for another directory, and assembly writes nothing`, (t) => {
    withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "true" });
    const first = binding();
    const service = forHost({ binding: first });
    assert.ok(service);
    assert.equal(forHost({ binding: { ...first } }), service);
    const other = forHost({ binding: binding() });
    assert.ok(other);
    assert.notEqual(other, service);
    // Lazy: nothing under the binding's parent until a capture is actually requested.
    assert.equal(fs.existsSync(path.dirname(first.dir)), false);
  });
}

/** Removes the signal listeners `localSiteSupervisorForHost` prepended, returning the SIGTERM one. */
function takeAddedSignalListeners(before: Map<string, Function[]>): Function[] {
  const added: Function[] = [];
  for (const [signal, listeners] of before) {
    for (const listener of process.listeners(signal as NodeJS.Signals)) {
      if (listeners.includes(listener)) continue;
      process.removeListener(signal, listener as () => void);
      if (signal === "SIGTERM") added.push(listener);
    }
  }
  return added;
}

test("local site supervisor: one per binding directory; a SIGTERM listener stops it so later starts refuse as SITE_HOST_STOPPING", async (t) => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", PORT: "4400", JINI_AGENT_DAEMON_URL: "http://127.0.0.1:4555" });
  const before = new Map(["SIGTERM", "SIGINT", "SIGHUP", "exit"].map((signal) => [signal, process.listeners(signal as NodeJS.Signals)]));
  const first = binding();
  const supervisor = localSiteSupervisorForHost({ binding: first });
  assert.ok(supervisor);
  assert.equal(localSiteSupervisorForHost({ binding: { ...first } }), supervisor);
  assert.deepEqual(supervisor.list(), []);

  const sigterm = takeAddedSignalListeners(before);
  assert.equal(sigterm.length, 1);
  sigterm[0]!();
  await assert.rejects(supervisor.start({ name: "another-site" }), { name: "LocalSiteError", code: "SITE_HOST_STOPPING" });
});

test("local site supervisor: the TOVU_LOCAL_SITE_LIMIT override reaches the supervisor (an out-of-range limit refuses assembly)", (t) => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", JINI_AGENT_DAEMON_PORT: "4556", TOVU_LOCAL_SITE_LIMIT: "0" });
  assert.throws(() => localSiteSupervisorForHost({ binding: binding() }), { name: "LocalSiteError", code: "INVALID_SITE_LIMIT" });
});

test("shutdownLocalSiteHosts stops every assembled supervisor, so none accepts a start afterwards", async (t) => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1" });
  const before = new Map(["SIGTERM", "SIGINT", "SIGHUP", "exit"].map((signal) => [signal, process.listeners(signal as NodeJS.Signals)]));
  const supervisor = localSiteSupervisorForHost({ binding: binding() });
  takeAddedSignalListeners(before);
  assert.ok(supervisor);
  await shutdownLocalSiteHosts({});
  await assert.rejects(supervisor.start({ name: "another-site" }), { code: "SITE_HOST_STOPPING" });
});
