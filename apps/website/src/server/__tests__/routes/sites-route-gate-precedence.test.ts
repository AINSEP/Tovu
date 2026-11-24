import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import express from "express";

import { startTestServer } from "../helpers/http-test-server.js";
import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "#src/server/runtime/composition/modules/sites";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";

/**
 * @file Admission order of the four gated Sites routes (config read, home choice, Create, Activate),
 * mounted directly — no session middleware, so no principal on `res.locals`. The hand-written
 * routes answered workspace → deployment gate → principal: a closed gate refused with its own
 * 403/409 even before the session was read, and an open gate with no principal failed closed in
 * `getAuthedPrincipal` (the redacted 500) before any side effect. Expected bodies are copied from
 * the hand-written routes (`a4a5457969^1`), never read from production code.
 */

const BASE = "/api/admin/v1/workspaces/ws/system/sites";
const SWITCHING_DISABLED = { error: "site switching is disabled on this deployment", code: "SITE_SWITCHING_DISABLED" };
const BINDING_NOT_SWITCHABLE = {
  error: "this server was started against a specific site directory (tovu serve <dir>) with no related sites/ folder to manage — Create/Activate are unavailable",
  code: "SITE_BINDING_NOT_SWITCHABLE",
};
const SETTINGS_DISABLED = { error: "Local sites management is disabled." };

// The redacted-500 copy each hand-written route chose (`sendAdminFailure` by operation/method).
const LOAD_COPY = { message: "The sites could not be loaded.", action: "Try loading them again. If it still fails, Report this error ID.", step: "Load sites", discloseDetails: false };
const SAVE_COPY = { message: "The site save could not be completed.", action: "Check whether your changes were saved before repeating the save. Report this error ID.", step: "Save site", discloseDetails: false };
const OPERATION_COPY = { message: "The site operation could not be completed.", action: "Check the result before repeating this operation. Report this error ID.", step: "site operation", discloseDetails: false };

const ROUTES = [
  { label: "GET config", method: "GET", suffix: "/config", body: undefined, kind: "settings", failure: LOAD_COPY },
  { label: "PUT home", method: "PUT", suffix: "/home", body: { path: "/nonexistent-sites-home" }, kind: "settings", failure: SAVE_COPY },
  { label: "POST create", method: "POST", suffix: "", body: { name: "new-site" }, kind: "switch", failure: OPERATION_COPY },
  { label: "POST activate", method: "POST", suffix: "/tovu-com/activate", body: { restartNow: true }, kind: "switch", failure: OPERATION_COPY },
] as const;

/** A direct mount with counted collaborators: every count is a side effect the gate must precede. */
function fixture({ t }: { t: TestContext }, { switcherEnabled, switcherCompatible }: { switcherEnabled: boolean; switcherCompatible: boolean }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sites-gate-precedence-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const real = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux", sourceRoots: [] });
  const calls = { authorize: 0, config: 0, setHome: 0, createSite: 0, listSites: 0, persist: 0 };
  const sitesWorkspace = {
    ...real,
    config: (required: Record<string, never>) => { calls.config += 1; return real.config(required); },
    setHome: (required: { path: string }) => { calls.setHome += 1; return real.setHome(required); },
  };
  const deps: AdminSitesDeps = {
    workspaceId: "ws",
    authorize: async () => { calls.authorize += 1; return { allowed: true, reason: "owner" }; },
    siteBinding: { dir: path.join(root, "sites", "tovu-com"), name: "tovu-com", dirOverridden: false, switcherCompatible },
    createSite: async () => { calls.createSite += 1; throw new Error("must not create"); },
    isSiteSwitcherEnabled: () => switcherEnabled,
    sitesWorkspace, sitePreviews: null, devRestart: null,
    listSites: () => { calls.listSites += 1; return []; },
    persistActiveSite: () => { calls.persist += 1; },
    readPersistedActiveSite: () => null,
  };
  const app = express();
  app.use(express.json());
  registerAdminSitesRoutes({ app, deps });
  return { app, calls };
}

async function send({ origin, route }: { origin: string; route: (typeof ROUTES)[number] }) {
  const response = await fetch(`${origin}${BASE}${route.suffix}`, {
    method: route.method,
    headers: { "content-type": "application/json" },
    ...(route.body === undefined ? {} : { body: JSON.stringify(route.body) }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const NO_CALLS = { authorize: 0, config: 0, setHome: 0, createSite: 0, listSites: 0, persist: 0 };

for (const route of ROUTES) {
  test(`sites gate precedence: ${route.label} — closed flag, no principal ⇒ the gate's 403, before the session is read`, async (t) => {
    const f = fixture({ t }, { switcherEnabled: false, switcherCompatible: true });
    const reply = await send({ origin: await startTestServer(f.app, t), route });
    assert.deepEqual(reply, { status: 403, body: route.kind === "settings" ? SETTINGS_DISABLED : SWITCHING_DISABLED });
    assert.deepEqual(f.calls, NO_CALLS);
  });

  test(`sites gate precedence: ${route.label} — open gate, no principal ⇒ fails closed (redacted 500), no side effect`, async (t) => {
    const f = fixture({ t }, { switcherEnabled: true, switcherCompatible: true });
    const reply = await send({ origin: await startTestServer(f.app, t), route });
    assertAdminResponse({ actual: reply, expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: route.failure });
    assert.deepEqual(f.calls, NO_CALLS);
  });
}

for (const route of ROUTES.filter((candidate) => candidate.kind === "switch")) {
  test(`sites gate precedence: ${route.label} — non-switchable binding, no principal ⇒ the gate's 409, before the session is read`, async (t) => {
    const f = fixture({ t }, { switcherEnabled: true, switcherCompatible: false });
    const reply = await send({ origin: await startTestServer(f.app, t), route });
    assert.deepEqual(reply, { status: 409, body: BINDING_NOT_SWITCHABLE });
    assert.deepEqual(f.calls, NO_CALLS);
  });
}
