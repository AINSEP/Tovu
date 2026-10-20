import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { EntityNotLiveError } from "@jini-ai/cms/core";
import * as contentTypes from "#src/features/content-types/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { ContentTypesRouteDeps } from "../deps.js";

test("update-fields HTTP characterization", async (t) => {
  // Replace only the write port: keep the real parser and error constructors so instanceof
  // mappings, including compatibility errors the current writer never returns, stay pinned.
  let write: typeof contentTypes.updateContentTypeFields = async () => {
    throw new Error("unexpected write");
  };
  t.mock.module("#src/features/content-types/index", {
    namedExports: {
      ...contentTypes,
      updateContentTypeFields: (input: Parameters<typeof write>[0]) => write(input),
    },
  });
  const { registerAdminContentTypeUpdateFieldsRoute } = await import("../update-fields.js");
  const deps: ContentTypesRouteDeps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowMs: () => 0, nowIso: () => "1970-01-01T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    contentTypeRepo: new contentTypes.InMemoryContentTypeRepo(),
    contentTypeIndexProvisioner: new contentTypes.NoopContentTypeIndexProvisioner(),
    get entryRepo(): ContentTypesRouteDeps["entryRepo"] { throw new Error("unexpected entry access"); },
  };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.principal = { id: "operator", kind: "user", displayName: "Operator" };
    next();
  });
  registerAdminContentTypeUpdateFieldsRoute(app, deps);
  const baseUrl = await startTestServer(app, t);
  const fields = [{ name: "title", kind: "text", required: false, queryable: false }];
  async function send({ body }: { body: unknown }, _options = {}) {
    const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  const mappings: Array<{ error: Error; status: number; code: string }> = [
    { error: new contentTypes.ForbiddenError({ message: "revoked" }), status: 403, code: "FORBIDDEN" },
    { error: new contentTypes.ContentTypeNotFoundError({ message: "missing" }), status: 404, code: "CONTENT_TYPE_NOT_FOUND" },
    { error: new contentTypes.ContentTypeAlreadyExistsError({ key: "recipe", tombstoned: false }), status: 409, code: "CONTENT_TYPE_ALREADY_EXISTS" },
    { error: new EntityNotLiveError({ entityType: "content type", entityId: "recipe", state: "tombstoned" }), status: 409, code: "ENTITY_TOMBSTONED" },
    { error: new EntityNotLiveError({ entityType: "content type", entityId: "recipe", state: "trashed" }), status: 409, code: "ENTITY_IN_TRASH" },
    { error: new contentTypes.VersionConflictError({ message: "stale" }), status: 409, code: "VERSION_CONFLICT" },
    { error: new contentTypes.ValidationError({ message: "empty", reason: "fields_empty" }), status: 400, code: "VALIDATION_ERROR" },
    { error: new contentTypes.InvalidFieldShapeError({ path: "fields", expected: "array", received: "string" }), status: 400, code: "VALIDATION_ERROR" },
    { error: new contentTypes.InvalidFieldNameGrammarError({ message: "bad name" }), status: 400, code: "VALIDATION_ERROR" },
    { error: new contentTypes.InvalidFieldKindError({ message: "bad kind" }), status: 400, code: "VALIDATION_ERROR" },
    { error: new contentTypes.QueryableFieldCapExceededError({ message: "cap" }), status: 400, code: "VALIDATION_ERROR" },
    { error: new Error("write rejected"), status: 500, code: "INTERNAL_ERROR" },
  ];
  for (const { error, status, code } of mappings) {
    await t.test(`maps ${error.constructor.name} to ${code}`, async () => {
      write = async () => ({ ok: false, error });
      assert.deepEqual(await send({ body: { expectedVersion: 3, fields } }), {
        status, body: { error: error.message, code },
      });
    });
  }

  await t.test("success forwards parsed fields, scope and version and returns the write value", async () => {
    const contentType: contentTypes.ContentTypeRecord = {
      workspaceId: "ws-1", key: "recipe", label: "Recipe", fields: [], version: 4,
      status: "active", tombstonedAt: null,
    };
    const calls: Parameters<typeof write>[0][] = [];
    write = async (input) => { calls.push(input); return { ok: true, value: { contentType } }; };
    assert.deepEqual(await send({ body: { expectedVersion: 3, fields } }), { status: 200, body: { contentType } });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].input, {
      actorId: "operator", principalKind: "user", workspaceId: "ws-1", key: "recipe", fields, expectedVersion: 3,
    });
  });

  await t.test("denial precedes body validation and writes", async () => {
    write = async () => { assert.fail("denied requests must not write"); };
    deps.authorize = async () => ({ allowed: false, reason: "no_grant" });
    assert.deepEqual(await send({ body: {} }), {
      status: 403, body: {
        error: "principal 'operator' is not authorized for 'admin.collections.manage' (no_grant)",
        code: "FORBIDDEN", details: { permission: "admin.collections.manage", reason: "no_grant" },
      },
    });
    deps.authorize = async () => ({ allowed: true, reason: "matched" });
  });

  for (const body of [undefined, {}, { expectedVersion: "3", fields }]) {
    await t.test(`rejects missing or nonnumeric version: ${JSON.stringify(body)}`, async () => {
      write = async () => { assert.fail("invalid requests must not write"); };
      assert.deepEqual(await send({ body }), {
        status: 400, body: { error: "'expectedVersion' (number) is required", code: "VALIDATION_ERROR" },
      });
    });
  }
  await t.test("parser shape rejection is mapped before the write", async () => {
    write = async () => { assert.fail("malformed fields must not write"); };
    const invalidFields = "invalid";
    const parsed = contentTypes.parseContentTypeFieldDefs({ value: invalidFields });
    assert.equal(parsed.ok, false);
    if (parsed.ok) assert.fail("fixture must be rejected by the real parser");
    assert.deepEqual(await send({ body: { expectedVersion: 3, fields: invalidFields } }), {
      status: 400, body: { error: parsed.error.message, code: "VALIDATION_ERROR" },
    });
  });
  for (const fault of [new Error("backend detail"), "non-error failure"]) {
    await t.test(`thrown ${typeof fault} returns the current internal-error response (reported, not fixed)`, async () => {
      write = async () => { throw fault; };
      assert.deepEqual(await send({ body: { expectedVersion: 3, fields } }), {
        status: 500, body: { error: fault instanceof Error ? "backend detail" : "internal error", code: "INTERNAL_ERROR" },
      });
    });
  }
});
