import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner } from "#src/features/content-types/repo.memory";
import { registerContentType } from "#src/features/content-types/write-service";
import { InMemoryEntryRepo, createEntry } from "#src/features/entries/index";
import { PRE_AUTHORIZED } from "../../authorize-helper";
import {
  insertWidgetEmbed,
  removeWidgetEmbed,
  reorderWidgetEmbeds,
  WidgetEmbedReorderCountMismatchError,
  type EmbedServiceDeps,
} from "../../embed-service";
import { WidgetEmbedGuardrailError, WidgetInstanceNotFoundError, WidgetVersionConflictError } from "../../errors";
import { createWidgetInstance, trashWidgetInstance, type WidgetWriteServiceDeps } from "../../write-service";
import { buildWidgetAreaFieldsJson, ensureWidgetContentTypesRegistered, emptyWidgetAreaDoc } from "../../entry-payload";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_AREA_FIELD_NAMESPACE } from "../../types";

/**
 * @file C-007 `embed-service.ts` — SPEC-043 REQ-44/45, ADR-047 Debate Fold-In Amendment 6.
 *
 * Real in-memory adapters throughout (`InMemoryEntryRepo`, `InMemoryContentTypeRepo`,
 * `InMemoryEntryRefsRepo`) — no mocking of the chokepoint, per Constitution Article V. Proves the
 * server-side embed-mutation path composes the SAME `updateEntry` chokepoint (with its new,
 * additive `bodyJson` parameter) and the SAME `validateWidgetEmbedMutation` guardrail
 * (`embed-validation.ts`, already certified) the live-editor path is documented to call — this
 * suite is the concrete evidence that path exists and behaves per REQ-44/45/INV-04.
 */

const WORKSPACE_ID = "ws-1";
const ACTOR = { principalId: "user-1" };
const HOST_CONTENT_TYPE = "article";

function makeSharedRepos() {
  return {
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
  };
}

let idCounter = 0;
function makeDeps(repos: ReturnType<typeof makeSharedRepos>, overrides: Partial<EmbedServiceDeps> = {}): EmbedServiceDeps {
  return {
    ...repos,
    clock: { nowIso: () => "2026-07-21T00:00:00.000Z" },
    ids: { newId: () => `id-${++idCounter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
    ...overrides,
  };
}

function widgetWriteDeps(repos: ReturnType<typeof makeSharedRepos>): WidgetWriteServiceDeps {
  return {
    ...repos,
    clock: { nowIso: () => "2026-07-21T00:00:00.000Z" },
    ids: { newId: () => `id-${++idCounter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
  };
}

async function makeHostEntry(repos: ReturnType<typeof makeSharedRepos>, type = HOST_CONTENT_TYPE): Promise<{ id: string; version: number }> {
  const deps = { repo: repos.contentTypeRepo, clock: { nowIso: () => "2026-07-21T00:00:00.000Z" }, ids: { newId: () => `ct-${++idCounter}` }, authorize: PRE_AUTHORIZED, indexProvisioner: new NoopContentTypeIndexProvisioner(), outbox: { enqueue: async () => undefined } };
  const existing = await repos.contentTypeRepo.findByKey({ workspaceId: WORKSPACE_ID, key: type });
  if (!existing) {
    await registerContentType({ deps, input: { actorId: ACTOR.principalId, workspaceId: WORKSPACE_ID, key: type, label: "Page", fields: [] } });
  }

  const created = await createEntry({
    deps: { entryRepo: repos.entryRepo, contentTypeRepo: repos.contentTypeRepo, clock: { nowIso: () => "2026-07-21T00:00:00.000Z" }, ids: { newId: () => `entry-${++idCounter}` }, authorize: PRE_AUTHORIZED, outbox: { enqueue: async () => undefined } },
    input: {
      actorId: ACTOR.principalId,
      workspaceId: WORKSPACE_ID,
      type,
      slug: `host-${idCounter}`,
      title: "Host Entry",
      fieldsJson: { ext: { site: {} } },
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    },
  });
  if (!created.ok) throw created.error;
  return { id: created.value.entry.id, version: created.value.entry.version };
}

async function makeWidgetInstance(repos: ReturnType<typeof makeSharedRepos>): Promise<string> {
  const { instance } = await createWidgetInstance({
    deps: widgetWriteDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title: "Footer note", config: { body: "hi" } },
  });
  return instance.id;
}

test("REQ-44: insertWidgetEmbed adds one new widgetEmbed node to the host's body, one atomic version-guarded write, entry_refs extracted same-transaction", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const widgetId = await makeWidgetInstance(repos);

  const { entry, placementId } = await insertWidgetEmbed({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: widgetId },
  });

  assert.equal(entry.version, host.version + 1);
  const content = (entry.bodyJson as { content: unknown[] }).content;
  const embed = content.find((n) => (n as { type?: string }).type === "widgetEmbed") as { attrs: { placementId: string; widgetEntryId: string } };
  assert.ok(embed, "expected a widgetEmbed node in the resulting body");
  assert.equal(embed.attrs.placementId, placementId);
  assert.equal(embed.attrs.widgetEntryId, widgetId);

  const refs = await repos.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: host.id });
  assert.ok(refs.some((r) => r.targetId === widgetId), "the new embed must be extracted into entry_refs in the same write");
});

test("Fable adversarial-review fix (2026-07-21, Finding E/REQ-16): inserting a widgetEmbed pointing at a nonexistent widget id is rejected before any write, matching region placement's identical check", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);

  await assert.rejects(
    () =>
      insertWidgetEmbed({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: "does-not-exist" },
      }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
  );

  const after = await repos.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: host.id });
  assert.equal(after?.version, host.version, "nothing must have been written — the host entry's version is unchanged");
});

test("Fable adversarial-review fix (2026-07-21, Finding E/REQ-16): inserting a widgetEmbed pointing at a TRASHED widget is rejected, not silently inserted as a dead embed", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const widgetId = await makeWidgetInstance(repos);
  await trashWidgetInstance({ deps: widgetWriteDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: widgetId } });

  await assert.rejects(
    () =>
      insertWidgetEmbed({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: widgetId },
      }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
  );
});

test("Fable adversarial-review fix (2026-07-21, Finding E/REQ-17): a widget_area entry can never itself be an embed target", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);

  await ensureWidgetContentTypesRegistered({
    deps: { contentTypeRepo: repos.contentTypeRepo, clock: { nowIso: () => "2026-07-21T00:00:00.000Z" }, ids: { newId: () => `ct-${++idCounter}` }, outbox: { enqueue: async () => undefined } },
    workspaceId: WORKSPACE_ID,
  });
  const areaCreated = await createEntry({
    deps: { entryRepo: repos.entryRepo, contentTypeRepo: repos.contentTypeRepo, clock: { nowIso: () => "2026-07-21T00:00:00.000Z" }, ids: { newId: () => `area-${++idCounter}` }, authorize: PRE_AUTHORIZED, outbox: { enqueue: async () => undefined } },
    input: {
      actorId: ACTOR.principalId,
      workspaceId: WORKSPACE_ID,
      type: WIDGET_AREA_CONTENT_TYPE,
      slug: `widget-area-footer-${idCounter}`,
      title: "Footer area",
      fieldsJson: buildWidgetAreaFieldsJson({ regionKey: "footer", doc: emptyWidgetAreaDoc() }),
      owner: WIDGET_AREA_FIELD_NAMESPACE,
    },
  });
  if (!areaCreated.ok) throw areaCreated.error;

  await assert.rejects(
    () =>
      insertWidgetEmbed({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: areaCreated.value.entry.id },
      }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
  );
});

test("REQ-19/INV-04: inserting a widgetEmbed whose HOST is itself a widget instance is rejected — no widget-in-widget recursion, same guardrail the live editor path must also call", async () => {
  const repos = makeSharedRepos();
  const widgetHostId = await makeWidgetInstance(repos);
  const targetWidgetId = await makeWidgetInstance(repos);
  const widgetHostEntry = await repos.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: widgetHostId });

  await assert.rejects(
    () =>
      insertWidgetEmbed({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: widgetHostId, baseVersion: widgetHostEntry!.version, widgetEntryId: targetWidgetId },
      }),
    (err: unknown) => {
      assert.ok(err instanceof WidgetEmbedGuardrailError);
      assert.equal(err.reason, "recursion");
      return true;
    }
  );
});

test("REQ-20: exceeding the configured per-document embed count is rejected before any write, identically to the editor path's own clamp", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const widgetId = await makeWidgetInstance(repos);

  const first = await insertWidgetEmbed({
    deps: makeDeps(repos, { maxEmbedsPerDocument: 1 }),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: widgetId },
  });

  await assert.rejects(
    () =>
      insertWidgetEmbed({
        deps: makeDeps(repos, { maxEmbedsPerDocument: 1 }),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: first.entry.version, widgetEntryId: widgetId },
      }),
    (err: unknown) => {
      assert.ok(err instanceof WidgetEmbedGuardrailError);
      assert.equal(err.reason, "count-exceeded");
      return true;
    }
  );
});

test("REQ-06-equivalent OCC: a stale baseVersion is rejected with a typed conflict naming the current version, nothing applied", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const widgetId = await makeWidgetInstance(repos);

  await assert.rejects(
    () =>
      insertWidgetEmbed({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version + 5, widgetEntryId: widgetId },
      }),
    (err: unknown) => {
      assert.ok(err instanceof WidgetVersionConflictError);
      return true;
    }
  );
  const stillThere = await repos.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: host.id });
  assert.equal(stillThere?.version, host.version);
});

test("REQ-44/45: removeWidgetEmbed removes only the matching placement, retracts its entry_refs row, leaves surrounding content untouched", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const w1 = await makeWidgetInstance(repos);
  const w2 = await makeWidgetInstance(repos);

  const after1 = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: w1 } });
  const after2 = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: after1.entry.version, widgetEntryId: w2 } });

  const { entry } = await removeWidgetEmbed({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: after2.entry.version, placementId: after1.placementId },
  });

  const content = (entry.bodyJson as { content: unknown[] }).content;
  const embeds = content.filter((n) => (n as { type?: string }).type === "widgetEmbed") as { attrs: { widgetEntryId: string } }[];
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].attrs.widgetEntryId, w2);
  // The original paragraph node from `makeHostEntry`'s seed body survives untouched.
  assert.ok(content.some((n) => (n as { type?: string }).type === "paragraph"));

  const refs = await repos.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: host.id });
  assert.ok(!refs.some((r) => r.targetId === w1), "the removed placement's ref must be retracted");
  assert.ok(refs.some((r) => r.targetId === w2), "the remaining placement's ref must still be present");
});

test("REQ-44/45: reorderWidgetEmbeds swaps which widget occupies which existing slot, in document order, without changing slot count/position", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const w1 = await makeWidgetInstance(repos);
  const w2 = await makeWidgetInstance(repos);

  const after1 = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: w1 } });
  const after2 = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: after1.entry.version, widgetEntryId: w2 } });

  const { entry } = await reorderWidgetEmbeds({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: after2.entry.version, orderedWidgetEntryIds: [w2, w1] },
  });

  const content = (entry.bodyJson as { content: unknown[] }).content;
  const embeds = content.filter((n) => (n as { type?: string }).type === "widgetEmbed") as { attrs: { widgetEntryId: string } }[];
  assert.equal(embeds.length, 2);
  assert.deepEqual(embeds.map((e) => e.attrs.widgetEntryId), [w2, w1]);
});

test("reorderWidgetEmbeds rejects a count mismatch before writing anything", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const w1 = await makeWidgetInstance(repos);
  await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: w1 } });

  await assert.rejects(
    () =>
      reorderWidgetEmbeds({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version + 1, orderedWidgetEntryIds: [w1, w1] },
      }),
    (err: unknown) => {
      assert.ok(err instanceof WidgetEmbedReorderCountMismatchError);
      return true;
    }
  );
});

test("Round-2 external-audit fix (2026-07-21, codex blocker WIDGETS-R2-001): reorderWidgetEmbeds rejects a nonexistent replacement target before changing bodyJson or entry_refs", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const w1 = await makeWidgetInstance(repos);
  const inserted = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: w1 } });

  await assert.rejects(
    () =>
      reorderWidgetEmbeds({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: inserted.entry.version, orderedWidgetEntryIds: ["does-not-exist"] },
      }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
  );

  const reread = await repos.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: host.id });
  assert.equal(reread?.version, inserted.entry.version, "nothing must have been written");
  assert.deepEqual(reread?.bodyJson, inserted.entry.bodyJson);
  const refs = await repos.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: host.id });
  assert.deepEqual(refs.map((r) => r.targetId), [w1], "entry_refs must still point only at the original target, never a dangling row for the rejected 'does-not-exist' id");
});

test("Round-2 external-audit fix (2026-07-21, codex blocker WIDGETS-R2-001): reorderWidgetEmbeds rejects a TRASHED replacement target", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const w1 = await makeWidgetInstance(repos);
  const w2 = await makeWidgetInstance(repos);
  const inserted = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: w1 } });
  await trashWidgetInstance({ deps: widgetWriteDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: w2 } });

  await assert.rejects(
    () =>
      reorderWidgetEmbeds({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: inserted.entry.version, orderedWidgetEntryIds: [w2] },
      }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
  );
});

test("Round-2 external-audit fix (2026-07-21, codex blocker WIDGETS-R2-001): reorderWidgetEmbeds rejects a widget_area as a replacement target", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const w1 = await makeWidgetInstance(repos);
  const inserted = await insertWidgetEmbed({ deps: makeDeps(repos), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: w1 } });

  await ensureWidgetContentTypesRegistered({
    deps: { contentTypeRepo: repos.contentTypeRepo, clock: { nowIso: () => "2026-07-21T00:00:00.000Z" }, ids: { newId: () => `ct-${++idCounter}` }, outbox: { enqueue: async () => undefined } },
    workspaceId: WORKSPACE_ID,
  });
  const areaCreated = await createEntry({
    deps: { entryRepo: repos.entryRepo, contentTypeRepo: repos.contentTypeRepo, clock: { nowIso: () => "2026-07-21T00:00:00.000Z" }, ids: { newId: () => `area-${++idCounter}` }, authorize: PRE_AUTHORIZED, outbox: { enqueue: async () => undefined } },
    input: {
      actorId: ACTOR.principalId,
      workspaceId: WORKSPACE_ID,
      type: WIDGET_AREA_CONTENT_TYPE,
      slug: `widget-area-reorder-${idCounter}`,
      title: "Footer area",
      fieldsJson: buildWidgetAreaFieldsJson({ regionKey: "footer", doc: emptyWidgetAreaDoc() }),
      owner: WIDGET_AREA_FIELD_NAMESPACE,
    },
  });
  if (!areaCreated.ok) throw areaCreated.error;

  await assert.rejects(
    () =>
      reorderWidgetEmbeds({
        deps: makeDeps(repos),
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: inserted.entry.version, orderedWidgetEntryIds: [areaCreated.value.entry.id] },
      }),
    (err: unknown) => err instanceof WidgetInstanceNotFoundError
  );
});

test("REQ-44/AC-30 spirit: insert works with no live editor session involved — this test never touches TipTap/the browser, only the server-side chokepoint", async () => {
  const repos = makeSharedRepos();
  const host = await makeHostEntry(repos);
  const widgetId = await makeWidgetInstance(repos);

  const { entry } = await insertWidgetEmbed({
    deps: makeDeps(repos),
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, hostEntryId: host.id, baseVersion: host.version, widgetEntryId: widgetId },
  });

  const reread = await repos.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: host.id });
  assert.deepEqual(reread?.bodyJson, entry.bodyJson, "a subsequent read of the page shows the new embed");
});
