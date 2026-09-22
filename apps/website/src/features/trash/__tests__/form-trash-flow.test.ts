import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import * as schema from "#src/platform/db/schema";
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from "#src/features/forms/repo.sqlite";
import { submitForm, type SubmitFormDeps } from "#src/features/forms/submit-service";
import { FormDefinitionNotFoundError } from "#src/features/forms/errors";
import { createContactFormResolver } from "#src/features/widgets/resolvers/contact-form";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { moveToTrash } from "../move-to-trash.js";
import { buildTrashRegistry, type TrashRegistry } from "../registry.js";
import { createTableTrashAdapter, type TrashedItemsRef } from "../table-adapter.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../index.js";

/**
 * @file A `form` moved to the Trash through the generic path (`moveToTrash`), seen from every Forms
 * consumer that must stop treating it as live — plan §5 G2's forms list. Real SQLite, real Forms
 * repos, the real contact-form widget resolver: nothing here is a double of the thing under test.
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";
const ACTOR = { principalId: "admin-1", pluginId: null };

interface Harness {
  db: ContentDb;
  registry: TrashRegistry;
  trash: TrashPort;
  definitions: SqliteFormDefinitionRepo;
  submissions: SqliteFormSubmissionRepo;
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");
  const registry = buildTrashRegistry({ schema });
  const trashDb = createSqliteTrashDb({ db });
  // Needed for `form`'s purgeFirst -> `form_submission` phantom-row cleanup (T1 item 5) — same ref
  // shape `deps.ts` builds at composition.
  const trashedItems: TrashedItemsRef = {
    table: schema.trashedItems,
    workspaceId: schema.trashedItems.workspaceId,
    entityType: schema.trashedItems.entityType,
    entityId: schema.trashedItems.entityId,
  };
  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: trashDb, trashedItems })])
  );
  let seq = 0;
  const trash = createTrashService({
    repo: new SqliteTrashRepo(db.$client),
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(db.$client),
  });
  return {
    db,
    registry,
    trash,
    definitions: new SqliteFormDefinitionRepo(db),
    submissions: new SqliteFormSubmissionRepo(db),
  };
}

function seedFormWithSubmissions(h: Harness, id: string, submissionCount: number): void {
  h.db.$client
    .prepare(
      `INSERT INTO form_definitions
         (id, workspace_id, name, slug, fields_json, notify_json, status, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, '{"fields":[]}', '{"enabled":false,"recipients":[]}', 'active', ?, ?, NULL, 1)`
    )
    .run(id, WS, `Form ${id}`, `slug-${id}`, AT, AT);
  for (let i = 0; i < submissionCount; i += 1) {
    h.db.$client
      .prepare(
        `INSERT INTO form_submissions (id, workspace_id, form_definition_id, data_json, source_ip, submitted_at)
         VALUES (?, ?, ?, '{}', '127.0.0.1', ?)`
      )
      .run(`${id}-sub-${i}`, WS, id, AT);
  }
}

function submissionRowCount(h: Harness, formId: string): number {
  return (
    h.db.$client.prepare(`SELECT COUNT(*) AS n FROM form_submissions WHERE form_definition_id = ?`).get(formId) as {
      n: number;
    }
  ).n;
}

async function trashForm(h: Harness, id: string): Promise<void> {
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: id, actor: ACTOR },
    {
      registry: h.registry,
      trash: h.trash,
      db: createSqliteTrashDb({ db: h.db }),
      authorize: async () => ({ allowed: true, reason: "matched" }),
      clock: { nowIso: () => AT },
    }
  );
  assert.deepEqual(outcome, { ok: true, version: 2 });
}

async function trashItemId(h: Harness, entityId: string): Promise<string> {
  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  const item = page.items.find((row) => row.entityId === entityId);
  assert.ok(item, `a Trash row for '${entityId}' must exist`);
  return item.id;
}

/** Every dependency past the definition lookup throws: a trashed form must be refused before any of
 *  them (rate limit, outbox, id generation, persistence) is reached. */
function refusingSubmitDeps(h: Harness): SubmitFormDeps {
  const unreachable = (name: string) => () => {
    throw new Error(`submitForm reached ${name} for a trashed form`);
  };
  return {
    definitionRepo: h.definitions,
    submissionRepo: h.submissions,
    outbox: { enqueue: unreachable("outbox") } as unknown as SubmitFormDeps["outbox"],
    bus: { publish: unreachable("bus") } as unknown as SubmitFormDeps["bus"],
    clock: { now: unreachable("clock"), nowIso: unreachable("clock") } as unknown as SubmitFormDeps["clock"],
    idGen: { next: unreachable("idGen") } as unknown as SubmitFormDeps["idGen"],
    rateLimiter: { check: unreachable("rateLimiter"), consume: unreachable("rateLimiter") } as unknown as SubmitFormDeps["rateLimiter"],
  };
}

test("a trashed form is gone from the Forms list and from a by-id read", async () => {
  const h = harness();
  seedFormWithSubmissions(h, "f1", 0);
  await trashForm(h, "f1");

  assert.equal(await h.definitions.findById({ workspaceId: WS, id: "f1" }), null);
  assert.equal(await h.definitions.findBySlug({ workspaceId: WS, slug: "slug-f1" }), null);
  const listed = await h.definitions.list({ workspaceId: WS });
  assert.deepEqual(
    listed.map((row) => row.id),
    []
  );
});

test("public submit to a trashed form is refused as not-found, and writes no submission", async () => {
  const h = harness();
  seedFormWithSubmissions(h, "f1", 0);
  await trashForm(h, "f1");

  await assert.rejects(
    submitForm({
      deps: refusingSubmitDeps(h),
      input: { workspaceId: WS, slug: "slug-f1", body: { name: "x" }, sourceIp: "127.0.0.1" },
    }),
    (error: unknown) => error instanceof FormDefinitionNotFoundError && error.message === "form 'slug-f1' was not found"
  );
  assert.equal(submissionRowCount(h, "f1"), 0);
});

test("a contact-form widget embedding a trashed form renders the target-disabled placeholder", async () => {
  const h = harness();
  seedFormWithSubmissions(h, "f1", 0);
  const resolver = createContactFormResolver({ formDefinitionRepo: h.definitions });
  const instance = { id: "w1", config: { formDefinitionId: "f1" } };

  const before = await resolver.resolveMany([instance] as never, { workspaceId: WS } as never);
  assert.equal(before.get("w1")?.ok, true, "the live form renders before it is trashed");

  await trashForm(h, "f1");
  const after = await resolver.resolveMany([instance] as never, { workspaceId: WS } as never);
  assert.deepEqual(after.get("w1"), { ok: false, reason: "target-disabled" });
});

test("restore brings the form back with its submissions untouched", async () => {
  const h = harness();
  seedFormWithSubmissions(h, "f1", 3);
  await trashForm(h, "f1");

  const restored = await h.trash.restore({ workspaceId: WS, entityType: "form", entityId: "f1", at: AT });
  assert.equal(restored, "restored");
  const definition = await h.definitions.findById({ workspaceId: WS, id: "f1" });
  assert.equal(definition?.slug, "slug-f1");
  assert.equal(submissionRowCount(h, "f1"), 3);
});

test("purge removes the form and every one of its submissions", async () => {
  const h = harness();
  seedFormWithSubmissions(h, "f1", 2);
  seedFormWithSubmissions(h, "f2", 1);
  await trashForm(h, "f1");

  const purged = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [await trashItemId(h, "f1")],
    actor: ACTOR,
    authorizeItem: async () => true,
  });
  assert.equal(purged.purged, 1);
  assert.equal(
    (h.db.$client.prepare(`SELECT COUNT(*) AS n FROM form_definitions WHERE id = 'f1'`).get() as { n: number }).n,
    0
  );
  assert.equal(submissionRowCount(h, "f1"), 0);
  assert.equal(submissionRowCount(h, "f2"), 1, "another form's submissions are untouched");
});

test("a form_submission moved to the Trash shows the form's name and the time, never the data, and leaves the Forms list", async () => {
  const h = harness();
  seedFormWithSubmissions(h, "f1", 2);
  h.db.$client.prepare(`UPDATE form_submissions SET data_json = '{"email":"ada@example.com"}'`).run();

  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form_submission", entityId: "f1-sub-0", actor: ACTOR },
    {
      registry: h.registry,
      trash: h.trash,
      db: createSqliteTrashDb({ db: h.db }),
      authorize: async (params) =>
        params.permission === "admin.forms.submissions.delete"
          ? { allowed: true, reason: "matched" }
          : { allowed: false, reason: `missing ${params.permission}` },
      clock: { nowIso: () => AT },
    }
  );
  assert.deepEqual(outcome, { ok: true, version: 2 });

  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  const item = page.items.find((row) => row.entityId === "f1-sub-0");
  assert.equal(item?.entityType, "form_submission");
  assert.equal(item?.displayTitle, "Form f1");
  assert.equal(item?.displaySubtitle, AT);
  assert.ok(!JSON.stringify(page.items).includes("ada@example.com"));

  const listed = await h.submissions.listByDefinition({ workspaceId: WS, formDefinitionId: "f1", limit: 10 });
  assert.deepEqual(
    listed.items.map((row) => row.id),
    ["f1-sub-1"]
  );
  assert.equal(await h.submissions.findById({ workspaceId: WS, id: "f1-sub-0" }), null);
});

test("purge of a form removes the Trash row of a submission that was independently trashed first (the phantom-row gap, T1 item 5)", async () => {
  const h = harness();
  seedFormWithSubmissions(h, "f1", 1);

  const subOutcome = await moveToTrash(
    { workspaceId: WS, entityType: "form_submission", entityId: "f1-sub-0", actor: ACTOR },
    {
      registry: h.registry,
      trash: h.trash,
      db: createSqliteTrashDb({ db: h.db }),
      authorize: async () => ({ allowed: true, reason: "matched" }),
      clock: { nowIso: () => AT },
    }
  );
  assert.deepEqual(subOutcome, { ok: true, version: 2 });
  assert.ok(await trashItemId(h, "f1-sub-0"), "the submission's own Trash row must exist before the form is purged");

  await trashForm(h, "f1");
  const purged = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [await trashItemId(h, "f1")],
    actor: ACTOR,
    authorizeItem: async () => true,
  });
  assert.equal(purged.purged, 1);
  assert.equal(submissionRowCount(h, "f1"), 0, "the submission row itself must be gone");

  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  assert.equal(
    page.items.some((row) => row.entityId === "f1-sub-0"),
    false,
    "the submission's Trash row must not survive its own row's deletion — a phantom row pointing at nothing"
  );
});
