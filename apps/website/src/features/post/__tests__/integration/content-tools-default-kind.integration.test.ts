/**
 * content_post_create defaults kind to post; content_post_delete derives kind from the id (owner
 * 2026-10-25). Registration composition, batch handling, executor and command gateway are real;
 * only persistence/removal and authorization are in-memory ports. Read back rows, revisions and
 * change sets so a successful response alone cannot hide a dropped write.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, createToolRegistry, type BatchResult } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import type { ToolContributor, DerivedToolContributor } from "#src/assistant/index";
import { toAssistantRegistryDeps, type RegistryDepsWithoutLimiter } from "#src/assistant/__tests__/fixtures/registry-deps";
import { postAgentToolCatalog, TIPTAP_DOC_SCHEMA } from "../../agent-tools.js";
import { InMemoryPostRepo } from "../../repo.memory.js";
import { contributePostTools } from "../../tool-registrations.js";
import { buildPostRecord } from "../post-record.fixture.js";
import { removeVia } from "../remove-post-double.js";

const WORKSPACE_ID = "ws-content-kind";
const NOW = "2026-10-25T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };
const TEXT_DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "temp" }] }] };

/** Fresh composition per test; fixed domain time/IDs make persisted effects deterministic. */
function harness(_required: Record<string, never>, _options = {}) {
  let counter = 0;
  const postRepo = new InMemoryPostRepo();
  const changeSets = new InMemoryChangeSetRepo();
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `content-kind-${++counter}` },
    postRepo, changeSets,
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    removePost: removeVia(postRepo),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  contributions.contributors.register({ contribution: contributePostTools() });
  const registrations = buildAssistantToolRegistrations(
    toAssistantRegistryDeps({ routeDeps: deps as unknown as RegistryDepsWithoutLimiter }),
    undefined, { contributions },
  );
  const registry = createToolRegistry({});
  for (const registration of registrations) registry.register(registration);
  const executor = createToolExecutor({ registry }, { now: () => Date.parse(NOW) });
  return {
    postRepo, changeSets, registrations,
    execute: ({ toolId, input }: { toolId: string; input: unknown }, _options = {}) => executor.execute({
      toolId, input, principal: { id: "owner" }, run: { id: "content-kind-run" },
    }),
  };
}

test("create_omitted_kind_defaults_to_post", async () => {
  const h = harness({});
  const create = postAgentToolCatalog.find(tool => tool.name === "content_post_create");
  assert.ok(create);
  assert.deepEqual((create.inputSchema as { required: string[] }).required, ["title"]);
  const result = await h.execute({ toolId: "content_post_create", input: { title: "Default kind" } });
  assert.equal(result.status, "completed", JSON.stringify(result));
  const rows = await h.postRepo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "post");
  assert.equal(rows[0]?.title, "Default kind");
  const page = await h.execute({ toolId: "content_post_create", input: { title: "Explicit page", kind: "page" } });
  assert.equal(page.status, "completed", JSON.stringify(page));
  assert.equal((await h.postRepo.list({ workspaceId: WORKSPACE_ID })).find(row => row.title === "Explicit page")?.kind, "page");

  for (const kind of [null, "template", "", 7]) {
    const invalid = harness({});
    const refused = await invalid.execute({ toolId: "content_post_create", input: { title: "Invalid", kind } });
    assert.equal(refused.status, "failed");
    assert.equal(refused.errorKind, "validation");
    assert.match(refused.error ?? "", /'kind' must be exactly 'post' or 'page'/);
    assert.deepEqual(await invalid.postRepo.list({ workspaceId: WORKSPACE_ID }), []);
    assert.deepEqual(await invalid.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID }), []);
  }
});

test("create_documented_body_example_round_trips", async () => {
  const h = harness({});
  const create = h.registrations.find(tool => tool.descriptor.id === "content_post_create");
  assert.ok(create);
  assert.ok(create.descriptor.description);
  const example = create.descriptor.description.match(/\{"bodyJson":\{"type":"doc".*?\}\]\}\]\}\}/)?.[0];
  assert.ok(example, "publish a complete JSON body example in the composed description");
  assert.ok(TIPTAP_DOC_SCHEMA.description.includes(example));
  const input = JSON.parse(example) as { bodyJson: unknown };
  assert.deepEqual(input.bodyJson, TEXT_DOC, "the documented example must contain actual text");
  const result = await h.execute({ toolId: "content_post_create", input: { title: "Text body", ...input } });
  assert.equal(result.status, "completed", JSON.stringify(result));
  const empty = await h.execute({ toolId: "content_post_create", input: { title: "Empty body" } });
  assert.equal(empty.status, "completed", JSON.stringify(empty));
  const rows = await h.postRepo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.title === "Text body")?.bodyJson, TEXT_DOC);
  assert.deepEqual(rows.find(row => row.title === "Empty body")?.bodyJson, EMPTY_DOC);
});

test("delete_id_only_resolves_post_and_page", async () => {
  for (const batched of [false, true]) {
    const h = harness({});
    const targets = [
      buildPostRecord({ workspaceId: WORKSPACE_ID, id: "post", kind: "post", slug: "article" }),
      buildPostRecord({ workspaceId: WORKSPACE_ID, id: "page", kind: "page", slug: "about" }),
    ];
    for (const row of targets) await h.postRepo.save(row);
    const deletion = postAgentToolCatalog.find(tool => tool.name === "content_post_delete");
    assert.ok(deletion);
    assert.deepEqual((deletion.inputSchema as { required: string[] }).required, ["id"]);
    const inputs = batched ? [{ items: targets.map(row => ({ id: row.id })) }] : targets.map(row => ({ id: row.id }));
    for (const input of inputs) {
      const result = await h.execute({ toolId: "content_post_delete", input });
      assert.equal(result.status, "completed", JSON.stringify(result));
      if (batched) {
        const batch = result.output as BatchResult;
        assert.deepEqual([batch.total, batch.succeeded, batch.failed], [2, 2, 0]);
      }
    }
    for (const target of targets) {
      const row = await h.postRepo.findById({ workspaceId: WORKSPACE_ID, id: target.id });
      assert.ok(row);
      assert.equal(row.kind, target.kind);
      assert.equal(row.deletedAt, NOW);
      assert.equal(row.version, 2);
      const revisions = await h.postRepo.listRevisions({ workspaceId: WORKSPACE_ID, postId: target.id });
      assert.equal(revisions.length, 1);
      const revision = revisions[0];
      assert.ok(revision);
      assert.equal(revision.op, "delete");
      assert.equal(revision.seq, 2);
      assert.equal(revision.stateJson.kind, target.kind);
      assert.equal(revision.stateJson.deletedAt, NOW);
      assert.equal(revision.delegatedById, "owner");
    }
    const changes = await h.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID });
    assert.equal(changes.length, 2);
    const deletedIds = [];
    for (const change of changes) {
      const recorded = await h.changeSets.findById({ workspaceId: WORKSPACE_ID, id: change.id });
      assert.ok(recorded);
      assert.equal(recorded.items.length, 1);
      const item = recorded.items[0];
      assert.ok(item);
      assert.equal(item.operation, "delete");
      assert.equal(item.entityType, "post");
      assert.equal(item.entityVersionAtApply, 2);
      assert.deepEqual(item.inversePayload, { deletedAt: null });
      deletedIds.push(item.entityId);
    }
    assert.deepEqual(deletedIds.sort(), ["page", "post"]);
  }
});

test("delete_id_only_preserves_boundaries: missing, trashed, foreign and template rows", async () => {
  const h = harness({});
  const rows = [
    buildPostRecord({ workspaceId: WORKSPACE_ID, id: "trashed", deletedAt: NOW }),
    buildPostRecord({ workspaceId: "other-workspace", id: "foreign" }),
    buildPostRecord({ workspaceId: WORKSPACE_ID, id: "template", kind: "email-template", bodyFormat: "html", bodyHtml: "<p>Mail only</p>" }),
  ];
  for (const row of rows) await h.postRepo.save(row);
  for (const id of ["missing", ...rows.map(row => row.id)]) {
    const result = await h.execute({ toolId: "content_post_delete", input: { id } });
    assert.equal(result.status, "failed", `${id}: ${JSON.stringify(result)}`);
    assert.match(result.error ?? "", /CONTENT_POST_NOT_FOUND/);
  }
  for (const row of rows) {
    assert.deepEqual(await h.postRepo.findById({ workspaceId: row.workspaceId, id: row.id }), row);
    assert.deepEqual(await h.postRepo.listRevisions({ workspaceId: row.workspaceId, postId: row.id }), []);
  }
  assert.deepEqual(await h.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID }), []);
});
