import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "#src/features/forms/repo.memory";
import { FORMS_SUBMIT_PROFILE } from "#src/features/forms/rate-limit-profile";
import type { FormDefinitionRecord, FieldDescriptor } from "#src/features/forms/index";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { registerFormsSubmitRoute } from "../../inbound/public-http/routes/site/forms-submit.js";
import { decodeFormFlashCookieValue, FORM_FLASH_COOKIE_NAME } from "../../inbound/public-http/http/site/render.js";

/**
 * @file Route-level tests for the public `POST /forms/:slug/submit` endpoint (SPEC-010 REQ-05/07,
 * AC-07/11/12). No `Authorization` header required; nonexistent and disabled slugs are
 * indistinguishable `FORMS_DEFINITION_NOT_FOUND`.
 */
const NOW = "2026-07-13T00:00:00.000Z";
const WORKSPACE_ID = "workspace-1";

function makeDefinition(overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id: "def-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [{ id: "name", label: "Name", type: "text", required: true }],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function startTestApp() {
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const clock = { nowIso: () => NOW };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };

  const app = express();
  app.use(express.json());
  registerFormsSubmitRoute(app, {
    workspaceId: WORKSPACE_ID,
    submitForm: {
      definitionRepo,
      submissionRepo,
      outbox: new InMemoryOutbox(),
      bus: new InMemoryEventBus(),
      clock,
      idGen,
      rateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
    },
  });

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, definitionRepo };
}

test("POST /forms/:slug/submit: AC-07/REQ-05 — no Authorization header required, returns 201", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, "accepted");
});

test("POST /forms/:slug/submit: AC-11/REQ-07 — a nonexistent slug returns 404 FORMS_DEFINITION_NOT_FOUND", async (t) => {
  const { server, baseUrl } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/forms/nope/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORMS_DEFINITION_NOT_FOUND");
});

test("POST /forms/:slug/submit: AC-12/REQ-07 — a disabled slug returns the identical 404 FORMS_DEFINITION_NOT_FOUND", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition({ status: "disabled" }));

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORMS_DEFINITION_NOT_FOUND");
});

test("POST /forms/:slug/submit: an invalid payload returns 400 FORMS_SUBMISSION_VALIDATION_ERROR", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORMS_SUBMISSION_VALIDATION_ERROR");
});

test("POST /forms/:slug/submit: AC-13 — a honeypot-tripped request returns the identical 201 accepted response", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada", _hp: "bot-filled-this" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, "accepted");
});

test("POST /forms/:slug/submit: AC-14 — the 6th submission in-window is rate-limited 429", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/forms/contact/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    });
    assert.equal(res.status, 201);
  }

  const sixth = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(sixth.status, 429);
  const body = (await sixth.json()) as { code: string };
  assert.equal(body.code, "FORMS_RATE_LIMIT_EXCEEDED");
});

// ---------------------------------------------------------------------------
// Post/Redirect/Get content negotiation (2026-08-31 fix) — a native `<form>` POST navigates the
// browser to whatever this route returns; every branch used to reply with raw JSON, which a
// JavaScript-disabled visitor saw as a literal `{"status":"accepted"}` (or error) screen instead of
// their page. `Accept: text/html` (what a real browser form submission sends) now gets a 303
// Post/Redirect/Get back to the referring page instead; every existing test above sends no `Accept`
// header at all (or `application/json`) and is untouched by any of this — proof the JSON/API
// contract did not change.
// ---------------------------------------------------------------------------

test("POST /forms/:slug/submit: Accept: text/html + a valid submission redirects 303 back to the Referer with a success indicator, instead of the raw 201 JSON screen", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer: `${baseUrl}/get-in-touch?utm_source=old`,
    },
    body: "name=Ada",
  });
  assert.equal(res.status, 303);
  const location = new URL(res.headers.get("location") ?? "", baseUrl);
  assert.equal(location.pathname, "/get-in-touch");
  assert.equal(location.searchParams.get("form"), "contact");
  assert.equal(location.searchParams.get("form_status"), "success");
  // The referer's own pre-existing query params must survive the round trip untouched.
  assert.equal(location.searchParams.get("utm_source"), "old");
});

test("POST /forms/:slug/submit: a real browser's application/x-www-form-urlencoded body is parsed (not silently dropped) — without this, every JS-disabled submission would fail REQUIRED-field validation regardless of the redirect fix", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "name=Ada",
  });
  assert.equal(res.status, 201, "the required 'name' field must have been parsed off the urlencoded body");
});

test("POST /forms/:slug/submit: Accept: text/html + a validation failure redirects 303 with the field errors encoded, never the raw 400 JSON screen", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: "",
  });
  assert.equal(res.status, 303);
  const location = new URL(res.headers.get("location") ?? "", baseUrl);
  assert.equal(location.searchParams.get("form_status"), "validation");
  const fieldErrors = JSON.parse(location.searchParams.get("form_errors") ?? "[]") as Array<{ field: string; reason: string }>;
  assert.ok(fieldErrors.some((e) => e.field === "name"));
});

test("POST /forms/:slug/submit: Accept: text/html + rate limit redirects 303 with the retry-after seconds encoded, never the raw 429 JSON screen", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  for (let i = 0; i < 5; i++) {
    await fetch(`${baseUrl}/forms/contact/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    });
  }
  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", accept: "text/html" },
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(res.status, 303);
  const location = new URL(res.headers.get("location") ?? "", baseUrl);
  assert.equal(location.searchParams.get("form_status"), "rate_limited");
  assert.ok(Number(location.searchParams.get("form_retry_after")) > 0);
});

test("POST /forms/:slug/submit: Accept: text/html with NO Referer falls back to redirecting to '/' rather than erroring or guessing", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", accept: "text/html" },
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(res.status, 303);
  const location = new URL(res.headers.get("location") ?? "", baseUrl);
  assert.equal(location.pathname, "/");
});

test("POST /forms/:slug/submit: a cross-origin Referer is REJECTED as the redirect target (open-redirect guard) — falls back to '/' instead of trusting a visitor-controlled header", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      accept: "text/html",
      referer: "https://evil.example/phishing",
    },
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(res.status, 303);
  const location = new URL(res.headers.get("location") ?? "", baseUrl);
  assert.equal(location.origin, baseUrl, "must redirect within this same origin, never to the attacker's Referer");
  assert.equal(location.pathname, "/");
});

test("POST /forms/:slug/submit: Accept: application/json (an explicit API caller) still gets the untouched JSON contract, not a redirect", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ name: "Ada" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, "accepted");
});

// ---------------------------------------------------------------------------
// Validation flash cookie (2026-08-31 field-wipe fix) — OPEN BUG B from the 2026-08-31 handoff: a
// failed validation used to wipe every field the visitor already typed, not just the invalid one,
// because PRG's fresh GET cannot see the prior POST body. A validation failure reached via a real
// browser (`Accept: text/html`) now ALSO sets a short-lived, HttpOnly `tovu_form_flash` cookie
// carrying the OTHER submitted field values; `pages.ts` reads and clears it on the next GET.
// ---------------------------------------------------------------------------

/** Extracts and decodes the `{@link FORM_FLASH_COOKIE_NAME}` cookie from a raw `Set-Cookie` header,
 *  or `null` if that header is absent or names a different cookie. Returns the attribute tail
 *  separately (as one string) so tests can assert on `HttpOnly`/`SameSite`/`Max-Age`/`Secure`
 *  independently of the (URI-encoded) cookie value itself. */
function parseFlashCookieHeader(setCookieHeader: string | null): { raw: string; attrs: string } | null {
  if (!setCookieHeader) return null;
  const [nameValue, ...attrParts] = setCookieHeader.split(";").map((part) => part.trim());
  const eq = nameValue.indexOf("=");
  if (eq === -1 || nameValue.slice(0, eq) !== FORM_FLASH_COOKIE_NAME) return null;
  return { raw: decodeURIComponent(nameValue.slice(eq + 1)), attrs: attrParts.join("; ") };
}

test("POST /forms/:slug/submit: Accept: text/html + a validation failure sets a short-lived, HttpOnly, SameSite=Lax flash cookie carrying the OTHER submitted fields' values", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(
    makeDefinition({
      fields: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: true },
        { id: "message", label: "Message", type: "textarea", required: true },
      ],
    })
  );

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: "name=Ada&email=ada%40example.com", // "message" deliberately omitted -> validation failure
  });
  assert.equal(res.status, 303);
  const flash = parseFlashCookieHeader(res.headers.get("set-cookie"));
  assert.ok(flash, `expected a ${FORM_FLASH_COOKIE_NAME} cookie on a validation failure`);
  assert.match(flash!.attrs, /\bHttpOnly\b/);
  assert.match(flash!.attrs, /\bSameSite=Lax\b/);
  assert.match(flash!.attrs, /\bMax-Age=120\b/);
  assert.deepEqual(decodeFormFlashCookieValue(flash!.raw), { slug: "contact", values: { name: "Ada", email: "ada@example.com" } });
});

test("POST /forms/:slug/submit: a field of a type NOT in the repopulatable allowlist (e.g. a future 'password' type this codebase has not added yet) is never included in the flash cookie", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  // `FieldType` has no "password" literal today — cast deliberately to prove the ALLOWLIST (not a
  // denylist naming "password") already excludes any type it does not explicitly recognize.
  const sensitiveField = { id: "secret", label: "Secret", type: "password", required: false } as unknown as FieldDescriptor;
  await definitionRepo.create(
    makeDefinition({ fields: [{ id: "name", label: "Name", type: "text", required: true }, sensitiveField] })
  );

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: `secret=${encodeURIComponent("hunter2")}`, // "name" omitted -> validation failure; "secret" is the only value present
  });
  assert.equal(res.status, 303);
  assert.equal(
    parseFlashCookieHeader(res.headers.get("set-cookie")),
    null,
    "the only submitted value belongs to a non-allowlisted type, so no flash cookie should be set at all"
  );
});

test("POST /forms/:slug/submit: the flash cookie's Secure attribute reflects the request's real scheme — absent over plain HTTP, present when X-Forwarded-Proto: https", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(
    makeDefinition({
      fields: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: true },
      ],
    })
  );

  const plain = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: "name=Ada", // "email" omitted -> validation failure, "name" survives to flash
  });
  const plainFlash = parseFlashCookieHeader(plain.headers.get("set-cookie"));
  assert.ok(plainFlash, "expected a flash cookie over plain HTTP too");
  assert.doesNotMatch(plainFlash!.attrs, /Secure/, "a plain HTTP dev/test request must not get an unconditional Secure cookie");

  const viaHttpsProxy = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html", "x-forwarded-proto": "https" },
    body: "name=Ada",
  });
  const httpsFlash = parseFlashCookieHeader(viaHttpsProxy.headers.get("set-cookie"));
  assert.ok(httpsFlash);
  assert.match(httpsFlash!.attrs, /\bSecure\b/);
});

test("POST /forms/:slug/submit: a SUCCESSFUL submission never sets a flash cookie — only a validation failure does", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: "name=Ada",
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("POST /forms/:slug/submit: the JSON API path is completely unaffected by the flash-cookie fix — no Set-Cookie header on a validation failure without Accept: text/html", async (t) => {
  const { server, baseUrl, definitionRepo } = await startTestApp();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await definitionRepo.create(makeDefinition());

  const res = await fetch(`${baseUrl}/forms/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("set-cookie"), null);
});
