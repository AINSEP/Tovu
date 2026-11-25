import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express, { Router } from "express";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { createRoutinesNotReadyStarter, startServingRoutines, ROUTINES_NOT_READY } from "../serving-routines.js";
import { ROUTINE_ROUTE_BASE } from "../assistant-routines.js";

/**
 * @file The serving bindings (P3-T1a.T/T1b.T) through real Express and the real admin JSON ports: the
 * session-credential gate, the same-origin guard on writes, the verified-eligibility gate, the passive
 * second window, and the wake receiver's install/teardown. Owner access is injected (identity is not under test).
 */

const routeDeps = { workspaceId: "ws-1", adminAssistantEnabled: true, authorize: async () => {} } as never;

function fakeChannel() {
  const listeners = new Set<(message: unknown) => void>();
  return { listeners, on: (_event: "message", fn: (message: unknown) => void) => listeners.add(fn), off: (_event: "message", fn: (message: unknown) => void) => listeners.delete(fn) };
}

function site(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(path.join(tmpdir(), "serving-routines-"));
  const drains: Array<() => Promise<void>> = [];
  const registrations: Array<() => unknown> = [];
  t.after(async () => { for (const drain of drains) await drain(); for (const registration of registrations) registration(); rmSync(root, { recursive: true, force: true }); });
  const hooks = { dbPath: path.join(root, "content.db"), beforeStoreClose: ({ drain }: { drain: () => Promise<void> }) => { drains.push(drain); },
    onStoreClose: ({ registration }: { registration: () => unknown }) => { registrations.push(registration); } };
  return { hooks };
}

function boot(t: { after: (fn: () => void) => void }, { desktopEligible = true, hooks = site(t).hooks, holderId = "boot-a", opened = { count: 0 } } = {}) {
  const routeErrors = createRouteIncidentReporter().errors;
  const router = Router();
  const channel = fakeChannel();
  const serving = startServingRoutines({ errors: routeErrors, routeDeps, router, desktopEligible, releaseEnabled: true, reporter: { record: () => assert.fail("no incident is expected") } }, { storeHooks: hooks, channel, composeOverrides: {
    timers: { schedule: () => () => {} }, log: () => {}, writeBeacon: async () => {},
    openSqlite: (file) => { opened.count += 1; return openNativeSqlite(file); },
    policy: { releaseEnabled: true, access: async ({ actor }) => actor.principalId === "owner-1" } } });
  void holderId;
  return { router, channel, serving, opened };
}

test("cross-origin writes and non-session credentials are refused through the real admin mount", async (t) => {
  const { router, serving } = boot(t);
  await serving.ready;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.locals.principal = { id: "owner-1", workspaceId: "ws-1", kind: "user", roles: ["owner"] }; res.locals.authCredentialKind = req.get("x-test-kind") ?? "session"; next(); });
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = JSON.stringify({ name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 } });
  const apiKey = await fetch(`${origin}${ROUTINE_ROUTE_BASE}`, { headers: { "x-test-kind": "api_key" } });
  assert.equal(apiKey.status, 403);
  assert.equal(((await apiKey.json()) as { details: { reason: string } }).details.reason, "credential_kind_not_permitted");
  const foreign = await fetch(`${origin}${ROUTINE_ROUTE_BASE}`, { method: "POST", body, headers: { "content-type": "application/json", origin: "https://evil.example" } });
  assert.equal(foreign.status, 403);
  const listed = await fetch(`${origin}${ROUTINE_ROUTE_BASE}`);
  assert.equal(listed.status, 200);
  assert.deepEqual(((await listed.json()) as { routines: unknown[] }).routines, [], "the refused write created nothing");
  const sameOrigin = await fetch(`${origin}${ROUTINE_ROUTE_BASE}`, { method: "POST", body, headers: { "content-type": "application/json", origin } });
  assert.ok(sameOrigin.status < 300, `same-origin owner write succeeds (got ${sameOrigin.status})`);
  await serving.stop();
});

test("an unverified boot opens no routine DB and installs no wake receiver, even with an owning store", async (t) => {
  const { serving, channel, opened } = boot(t, { desktopEligible: false });
  const host = await serving.ready;
  assert.equal(host.availability(), "desktop-only");
  assert.equal(opened.count, 0);
  assert.equal(channel.listeners.size, 0);
});

test("a verified boot installs the wake receiver and stop removes it", async (t) => {
  const { serving, channel } = boot(t);
  assert.equal((await serving.ready).availability(), "ready");
  assert.equal(channel.listeners.size, 1);
  await serving.stop();
  assert.equal(channel.listeners.size, 0);
});

test("passive profile: a second window on the same site sees other-window", async (t) => {
  const { hooks } = site(t);
  const first = boot(t, { hooks });
  assert.equal((await first.serving.ready).availability(), "ready");
  const second = boot(t, { hooks });
  const passive = await second.serving.ready;
  assert.equal(passive.availability(), "other-window");
  await passive.reconcile({ reason: "wake" });
  await first.serving.stop();
  await second.serving.stop();
});

test("the fallback starter settles failed with the not-ready copy and launches nothing", async () => {
  const start = await createRoutinesNotReadyStarter()({ routine: {} as never, trigger: "scheduled" as never, startedAt: 0, runId: "run-1" });
  assert.deepEqual(await start.completion, { status: "failed", error: ROUTINES_NOT_READY, errorCode: "ROUTINES_NOT_READY" });
  assert.equal(ROUTINES_NOT_READY, "Routines are not ready yet.");
});
