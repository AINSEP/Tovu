import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { FormSlugConflictError } from "../errors.js";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../repo.memory.js";
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from "../repo.sqlite.js";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "../ports.js";
import type { FormDefinitionRecord, FormSubmissionRecord } from "../types.js";

/**
 * @file Shared contract-test suite for `FormDefinitionRepoPort`/`FormSubmissionRepoPort`
 * (C-012, ADR-PIPE-010 rule-of-two). Runs against both `repo.memory.ts` and `repo.sqlite.ts`.
 *
 * The trash-aware-reads block below (Batch B1, owner ruling 2026-09-21) trashes a row through a
 * per-adapter HARNESS SEAM rather than through the port — the port structurally has no method that
 * trashes a row (only `features/trash/adapters/form.ts`'s `hide` does, and that is exercised
 * separately in `features/trash/__tests__/form-adapter.test.ts`). The seam is a raw `UPDATE` for
 * SQLite and the memory adapter's own trash-blind `findAnyById`/`save` for memory — deliberately NOT
 * `FormDefinitionRepoPort` methods, so this file still proves the PORT's contract, not the adapter's.
 */

const NOW = "2026-07-13T00:00:00.000Z";
const WORKSPACE_ID = "ws-1";

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
    version: 1,
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<FormSubmissionRecord> = {}): FormSubmissionRecord {
  return {
    id: "sub-1",
    workspaceId: WORKSPACE_ID,
    formDefinitionId: "def-1",
    data: { name: "Ada" },
    sourceIp: "127.0.0.1",
    submittedAt: NOW,
    ...overrides,
  };
}

/** A per-adapter seam that trashes a row WITHOUT going through the port (see file header). */
interface DefinitionHarness {
  repo: FormDefinitionRepoPort;
  trashRow: (id: string) => Promise<void>;
}

function runDefinitionContractSuite(adapterName: string, makeHarness: () => DefinitionHarness) {
  const makeRepo = () => makeHarness().repo;

  test(`[${adapterName}] create + findById round-trips`, async () => {
    const repo = makeRepo();
    await repo.create(makeDefinition());
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "def-1" });
    assert.equal(found?.slug, "contact");
  });

  test(`[${adapterName}] findBySlug returns null for an unknown slug`, async () => {
    const repo = makeRepo();
    const found = await repo.findBySlug({ workspaceId: WORKSPACE_ID, slug: "nope" });
    assert.equal(found, null);
  });

  test(`[${adapterName}] create rejects a duplicate slug in the same workspace with FormSlugConflictError (behavior.spec.md §6.1)`, async () => {
    const repo = makeRepo();
    await repo.create(makeDefinition());
    await assert.rejects(
      () => repo.create(makeDefinition({ id: "def-2" })),
      FormSlugConflictError
    );
  });

  test(`[${adapterName}] create allows the same slug in a different workspace`, async () => {
    const repo = makeRepo();
    await repo.create(makeDefinition());
    await repo.create(makeDefinition({ id: "def-2", workspaceId: "ws-2" }));
    const found = await repo.findBySlug({ workspaceId: "ws-2", slug: "contact" });
    assert.equal(found?.id, "def-2");
  });

  test(`[${adapterName}] list returns only the requested workspace's definitions`, async () => {
    const repo = makeRepo();
    await repo.create(makeDefinition());
    await repo.create(makeDefinition({ id: "def-2", workspaceId: "ws-2", slug: "other" }));
    const list = await repo.list({ workspaceId: WORKSPACE_ID });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "def-1");
  });

  test(`[${adapterName}] update persists a status change without changing the id`, async () => {
    const repo = makeRepo();
    await repo.create(makeDefinition());
    const created = await repo.findById({ workspaceId: WORKSPACE_ID, id: "def-1" });
    await repo.update({ ...created!, status: "disabled" });
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "def-1" });
    assert.equal(found?.status, "disabled");
  });

  test(`[${adapterName}] FormDefinitionRepoPort exposes no delete method — a definition is removed only by a Trash purge`, () => {
    const repo = makeRepo();
    assert.equal((repo as unknown as { delete?: unknown }).delete, undefined);
  });

  // -------------------------------------------------------------------------
  // Trash-aware reads (Batch B1, owner ruling 2026-09-21) — see file header for the harness seam.
  // -------------------------------------------------------------------------

  test(`[${adapterName}] findById/findBySlug/list hide a trashed row`, async () => {
    const { repo, trashRow } = makeHarness();
    await repo.create(makeDefinition());
    await trashRow("def-1");

    assert.equal(await repo.findById({ workspaceId: WORKSPACE_ID, id: "def-1" }), null);
    assert.equal(await repo.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" }), null);
    assert.deepEqual(await repo.list({ workspaceId: WORKSPACE_ID }), []);
  });

  test(`[${adapterName}] isSlugTaken is true for a trashed slug (trash-blind, unlike find*)`, async () => {
    const { repo, trashRow } = makeHarness();
    await repo.create(makeDefinition());
    await trashRow("def-1");

    assert.equal(await repo.isSlugTaken({ workspaceId: WORKSPACE_ID, slug: "contact" }), true);
    assert.equal(await repo.isSlugTaken({ workspaceId: WORKSPACE_ID, slug: "nope" }), false);
  });

  test(`[${adapterName}] create with a slug in the Trash rejects with FormSlugConflictError naming the Trash`, async () => {
    const { repo, trashRow } = makeHarness();
    await repo.create(makeDefinition());
    await trashRow("def-1");

    await assert.rejects(() => repo.create(makeDefinition({ id: "def-2" })), (err: unknown) => {
      assert.ok(err instanceof FormSlugConflictError);
      assert.match(err.message, /Trash/);
      return true;
    });
  });

  test(`[${adapterName}] update() of a stale (now-trashed) record never revives it`, async () => {
    const { repo, trashRow } = makeHarness();
    await repo.create(makeDefinition());
    // The caller's own in-hand copy, taken BEFORE the row was trashed out from under it.
    const staleCopy = makeDefinition();
    await trashRow("def-1");

    await repo.update({ ...staleCopy, status: "disabled" });
    assert.equal(
      await repo.findById({ workspaceId: WORKSPACE_ID, id: "def-1" }),
      null,
      "update() must not clear deleted_at — the row must still read as trashed"
    );
  });

  test(`[${adapterName}] clearTrashMarker restores visibility and bumps version`, async () => {
    const { repo, trashRow } = makeHarness();
    await repo.create(makeDefinition());
    await trashRow("def-1");
    assert.equal(await repo.findById({ workspaceId: WORKSPACE_ID, id: "def-1" }), null);

    await repo.clearTrashMarker({ workspaceId: WORKSPACE_ID, id: "def-1", at: NOW });
    const restored = await repo.findById({ workspaceId: WORKSPACE_ID, id: "def-1" });
    assert.ok(restored, "clearTrashMarker must make the row visible again");
    assert.equal(restored!.version, 2, "clearTrashMarker must bump the version");
  });
}

/**
 * `makeRepos` returns a fresh `{ submissionRepo, definitionRepo }` pair sharing one storage
 * instance and pre-seeds a parent `form_definitions` row (id `def-1`) — required by the SQLite
 * adapter's real FK (`form_submissions.form_definition_id`); a no-op precondition for the
 * in-memory adapter, which has no such constraint.
 */
function runSubmissionContractSuite(
  adapterName: string,
  makeRepos: () => { submissionRepo: FormSubmissionRepoPort; definitionRepo: FormDefinitionRepoPort }
) {
  async function makeSeededRepo(): Promise<FormSubmissionRepoPort> {
    const { submissionRepo, definitionRepo } = makeRepos();
    await definitionRepo.create(makeDefinition());
    return submissionRepo;
  }

  test(`[${adapterName}] create + findById round-trips submission data`, async () => {
    const repo = await makeSeededRepo();
    await repo.create(makeSubmission());
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "sub-1" });
    assert.deepEqual(found?.data, { name: "Ada" });
  });

  test(`[${adapterName}] listByDefinition returns newest-first`, async () => {
    const repo = await makeSeededRepo();
    await repo.create(makeSubmission({ id: "sub-1", submittedAt: "2026-07-13T00:00:00.000Z" }));
    await repo.create(makeSubmission({ id: "sub-2", submittedAt: "2026-07-13T00:01:00.000Z" }));
    const page = await repo.listByDefinition({ workspaceId: WORKSPACE_ID, formDefinitionId: "def-1", limit: 10 });
    assert.deepEqual(page.items.map((i) => i.id), ["sub-2", "sub-1"]);
    assert.equal(page.nextCursor, null);
  });

  test(`[${adapterName}] listByDefinition paginates via cursor`, async () => {
    const repo = await makeSeededRepo();
    await repo.create(makeSubmission({ id: "sub-1", submittedAt: "2026-07-13T00:00:00.000Z" }));
    await repo.create(makeSubmission({ id: "sub-2", submittedAt: "2026-07-13T00:01:00.000Z" }));
    await repo.create(makeSubmission({ id: "sub-3", submittedAt: "2026-07-13T00:02:00.000Z" }));

    const firstPage = await repo.listByDefinition({
      workspaceId: WORKSPACE_ID,
      formDefinitionId: "def-1",
      limit: 2,
    });
    assert.deepEqual(firstPage.items.map((i) => i.id), ["sub-3", "sub-2"]);
    assert.ok(firstPage.nextCursor);

    const secondPage = await repo.listByDefinition({
      workspaceId: WORKSPACE_ID,
      formDefinitionId: "def-1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    assert.deepEqual(secondPage.items.map((i) => i.id), ["sub-1"]);
    assert.equal(secondPage.nextCursor, null);
  });

  test(`[${adapterName}] listByDefinition returns an empty page for a definition with no submissions (EC-08)`, async () => {
    const { submissionRepo } = makeRepos();
    const page = await submissionRepo.listByDefinition({
      workspaceId: WORKSPACE_ID,
      formDefinitionId: "def-none",
      limit: 10,
    });
    assert.deepEqual(page.items, []);
    assert.equal(page.nextCursor, null);
  });

  test(`[${adapterName}] delete permanently removes a submission (REQ-14)`, async () => {
    const repo = await makeSeededRepo();
    await repo.create(makeSubmission());
    await repo.delete({ workspaceId: WORKSPACE_ID, id: "sub-1" });
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "sub-1" });
    assert.equal(found, null);
  });

  test(`[${adapterName}] a submission from another workspace is isolated`, async () => {
    const repo = await makeSeededRepo();
    await repo.create(makeSubmission());
    const found = await repo.findById({ workspaceId: "ws-other", id: "sub-1" });
    assert.equal(found, null);
  });
}

runDefinitionContractSuite("InMemoryFormDefinitionRepo", () => {
  const repo = new InMemoryFormDefinitionRepo();
  return {
    repo,
    // The memory adapter's own trash-blind seam (see file header) — NOT a port method.
    trashRow: async (id: string) => {
      const existing = await repo.findAnyById({ workspaceId: WORKSPACE_ID, id });
      if (existing) await repo.save({ ...existing, deletedAt: NOW });
    },
  };
});
runSubmissionContractSuite("InMemoryFormSubmissionRepo", () => ({
  submissionRepo: new InMemoryFormSubmissionRepo(),
  definitionRepo: new InMemoryFormDefinitionRepo(),
}));

runDefinitionContractSuite("SqliteFormDefinitionRepo", () => {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  return {
    repo: new SqliteFormDefinitionRepo(db),
    // A raw UPDATE (see file header) — NOT a port method; the real Trash flip is
    // `features/trash/adapters/form.ts`'s `hide`, exercised in its own test file.
    trashRow: async (id: string) => {
      client.prepare(`UPDATE form_definitions SET deleted_at = ? WHERE id = ?`).run(NOW, id);
    },
  };
});
runSubmissionContractSuite("SqliteFormSubmissionRepo", () => {
  const db = openContentDb(":memory:");
  return {
    submissionRepo: new SqliteFormSubmissionRepo(db),
    definitionRepo: new SqliteFormDefinitionRepo(db),
  };
});
