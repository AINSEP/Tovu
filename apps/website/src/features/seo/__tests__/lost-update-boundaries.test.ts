import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { ToolExecutionContext } from "@jini-ai/core";
import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerAdminSeoPutEntryRoute } from "#src/server/inbound/admin-http/routes/seo/put-entry";
import { buildSeoRegistrations } from "../tool-registrations.js";

function conflict() {
  return new RecordVersionConflictError({ recordKind: "entry", recordId: "post-home", expectedVersion: 1, currentVersion: 2 });
}

test("SEO tool requires the read version and reports a conflict as not applied", async () => {
  const deps = createRouteDeps();
  await deps.seoReady;
  deps.authorize = async () => ({ allowed: true, reason: "test" });
  const tool = buildSeoRegistrations(deps).find((item) => item.descriptor.id === "seo_set_entry_overrides");
  assert.ok(tool);
  const context = (input: unknown) => ({ executionId: "exec", principal: { id: "editor" }, run: { id: "run" }, input, signal: new AbortController().signal }) as ToolExecutionContext;
  await assert.rejects(tool.handler(context({ entryId: "post-home", title: "First" })), /content_read\.seo_entry_meta/);
  deps.seoDeps.postRepo.saveIfVersion = async () => { throw conflict(); };
  await assert.rejects(tool.handler(context({ entryId: "post-home", title: "First", expectedVersion: 1 })), /NOT applied/);
});

test("SEO PUT maps a stale basis to 409 and a malformed basis to 400", async () => {
  const deps = createRouteDeps();
  await deps.seoReady;
  deps.authorize = async () => ({ allowed: true, reason: "test" });
  deps.seoDeps.postRepo.saveIfVersion = async () => { throw conflict(); };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "editor" }; next(); });
  registerAdminSeoPutEntryRoute(app, deps);
  const path = `/api/admin/v1/workspaces/${deps.workspaceId}/seo/entries/post-home`;
  const stale = await dispatchJsonRequest(app, "PUT", path, { title: "Edit", expectedVersion: 1 });
  assert.equal(stale.status, 409);
  assert.ok(stale.body && typeof stale.body === "object" && "code" in stale.body);
  assert.equal(stale.body.code, "VERSION_CONFLICT");
  const malformed = await dispatchJsonRequest(app, "PUT", path, { title: "Edit", expectedVersion: "1" });
  assert.equal(malformed.status, 400);
});
