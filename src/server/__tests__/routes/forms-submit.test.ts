import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { InMemoryEventBus, InMemoryOutbox } from "#src/core/events/index";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "#src/forms/repo.memory";
import { FORMS_SUBMIT_PROFILE } from "#src/forms/rate-limit-profile";
import type { FormDefinitionRecord } from "#src/forms/types";
import { createRateLimiter } from "#src/core/rate-limit/rate-limit";
import { registerFormsSubmitRoute } from "../../routes/site/forms-submit";

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
