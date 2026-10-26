/** Phase 1 live render -> native/JSON POST wiring. Written only; execution is deferred by owner. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { renderHtmlForm } from "@jini-ai/cms/forms";
import { InMemoryPostRepo } from "#src/features/post/index";
import { formSubmissionAttemptsFor } from "#src/features/forms/index";
import { loadTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { decodeFormFlashCookieValue } from "../../../http/site/form-render.js";

test("live GET and POST share issuance: fast retries preserve text, 1000 ms admits once, static exports issue nothing", async (t) => {
  const base = createRouteDeps();
  let nowMs = Date.parse("2026-10-26T00:00:00Z");
  const issuedAtMs = nowMs;
  const clock = { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() };
  const fields = [{ id: "name", label: "Name", type: "text" as const, required: true }];
  const theme = loadTheme({ themeDir: path.resolve("content/themes/static/basic-2"), id: "basic-2", source: "built-in" });
  const form = renderHtmlForm({ slug: "contact", fields, action: "/forms/contact/submit", hooks: {
    form: "data-tovu-form", success: "data-tovu-form-success", error: "data-tovu-form-error", field: "data-tovu-field",
  } }, {});
  const deps = { ...base, clock, postRepo: new InMemoryPostRepo([]), themes: [{ ...theme, pages: { ...theme.pages, index: `<html><body>${form}</body></html>` } }] };
  await deps.formDefinitionRepo.create({ id: "timed-form", workspaceId: deps.workspaceId, name: "Contact", slug: "contact", fields,
    status: "active", notify: { enabled: false, recipients: [] }, version: 1, createdAt: clock.nowIso(), updatedAt: clock.nowIso(),
  });
  assert.equal(deps.formSubmissionAttempts, formSubmissionAttemptsFor({ submissionRepo: deps.formSubmissionRepo }));
  const baseUrl = await startTestServer(createApp(deps), t);
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  const html = await page.text();
  const token = html.match(/name="_attempt" value="([^"]+)"/)?.[1];
  assert.ok(token);
  assert.equal(deps.formSubmissionAttempts?.ageMs({ workspaceId: deps.workspaceId, slug: "contact", attemptToken: token, nowMs: issuedAtMs }), 0);
  const rows = async () => (await deps.formSubmissionRepo.listByDefinition({ workspaceId: deps.workspaceId, formDefinitionId: "timed-form", limit: 10 })).items;
  const postJson = () => fetch(`${baseUrl}/forms/contact/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ada", _attempt: token }) });
  nowMs += 999;
  const fast = await postJson();
  assert.equal(fast.status, 422);
  assert.deepEqual(await fast.json(), { error: "Please wait a moment, then submit again.", code: "FORMS_SUBMISSION_TOO_FAST" });
  assert.deepEqual(await rows(), []);
  const native = await fetch(`${baseUrl}/forms/contact/submit`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html", referer: `${baseUrl}/` },
    body: new URLSearchParams({ name: "Ada", _attempt: token }),
  });
  assert.equal(native.status, 303);
  assert.equal(native.headers.get("location"), "/?form=contact&form_status=too-fast");
  const flash = native.headers.get("set-cookie")?.match(/tovu_form_flash=([^;]*)/)?.[1];
  assert.ok(flash);
  assert.deepEqual(decodeFormFlashCookieValue(decodeURIComponent(flash)), { slug: "contact", values: { name: "Ada" } });
  const retryPage = await fetch(`${baseUrl}${native.headers.get("location")}`, { headers: { cookie: `tovu_form_flash=${flash}` } });
  const retryHtml = await retryPage.text();
  assert.ok(retryHtml.includes("Please wait a moment, then submit again."));
  assert.ok(retryHtml.includes('name="name"'));
  assert.ok(retryHtml.includes('value="Ada"'));
  assert.notEqual(retryHtml.match(/name="_attempt" value="([^"]+)"/)?.[1], token);
  nowMs += 1;
  const accepted = await postJson();
  assert.equal(accepted.status, 201);
  assert.deepEqual(await accepted.json(), { status: "accepted" });
  const duplicate = await postJson();
  assert.equal(duplicate.status, 201);
  assert.deepEqual(await duplicate.json(), { status: "accepted" });
  assert.deepEqual((await rows()).map(row => row.data), [{ name: "Ada" }]);
  const exported = await fetch(baseUrl, { headers: { "x-tovu-static-export": "1" } });
  assert.equal(exported.status, 200);
  assert.equal((await exported.text()).includes('name="_attempt"'), false);
});
