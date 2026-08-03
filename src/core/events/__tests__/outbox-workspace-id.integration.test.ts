import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import { openContentDb } from "#src/db/sqlite/content-db";
import { SqliteOutboxAdapter } from "#src/db/sqlite/outbox-repo.sqlite";
import { outboxEvents } from "#src/db/schema";
import { InMemoryEntryRefsRepo } from "#src/core/entry-refs/repo.memory";
import { createWidgetInstance, type WidgetWriteServiceDeps } from "#src/widgets/write-service";

import {
  createEntry,
  InMemoryEntryRepo,
  toEntryOutbox,
  type OwningContentType,
} from "@jini-ai/cms/entries";
import {
  InMemoryContentTypeRepo,
  NoopContentTypeIndexProvisioner,
  deprecateContentType,
  registerContentType,
  toContentTypeOutbox,
} from "@jini-ai/cms/content-types";
import {
  InMemoryContentLookup,
  InMemoryEntryTermRepo,
  InMemoryTaxonomyRepo,
  InMemoryTaxonomyRevisionRepo,
  InMemoryTermRepo,
  assignTerms,
  createTaxonomy,
  createTerm,
  noopStampWatermark,
  renameTerm,
  toTaxonomyOutbox,
  type WriteServiceDeps as TaxonomyWriteServiceDeps,
} from "@jini-ai/cms/taxonomy";

/**
 * @file Regression coverage for the 2026-08-03 outbox `workspaceId` fix (see
 * `ADS-memory/reports/audits/2026-08-03-audit-dossier-outbox-and-tool-surface.md` §C2/D1 and
 * `ADS-memory/reports/recon/2026-08-03-outbox-workspaceid-and-mcp-ui-decisions.md`).
 *
 * The bug: `toEntryOutbox`/`toContentTypeOutbox`/`toTaxonomyOutbox` (all three in Jini
 * `packages/cms`) constructed an outbox event without `workspaceId`, while the real
 * `SqliteOutboxAdapter.enqueue` (`db/sqlite/outbox-repo.sqlite.ts`) writes it into a NOT NULL
 * column. Every domain test in this codebase stubs `outbox: { enqueue: async () => undefined }`
 * (e.g. `widgets/__tests__/integration/write-service.integration.test.ts`), which accepts any
 * shape and therefore cannot see this bug class — a green suite proved nothing. This suite is the
 * missing artifact: it binds the REAL `SqliteOutboxAdapter` (not a double) to one write per
 * affected family and reads the persisted row back out of `outbox_events` directly.
 *
 * Deliberately proven to bite: with the fix reverted (bridge omits `workspaceId`), every test
 * below fails RED — either the bridge no longer compiles against its declared param type, or (if
 * that check is bypassed) `enqueue()` throws the real `NOT NULL constraint failed:
 * outbox_events.workspace_id` error. See the agent report for the actual revert/rerun transcript.
 */

function makeOutbox() {
  const db = openContentDb(":memory:");
  const outbox = new SqliteOutboxAdapter(db);
  return { db, outbox };
}

function readOutboxRow(db: ReturnType<typeof openContentDb>, eventId: string) {
  return db.select().from(outboxEvents).where(eq(outboxEvents.id, eventId)).get();
}

/** Parses the persisted `event_json`'s `name` field. `toTaxonomyOutbox` (`packages/cms/src/
 * taxonomy/repo.memory.ts`) reads its input `event: unknown` defensively and falls back to the
 * generic literal `"taxonomy.event"` when the producer's event has no string `name` — a producer
 * that silently stops naming its own event would still write a row with a correct `workspace_id`
 * and look completely healthy to every other assertion in this suite. This is the one assertion
 * that actually catches that. */
function readOutboxEventName(db: ReturnType<typeof openContentDb>, eventId: string): unknown {
  const row = readOutboxRow(db, eventId);
  return row ? (JSON.parse(row.eventJson) as { name?: unknown }).name : undefined;
}

const CLOCK = { nowIso: () => "2026-08-03T00:00:00.000Z" };
const ALWAYS_ALLOW = async () => ({ allowed: true, reason: "test: always allow" });

test("entries chokepoint: createEntry through toEntryOutbox persists workspace_id on the real SqliteOutboxAdapter", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;
  const ids = { newId: () => `entries-evt-${++counter}` };

  const workspaceId = "ws-entries-1";
  const contentTypeRepo = {
    findByKey: async (): Promise<OwningContentType | null> => ({
      workspaceId,
      key: "post",
      status: "active",
      fields: [],
    }),
  };

  const result = await createEntry({
    deps: {
      entryRepo: new InMemoryEntryRepo(),
      contentTypeRepo,
      clock: CLOCK,
      ids: { newId: () => "entry-1" },
      authorize: async () => ({ allowed: true, reason: "test: always allow" }),
      outbox: toEntryOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId }),
    },
    input: {
      actorId: "user-1",
      workspaceId,
      type: "post",
      slug: "hello-world",
      title: "Hello world",
      fieldsJson: { ext: { site: {} } },
    },
  });
  assert.equal(result.ok, true, "createEntry must succeed against the real SqliteOutboxAdapter");

  const row = readOutboxRow(db, "entries-evt-1");
  assert.ok(row, "entry.created must be persisted in outbox_events");
  assert.equal(row!.id, "entries-evt-1");
  assert.equal(row!.workspaceId, workspaceId);
});

test("content-types chokepoint: deprecateContentType through toContentTypeOutbox persists workspace_id — NEW: never exercised live before this test (dossier C3)", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;
  const ids = { newId: () => `ct-evt-${++counter}` };

  const workspaceId = "ws-content-types-1";
  const repo = new InMemoryContentTypeRepo();

  // registerContentType itself never calls deps.outbox.enqueue (confirmed by reading
  // content-types/write-service.ts — outbox is a declared dep but genuinely unused on this path;
  // only lifecycle.ts's deprecate/tombstone transitions enqueue). A no-op stand-in here is
  // therefore correct, not a shortcut around what this test is meant to prove: registration is
  // just setup so there is a row to deprecate.
  const registered = await registerContentType({
    deps: {
      repo,
      clock: CLOCK,
      ids: { newId: () => "ct-1" },
      authorize: async () => ({ allowed: true, reason: "test: always allow" }),
      indexProvisioner: new NoopContentTypeIndexProvisioner(),
      outbox: { enqueue: async () => undefined },
    },
    input: { actorId: "user-1", workspaceId, key: "article", label: "Article", fields: [] },
  });
  assert.equal(registered.ok, true, "setup: registerContentType must succeed");

  const result = await deprecateContentType({
    deps: {
      repo,
      clock: CLOCK,
      authorize: async () => ({ allowed: true, reason: "test: always allow" }),
      outbox: toContentTypeOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId }),
    },
    input: { workspaceId, actorId: "user-1", key: "article", expectedVersion: 1 },
  });
  assert.equal(result.ok, true, "deprecateContentType must succeed against the real SqliteOutboxAdapter");

  const row = readOutboxRow(db, "ct-evt-1");
  assert.ok(row, "content_type.deprecated event must be persisted in outbox_events");
  assert.equal(row!.id, "ct-evt-1");
  assert.equal(row!.workspaceId, workspaceId);
});

test("taxonomy chokepoint: createTaxonomy through toTaxonomyOutbox persists workspace_id — NEW: never exercised live before this test (dossier C3); taxonomy's own events carry NO workspaceId at all, which is why this bridge must source it from deps", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;
  const ids = { newId: () => `tax-evt-${++counter}` };

  const workspaceId = "ws-taxonomy-1";

  const deps: TaxonomyWriteServiceDeps = {
    authorize: ALWAYS_ALLOW,
    clock: CLOCK,
    idGen: { newId: () => "tax-1" },
    taxonomies: new InMemoryTaxonomyRepo(),
    terms: new InMemoryTermRepo(),
    entryTerms: new InMemoryEntryTermRepo(),
    revisions: new InMemoryTaxonomyRevisionRepo(),
    stampWatermark: noopStampWatermark,
    outbox: toTaxonomyOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId }),
    workspaceId,
    contentLookup: new InMemoryContentLookup(),
  };

  const taxonomy = await createTaxonomy({ deps, principalId: "user-1", name: "Categories", hierarchical: true });
  assert.ok(taxonomy.id, "createTaxonomy must return the created row");

  const row = readOutboxRow(db, "tax-evt-1");
  assert.ok(row, "taxonomy.created event must be persisted in outbox_events");
  assert.equal(row!.id, "tax-evt-1");
  assert.equal(row!.workspaceId, workspaceId);
});

/**
 * Dossier C2/C3 follow-up (message #4): `createTaxonomy` above was the only taxonomy producer
 * covered. `toTaxonomyOutbox` is not uniform like `toEntryOutbox`/`toContentTypeOutbox` — it takes
 * `event: unknown` and falls back to the literal `"taxonomy.event"` name when a producer's event
 * has no string `name`. Taxonomy's four producers also don't share one enqueue shape
 * (`createTaxonomy`/`createTerm`/`renameTerm` are single-line enqueues; `assignTerms` is
 * multi-line). These three tests cover the remaining producers and assert BOTH the C6
 * `workspace_id` property AND a specific, correct `name` — not the fallback — since a producer
 * silently landing in the fallback branch would otherwise look completely healthy (correct
 * `workspace_id`, no thrown error, nothing to distinguish it from a real event without reading the
 * `name` specifically).
 *
 * Each test seeds its taxonomy/term row directly via the in-memory repo rather than through
 * `createTaxonomy`/`createTerm`, so exactly one outbox event fires per test (the one under test) —
 * keeps the asserted event id/count unambiguous rather than needing to skip past setup-generated
 * rows.
 */
test("taxonomy chokepoint: createTerm through toTaxonomyOutbox persists workspace_id AND the real event name 'taxonomy.term_created', not the toTaxonomyOutbox fallback", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;
  const ids = { newId: () => `term-evt-${++counter}` };
  const workspaceId = "ws-taxonomy-term-1";

  const taxonomies = new InMemoryTaxonomyRepo();
  await taxonomies.insert({ id: "tax-seed-1", name: "Categories", hierarchical: true, status: "active", updatedAt: CLOCK.nowIso(), version: 1 });

  const deps: TaxonomyWriteServiceDeps = {
    authorize: ALWAYS_ALLOW,
    clock: CLOCK,
    idGen: { newId: () => "term-1" },
    taxonomies,
    terms: new InMemoryTermRepo(),
    entryTerms: new InMemoryEntryTermRepo(),
    revisions: new InMemoryTaxonomyRevisionRepo(),
    stampWatermark: noopStampWatermark,
    outbox: toTaxonomyOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId }),
    workspaceId,
    contentLookup: new InMemoryContentLookup(),
  };

  const term = await createTerm({ deps, principalId: "user-1", taxonomyId: "tax-seed-1", name: "News" });
  assert.ok(term.id, "createTerm must return the created row");

  const row = readOutboxRow(db, "term-evt-1");
  assert.ok(row, "taxonomy.term_created event must be persisted in outbox_events");
  assert.equal(row!.workspaceId, workspaceId);
  assert.equal(
    readOutboxEventName(db, "term-evt-1"),
    "taxonomy.term_created",
    "must be the real producer name, not the toTaxonomyOutbox fallback 'taxonomy.event'"
  );
});

test("taxonomy chokepoint: renameTerm through toTaxonomyOutbox persists workspace_id AND the real event name 'taxonomy.term_renamed', not the toTaxonomyOutbox fallback", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;
  const ids = { newId: () => `rename-evt-${++counter}` };
  const workspaceId = "ws-taxonomy-rename-1";

  const terms = new InMemoryTermRepo();
  await terms.insert({ id: "term-seed-1", taxonomyId: "tax-seed-1", parentId: null, name: "Old name", status: "active", updatedAt: CLOCK.nowIso(), version: 1 });

  const deps: TaxonomyWriteServiceDeps = {
    authorize: ALWAYS_ALLOW,
    clock: CLOCK,
    idGen: { newId: () => "unused" },
    taxonomies: new InMemoryTaxonomyRepo(),
    terms,
    entryTerms: new InMemoryEntryTermRepo(),
    revisions: new InMemoryTaxonomyRevisionRepo(),
    stampWatermark: noopStampWatermark,
    outbox: toTaxonomyOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId }),
    workspaceId,
    contentLookup: new InMemoryContentLookup(),
  };

  const renamed = await renameTerm({ deps, principalId: "user-1", termId: "term-seed-1", newName: "New name" });
  assert.equal(renamed.name, "New name");

  const row = readOutboxRow(db, "rename-evt-1");
  assert.ok(row, "taxonomy.term_renamed event must be persisted in outbox_events");
  assert.equal(row!.workspaceId, workspaceId);
  assert.equal(
    readOutboxEventName(db, "rename-evt-1"),
    "taxonomy.term_renamed",
    "must be the real producer name, not the toTaxonomyOutbox fallback 'taxonomy.event'"
  );
});

test("taxonomy chokepoint: assignTerms through toTaxonomyOutbox persists workspace_id AND the real event name 'taxonomy.terms_assigned' — the multi-line-enqueue producer the dossier flagged as unread", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;
  const ids = { newId: () => `assign-evt-${++counter}` };
  const workspaceId = "ws-taxonomy-assign-1";

  const terms = new InMemoryTermRepo();
  await terms.insert({ id: "term-seed-2", taxonomyId: "tax-seed-1", parentId: null, name: "News", status: "active", updatedAt: CLOCK.nowIso(), version: 1 });

  // "post" is on TAXONOMY_ALLOWED_CONTENT_TYPES (write-service.ts:99, ["post", "page"]) —
  // `assignTerms` throws `TaxonomyNotApplicableError` for any contentType NOT on that allow-list
  // (validation-chain.ts's `validateContentJoin`), so the content lookup must resolve for this
  // call to reach its own `outbox.enqueue` at all.
  const contentLookup = new InMemoryContentLookup([{ contentType: "post", contentId: "post-1", workspaceId, kind: "post" }]);

  const deps: TaxonomyWriteServiceDeps = {
    authorize: ALWAYS_ALLOW,
    clock: CLOCK,
    idGen: { newId: () => "unused" },
    taxonomies: new InMemoryTaxonomyRepo(),
    terms,
    entryTerms: new InMemoryEntryTermRepo(),
    revisions: new InMemoryTaxonomyRevisionRepo(),
    stampWatermark: noopStampWatermark,
    outbox: toTaxonomyOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId }),
    workspaceId,
    contentLookup,
  };

  await assignTerms({ deps, principalId: "user-1", contentType: "post", contentId: "post-1", termIds: ["term-seed-2"] });

  const row = readOutboxRow(db, "assign-evt-1");
  assert.ok(row, "taxonomy.terms_assigned event must be persisted in outbox_events");
  assert.equal(row!.workspaceId, workspaceId);
  assert.equal(
    readOutboxEventName(db, "assign-evt-1"),
    "taxonomy.terms_assigned",
    "must be the real producer name, not the toTaxonomyOutbox fallback 'taxonomy.event' — CONFIRMED by reading write-service.ts:384-391: assignTerms does supply a name, so this is regression coverage against a future edit dropping it, not evidence of a live defect today"
  );
});

test("widgets chokepoint: createWidgetInstance binds the RAW SqliteOutboxAdapter exactly as src/server/deps.ts wires it in production, and the entry.created event lands with the correct workspace_id", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;

  const workspaceId = "ws-widgets-1";
  const deps: WidgetWriteServiceDeps = {
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    clock: CLOCK,
    ids: { newId: () => `widget-id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    // Deliberately the raw adapter, unwrapped — this is the exact shape `src/server/deps.ts:384`
    // constructs (`new SqliteOutboxAdapter(db)`) and passes as `deps.outbox`. The bridging into
    // `toEntryOutbox`/`toContentTypeOutbox` happens INSIDE `write-service.ts`/`entry-payload.ts`,
    // never at this call site — reproducing that exactly is the point of this test.
    outbox,
  };

  const { instance } = await createWidgetInstance({
    deps,
    input: {
      workspaceId,
      actor: { principalId: "user-1" },
      widgetType: "text",
      title: "Footer notice",
      config: { body: "hello" },
    },
  });
  assert.equal(instance.status, "active");

  // Exactly 1, not "at least 1": `ensureWidgetContentTypesRegistered` calls `registerContentType`
  // twice (widget/widget_area seed types) through the SAME `toContentTypeOutbox` bridge, but
  // `registerContentType` itself never calls `deps.outbox.enqueue` (see the content-types test
  // above) — only the `createEntry` call underneath enqueues `entry.created`. If a future change
  // makes registration outbox-emitting too, this count should rise deliberately, not silently.
  const rows = db.select().from(outboxEvents).all();
  assert.equal(rows.length, 1, "exactly one outbox row (the widget's entry.created event) must be persisted");
  for (const row of rows) {
    assert.equal(row.workspaceId, workspaceId, `every outbox row written by the widgets chokepoint must carry the widget's own workspaceId, got ${row.workspaceId}`);
    assert.ok(row.id, "every outbox row must have a non-empty id");
  }
});

test("cross-tenant (dossier C6): two workspaces writing through the same adapter/db never cross-attribute a workspace_id", async () => {
  const { db, outbox } = makeOutbox();
  let counter = 0;
  const ids = { newId: () => `xt-evt-${++counter}` };

  const wsA = "ws-cross-a";
  const wsB = "ws-cross-b";
  const contentTypeRepoFor = (workspaceId: string) => ({
    findByKey: async (): Promise<OwningContentType | null> => ({ workspaceId, key: "post", status: "active", fields: [] }),
  });

  const resultA = await createEntry({
    deps: {
      entryRepo: new InMemoryEntryRepo(),
      contentTypeRepo: contentTypeRepoFor(wsA),
      clock: CLOCK,
      ids: { newId: () => "entry-a" },
      authorize: async () => ({ allowed: true, reason: "test: always allow" }),
      outbox: toEntryOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId: wsA }),
    },
    input: { actorId: "user-1", workspaceId: wsA, type: "post", slug: "a", title: "A", fieldsJson: { ext: { site: {} } } },
  });
  assert.equal(resultA.ok, true);

  const resultB = await createEntry({
    deps: {
      entryRepo: new InMemoryEntryRepo(),
      contentTypeRepo: contentTypeRepoFor(wsB),
      clock: CLOCK,
      ids: { newId: () => "entry-b" },
      authorize: async () => ({ allowed: true, reason: "test: always allow" }),
      outbox: toEntryOutbox({ outbox, clock: CLOCK, idGen: ids, workspaceId: wsB }),
    },
    input: { actorId: "user-1", workspaceId: wsB, type: "post", slug: "b", title: "B", fieldsJson: { ext: { site: {} } } },
  });
  assert.equal(resultB.ok, true);

  const rowA = readOutboxRow(db, "xt-evt-1");
  const rowB = readOutboxRow(db, "xt-evt-2");
  assert.equal(rowA!.workspaceId, wsA);
  assert.equal(rowB!.workspaceId, wsB);
  assert.notEqual(rowA!.workspaceId, rowB!.workspaceId, "the two workspaces' outbox rows must never be attributed to each other");
});
