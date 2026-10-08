import test from "node:test";
import assert from "node:assert/strict";
import type { RouteDeps } from "#src/server/routes/types";
import { InMemoryEntryRepo, type EntryRecord } from "#src/features/entries/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildWidgetInstanceFieldsJson, ensureWidgetContentTypesRegistered, parseWidgetInstancePayload } from "@jini-ai/cms/widgets";
import { buildWidgetsDeps } from "#src/features/widgets/deps";

test("registerAdminWidgetUpdateRoute", async (t) => {
  let updateError: Error | null = null;
  let savedEntry: EntryRecord | undefined;
  let savedVersion: number | null | undefined;
  let revisionActor: string | undefined;
  let permissionInput: unknown;
  // Fault only repository reads; the real write chokepoint and response mapper remain exercised.
  class EntryRepo extends InMemoryEntryRepo {
    /** Injects a read failure while retaining workspace-scoped memory reads. */
    override async findById(input: Parameters<InMemoryEntryRepo["findById"]>[0]) {
      if (updateError) throw updateError;
      return super.findById(input);
    }
    /** Records the entry and OCC version forwarded to the persistence port. */
    override async save(row: EntryRecord, options?: Parameters<InMemoryEntryRepo["save"]>[1]) {
      savedEntry = row;
      savedVersion = options?.expectedVersion;
      return super.save(row, options);
    }
    /** Records the session actor forwarded to the real revision writer. */
    override async appendRevision(revision: Parameters<InMemoryEntryRepo["appendRevision"]>[0]) {
      revisionActor = revision.actorId;
      return super.appendRevision(revision);
    }
  }
  const entryRepo = new EntryRepo();
  let counter = 0;
  const now = "2026-10-01T12:00:00.000Z";

  const { registerAdminWidgetUpdateRoute } = await import("../../update.js");

  let routeHandler: any;
  const mockApp = {
    put: (path: string, handler: any) => {
      routeHandler = handler;
    },
  };

  const deps = {
    workspaceId: "ws-1",
    entryRepo,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    outbox: new InMemoryOutbox(),
    clock: { nowMs: () => Date.parse(now) },
    idGen: { newId: () => `widget-update-${++counter}` },
    authorize: async (input: unknown) => {
      permissionInput = input;
      return { allowed: true, reason: "matched" };
    },
  } as unknown as RouteDeps;
  await ensureWidgetContentTypesRegistered({ deps: buildWidgetsDeps(deps), workspaceId: "ws-1" });
  await entryRepo.save({
    id: "w-1", workspaceId: "ws-1", type: "widget", slug: "widget-one", title: "Original Widget",
    status: "published", bodyJson: null, version: 1, createdAt: now, updatedAt: now,
    fieldsJson: buildWidgetInstanceFieldsJson({ payload: { widgetType: "text", status: "active", config: { body: "Original" } } }),
  });
  savedEntry = undefined;

  registerAdminWidgetUpdateRoute(mockApp as any, deps);
  assert.ok(routeHandler, "route handler was registered");

  function createMockRes() {
    return {
      locals: { principal: { id: "principal-123" } },
      statusCode: 200,
      body: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
    };
  }

  // 1. Workspace mismatch or missing returns 404
  await t.test("workspace mismatch or missing returns 404", async () => {
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "other-ws", id: "w-1" }, body: {} }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "workspace was not found" });

    const resMissing = createMockRes();
    await routeHandler({ params: { id: "w-1" }, body: {} }, resMissing);
    assert.equal(resMissing.statusCode, 404);
  });

  // 2. Missing body or invalid baseVersion returns 400
  await t.test("missing body or invalid baseVersion returns 400", async () => {
    const resNullBody = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1", id: "w-1" } }, resNullBody);
    assert.equal(resNullBody.statusCode, 400);
    assert.equal(resNullBody.body.code, "VALIDATION_ERROR");

    const resNoBaseVersion = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1", id: "w-1" }, body: {} }, resNoBaseVersion);
    assert.equal(resNoBaseVersion.statusCode, 400);

    const resStringBaseVersion = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1", id: "w-1" }, body: { baseVersion: "1" } }, resStringBaseVersion);
    assert.equal(resStringBaseVersion.statusCode, 400);
  });

  // 3. Success path with object config
  await t.test("success forwards object config", async () => {
    updateError = null;
    const res = createMockRes();
    await routeHandler(
      {
        params: { workspaceId: "ws-1", id: "w-1" },
        body: { baseVersion: 1, config: { body: "New Widget" } },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { widget: {
      id: "w-1", workspaceId: "ws-1", slug: "widget-one", title: "Original Widget",
      widgetType: "text", status: "active", config: { body: "New Widget" }, updatedAt: now, version: 2,
    } });
    assert.ok(savedEntry);
    assert.deepEqual(parseWidgetInstancePayload({ fieldsJson: savedEntry.fieldsJson }).config, { body: "New Widget" });
    assert.equal(savedVersion, 1);
    assert.equal(revisionActor, "principal-123");
    assert.deepEqual(permissionInput, { principalId: "principal-123", workspaceId: "ws-1", permission: "widgets.update" });
  });

  // 4. Null/non-object config defaults to {}; the text widget still requires its body field.
  await t.test("null config defaults to an empty object", async () => {
    const before = await entryRepo.findById({ workspaceId: "ws-1", id: "w-1" });
    const res = createMockRes();
    await routeHandler(
      {
        params: { workspaceId: "ws-1", id: "w-1" },
        body: { baseVersion: 2, config: null },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: "config for widget type 'text' failed schema validation (REQ-02)", code: "WIDGETS_CONFIG_VALIDATION_ERROR",
      details: { fieldErrors: [{ field: "config.body", reason: "required field is missing" }] },
    });
    assert.deepEqual(await entryRepo.findById({ workspaceId: "ws-1", id: "w-1" }), before);
  });

  // 5. Error handling path
  await t.test("service errors reach the response mapper", async () => {
    updateError = new Error("Conflict or not found");
    const res = createMockRes();
    await routeHandler(
      {
        params: { workspaceId: "ws-1", id: "w-1" },
        body: { baseVersion: 1 },
      },
      res
    );
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "internal error" });
  });

  await t.test("an unknown widget is mapped to the real 404 response", async () => {
    updateError = null;
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1", id: "missing-widget" }, body: { baseVersion: 1 } }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "widget instance 'missing-widget' was not found", code: "WIDGETS_INSTANCE_NOT_FOUND" });
  });
});
