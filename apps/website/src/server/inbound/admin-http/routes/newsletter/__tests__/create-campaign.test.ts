import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminNewsletterCreateCampaignRoute } from "../create-campaign.js";
import type { NewsletterRouteDeps } from "../deps.js";

/**
 * @file Route-level tests for `CREATE_CAMPAIGN` (`POST .../newsletter/campaigns`).
 *
 * `newsletter-routes.test.ts` only drives the happy path. This file covers the request-body
 * validation (every one of the five required strings, and `bodyJson` as an object), that the 400
 * is answered before `authorize()` and before anything is persisted, and that a non-string
 * `preheader` is stored as `null` rather than coerced.
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns`;
const VALIDATION_BODY = {
  error: "subject, fromName, fromEmail, replyTo, listId (strings) and bodyJson (object) are required",
  code: "VALIDATION_ERROR",
};

function validBody(listId: string): Record<string, unknown> {
  return {
    subject: "Autumn news",
    preheader: "What changed",
    fromName: "Acme",
    fromEmail: "news@acme.test",
    replyTo: "help@acme.test",
    listId,
    bodyJson: { type: "doc", content: [] },
  };
}

async function buildApp(): Promise<{ app: express.Express; deps: NewsletterRouteDeps; authorizeCalls: unknown[]; listId: string }> {
  const base = createRouteDeps();
  const authorizeCalls: unknown[] = [];
  const deps = {
    ...base,
    authorize: async (input: unknown) => {
      authorizeCalls.push(input);
      return { allowed: true, reason: "matched" };
    },
  } as unknown as NewsletterRouteDeps;
  await deps.newsletterReady;
  const lists = await deps.newsletterListRepo.list({ workspaceId: WORKSPACE_ID });
  const listId = lists[0]?.id ?? "";
  assert.ok(listId, "boot seeds a default newsletter list");

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminNewsletterCreateCampaignRoute(app, deps);
  return { app, deps, authorizeCalls, listId };
}

async function post(baseUrl: string, body: unknown) {
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

test("create-campaign: each required string field, missing or non-string, is a 400 before authorize() and before anything is saved", async (t) => {
  const { app, deps, authorizeCalls, listId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  for (const field of ["subject", "fromName", "fromEmail", "replyTo", "listId"]) {
    const missing = validBody(listId);
    delete missing[field];
    const missingRes = await post(baseUrl, missing);
    assert.equal(missingRes.status, 400, `missing ${field}`);
    assert.deepEqual(missingRes.json, VALIDATION_BODY, `missing ${field}`);

    const wrongType = { ...validBody(listId), [field]: 123 };
    const wrongRes = await post(baseUrl, wrongType);
    assert.equal(wrongRes.status, 400, `numeric ${field}`);
    assert.deepEqual(wrongRes.json, VALIDATION_BODY, `numeric ${field}`);
  }

  assert.equal(authorizeCalls.length, 0);
  assert.deepEqual(await deps.newsletterCampaignRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("create-campaign: bodyJson must be a non-null object — missing, null and a string are all 400", async (t) => {
  const { app, listId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  for (const bodyJson of [undefined, null, "a doc"]) {
    const res = await post(baseUrl, { ...validBody(listId), bodyJson });
    assert.equal(res.status, 400, `bodyJson=${JSON.stringify(bodyJson)}`);
    assert.deepEqual(res.json, VALIDATION_BODY);
  }
});

test("create-campaign: a valid body is a 201 draft carrying the submitted envelope fields, attributed to the caller", async (t) => {
  const { app, deps, authorizeCalls, listId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await post(baseUrl, validBody(listId));
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const data = res.json.data as Record<string, unknown>;
  assert.equal(data.status, "draft");
  assert.equal(data.subject, "Autumn news");
  assert.equal(data.preheader, "What changed");
  assert.equal(data.fromName, "Acme");
  assert.equal(data.fromEmail, "news@acme.test");
  assert.equal(data.replyTo, "help@acme.test");
  assert.equal(data.listId, listId);
  assert.equal(data.createdByPrincipal, "test-principal");
  assert.deepEqual(authorizeCalls[0], {
    principalId: "test-principal",
    permission: "admin.newsletter.campaign.compose",
    workspaceId: WORKSPACE_ID,
    entityType: "newsletter_campaign",
  });

  const stored = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: String(data.id) });
  assert.equal(stored?.subject, "Autumn news");
});

test("create-campaign: a non-string preheader is stored as null, not coerced to text", async (t) => {
  const { app, listId } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await post(baseUrl, { ...validBody(listId), preheader: { nested: true } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal((res.json.data as { preheader: unknown }).preheader, null);
});
