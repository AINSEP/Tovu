import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { captureRouteError } from "#src/server/inbound/shared/observability-middleware";
import { registerAdminSettingsEventsRoute, type SettingsEventsDeps } from "../events.js";

// REGRESSION (hung async route): the ledger head read runs after the SSE head is written. When it
// failed, Express 4 dropped the rejection and the stream stayed open with no feed behind it.
test("a failed ledger head read after the stream opened closes the stream instead of leaving it open", async (t) => {
  t.mock.method(console, "error", () => {});
  const deps: SettingsEventsDeps = {
    workspaceId: "ws", settingsReady: Promise.resolve(),
    authorize: async () => ({ allowed: true, reason: "granted" }),
    settingsRepo: {
      maxRevisionSeq: async () => { throw new Error("revision head read failed"); },
      listRevisionsSince: async () => [],
      findDefinitionBySettingId: async () => null,
    },
  };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminSettingsEventsRoute(app, deps);
  app.use(captureRouteError);
  const baseUrl = await startTestServer(app, t);

  // A hang is the bug; the client timeout turns it into a failed assertion instead of a stuck test.
  // The SSE head is not flushed until the first write, so a closed stream may surface either as a
  // body that ends or as a fetch that fails with "other side closed"; only a timeout means it hung.
  const outcome = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws/settings/events`, { signal: AbortSignal.timeout(2_000) })
    .then((response) => response.text())
    .then(
      () => "closed",
      (error: unknown) => (error instanceof Error && error.name === "TimeoutError" ? "hung" : "closed"),
    );
  assert.equal(outcome, "closed");
});

// A closed stream with no word tells the open settings tab nothing; it should be told in plain
// words that live updates stopped, so it can show that rather than sit silent.
test("a failed ledger head read sends one error event in plain words before the stream ends", async (t) => {
  t.mock.method(console, "error", () => {});
  const deps: SettingsEventsDeps = {
    workspaceId: "ws", settingsReady: Promise.resolve(),
    authorize: async () => ({ allowed: true, reason: "granted" }),
    settingsRepo: {
      maxRevisionSeq: async () => { throw new Error("revision head read failed"); },
      listRevisionsSince: async () => [],
      findDefinitionBySettingId: async () => null,
    },
  };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminSettingsEventsRoute(app, deps);
  app.use(captureRouteError);
  const baseUrl = await startTestServer(app, t);

  const body = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws/settings/events`, { signal: AbortSignal.timeout(2_000) }).then((response) => response.text());

  assert.match(body, /event: error\n/);
  assert.match(body, /Live settings updates stopped/);
  assert.equal(body.includes("revision head read failed"), false, "the raw cause must stay in the server log");
});
