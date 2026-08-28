import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { registerAdminContentTypeListRoute } from "../../routes/admin/content-types/list.js";
import { registerAdminContentTypeRegisterRoute } from "../../routes/admin/content-types/register.js";
import { registerAdminContentTypeUpdateFieldsRoute } from "../../routes/admin/content-types/update-fields.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file The HUMAN half of the `fields` shape-validation boundary
 * (`features/content-types/field-defs.ts`). The agent half is
 * `src/assistant/__tests__/tool-registrations.contracts.test.ts`.
 *
 * These endpoints previously validated `fields` with `Array.isArray(body.fields)` and then cast the
 * result, which left three reachable defects — each has a test below marked with the behavior it
 * replaces:
 *   - a non-boolean `required`/`queryable` was accepted and persisted verbatim (201, bad data);
 *   - a non-object element threw a TypeError inside the domain grammar guard (500);
 *   - a misspelled key was silently dropped (201, field quietly non-queryable).
 *
 * The control tests at the bottom are the load-bearing half: they prove this boundary did NOT take
 * ownership of the CIC U-002-B1 domain rules. Grammar, reserved-key, kind-enum and queryable-cap
 * rejections must still come from `write-service.ts`'s guard chain in its fixed order (AC-38).
 */
function buildTestApp(): express.Express {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminContentTypeListRoute(app, deps);
  registerAdminContentTypeRegisterRoute(app, deps);
  registerAdminContentTypeUpdateFieldsRoute(app, deps);
  return app;
}

const VALID_FIELD = { name: "prep_minutes", kind: "integer", required: false, queryable: true };

async function postRegister(baseUrl: string, cookie: string, body: unknown): Promise<{ status: number; body: { error?: string; code?: string } }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as { error?: string; code?: string } };
}

test("REGISTER rejects a non-boolean 'queryable' with 400 — it used to return 201 and persist the string verbatim", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [{ ...VALID_FIELD, queryable: "yes" }] });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, "VALIDATION_ERROR");
  assert.match(String(res.body.error), /fields\[0\]\.queryable must be a boolean, received a string/);

  const listed = await fetch(`${baseUrl}/api/admin/v1/content-types`, { headers: { cookie } });
  const { items } = (await listed.json()) as { items: Array<{ key: string }> };
  assert.equal(items.length, 0, "the rejected registration must not have been persisted");
});

test("REGISTER rejects a non-boolean 'required' with 400 — it used to be stored in the record and its revision stateJson", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [{ ...VALID_FIELD, required: "maybe" }] });

  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /fields\[0\]\.required must be a boolean/);
});

test("REGISTER rejects a null element with 400, not the 500 the TypeError inside the grammar guard used to produce", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [null] });

  assert.equal(res.status, 400, "a malformed body is the client's error, never a server fault");
  assert.equal(res.body.code, "VALIDATION_ERROR");
  assert.match(String(res.body.error), /fields\[0\] must be an object, received null/);
});

test("REGISTER reports a misspelled key with 400 instead of silently dropping it", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [{ ...VALID_FIELD, queryible: true }] });

  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /fields\[0\]\.queryible/);
  assert.match(String(res.body.error), /name, kind, required, queryable/);
});

test("REGISTER rejects a non-array 'fields' with 400 and names the type received", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  assert.match(String((await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: "prep_minutes" })).body.error), /fields must be an array, received a string/);
  assert.equal((await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe" })).status, 400);
});

test("UPDATE-FIELDS applies the same shape rules — the two sibling routes cannot drift", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  assert.equal((await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [VALID_FIELD] })).status, 201);

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ ...VALID_FIELD, required: 1 }], expectedVersion: 1 }),
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string; code?: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(String(body.error), /fields\[0\]\.required must be a boolean, received a number/);
});

test("UPDATE-FIELDS still requires expectedVersion, and says so without mentioning fields", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  assert.equal((await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [VALID_FIELD] })).status, 201);

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [VALID_FIELD] }),
  });

  assert.equal(res.status, 400);
  assert.match(String(((await res.json()) as { error?: string }).error), /'expectedVersion' \(number\) is required/);
});

// ---------------------------------------------------------------------------
// Controls — the boundary must NOT have taken over the domain's guard chain
// ---------------------------------------------------------------------------

test("CONTROL: a valid registration still succeeds, with both booleans round-tripping as booleans", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [{ ...VALID_FIELD, required: true }] }),
  });

  assert.equal(res.status, 201);
  const created = (await res.json()) as { contentType: { fields: Array<{ required: unknown; queryable: unknown }> } };
  assert.equal(created.contentType.fields[0].required, true);
  assert.equal(created.contentType.fields[0].queryable, true);
});

test("CONTROL: an empty 'fields' array is still legal", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  assert.equal((await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [] })).status, 201);
});

test("CONTROL: a grammar-invalid field name is still rejected by CIC U-002-B1 guard 3, not by the shape boundary", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [{ ...VALID_FIELD, name: "NotValidGrammar" }] });

  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /fails the identifier grammar gate/, "grammar ownership must stay with the domain guard — a shape-boundary message here would mean the rule moved");
});

test("CONTROL: a kind outside the closed enum is still rejected with the domain's own field-kind error", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields: [{ ...VALID_FIELD, kind: "bogus" }] });

  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /not one of the closed field-kind enum/);
});

test("CONTROL: the reserved-key check still fires ahead of any field rule (AC-38's fixed guard order)", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

  const res = await postRegister(baseUrl, cookie, { key: "post", label: "Post", fields: [{ ...VALID_FIELD, name: "NotValidGrammar" }] });

  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /permanently reserved/, "guard 2 must still beat guard 3 — the shape boundary passes both of these through");
});

test("CONTROL: exceeding the queryable-field cap is still guard 5's rejection, not the shape boundary's", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  const fields = Array.from({ length: 21 }, (_, i) => ({ name: `f_${i}`, kind: "integer", required: false, queryable: true }));

  const res = await postRegister(baseUrl, cookie, { key: "recipe", label: "Recipe", fields });

  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /more than 20 queryable fields/);
});
