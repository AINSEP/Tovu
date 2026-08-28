import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
import { FormSlugConflictError } from "../errors.js";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../repo.memory.js";
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from "../repo.sqlite.js";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "../ports.js";
import type { FormDefinitionRecord, FormSubmissionRecord } from "../types.js";

/**
 * @file Shared contract-test suite for `FormDefinitionRepoPort`/`FormSubmissionRepoPort`
 * (C-012, ADR-PIPE-010 rule-of-two). Runs against both `repo.memory.ts` and `repo.sqlite.ts`.
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

function runDefinitionContractSuite(adapterName: string, makeRepo: () => FormDefinitionRepoPort) {
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

  test(`[${adapterName}] FormDefinitionRepoPort exposes no delete method (INV-08)`, () => {
    const repo = makeRepo();
    assert.equal((repo as unknown as { delete?: unknown }).delete, undefined);
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

runDefinitionContractSuite("InMemoryFormDefinitionRepo", () => new InMemoryFormDefinitionRepo());
runSubmissionContractSuite("InMemoryFormSubmissionRepo", () => ({
  submissionRepo: new InMemoryFormSubmissionRepo(),
  definitionRepo: new InMemoryFormDefinitionRepo(),
}));

runDefinitionContractSuite("SqliteFormDefinitionRepo", () => new SqliteFormDefinitionRepo(openContentDb(":memory:")));
runSubmissionContractSuite("SqliteFormSubmissionRepo", () => {
  const db = openContentDb(":memory:");
  return {
    submissionRepo: new SqliteFormSubmissionRepo(db),
    definitionRepo: new SqliteFormDefinitionRepo(db),
  };
});
