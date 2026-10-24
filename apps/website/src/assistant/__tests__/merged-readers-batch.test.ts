import { invokeRegisteredTool } from "./fixtures/execute-registered-tool.js";
import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
/**
 * @file Batch the five merged get/list readers through their production cards and real domain
 * handlers. With default-on read batching, an item without an id explicitly selects the list. Authorization,
 * workspace isolation and peer-site refusal still run inside each original scoped handler.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { InMemoryRedirectRepo, type RedirectRecord } from "@jini-ai/cms/redirects";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import { InMemoryEntryRefsRepo } from "../../contracts/core/entry-refs/repo.memory.js";
import { InMemoryContentTypeRepo } from "../../features/content-types/index.js";
import { InMemoryEntryRepo } from "../../features/entries/index.js";
import { InMemoryNewsletterCampaignRepo } from "../../features/newsletter/repo.memory.js";
import type { CampaignRecord } from "../../features/newsletter/types.js";
import { contributeNewsletterTools } from "../../features/newsletter/tool-registrations.js";
import { InMemoryPostRepo } from "../../features/post/index.js";
import { buildPostRecord } from "../../features/post/__tests__/post-record.fixture.js";
import { contributePostTools } from "../../features/post/tool-registrations.js";
import { contributeRedirectsTools } from "../../features/redirects/tool-registrations.js";
import { isNeverInTrash } from "../../features/redirects/__tests__/remove-redirect-double.js";
import { contributeWidgetsTools } from "../../features/widgets/tool-registrations.js";
import { peerFixture } from "../../server/runtime/composition/__tests__/peer-site-reads.fixture.js";
import type { ToolContributor, DerivedToolContributor } from "../index.js";
import type { BatchResult } from "../batch-tool-inputs.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { type RegistryDepsWithoutLimiter, toAssistantRegistryDeps } from "./fixtures/registry-deps.js";

const WORKSPACE = "merged-batch", PRINCIPAL = "reader", NOW = "2026-10-17T00:00:00.000Z";
const READERS = [
  { source: "content_post_get", card: "content_read.content_post", id: "id", view: "post", viewId: "id", permission: "content.read", shared: { kind: "post" }, missing: /CONTENT_POST_NOT_FOUND/ },
  { source: "newsletter_get_campaign", card: "content_read.newsletter_campaign", id: "campaignId", view: "campaign", viewId: "id", permission: "admin.newsletter.read", shared: {}, missing: /NEWSLETTER_CAMPAIGN_NOT_FOUND/ },
  { source: "redirects_get", card: "content_read.redirect", id: "id", view: "rule", viewId: "id", permission: "admin.redirects.manage", shared: {}, missing: /REDIRECTS_NOT_FOUND/ },
  { source: "widgets_get_instance", card: "content_read.widget_instance", id: "widgetInstanceId", view: "instance", viewId: "id", permission: "widgets.read", shared: {}, missing: /WIDGETS_INSTANCE_NOT_FOUND/ },
  { source: "widgets_get_region", card: "content_read.widget_region", id: "regionKey", view: "area", viewId: "regionKey", permission: "widgets.read", shared: {}, missing: /WIDGETS_AREA_NOT_FOUND/ },
] as const;

function context(input: unknown, principalId = PRINCIPAL): ToolExecutionContext {
  return { executionId: "merged-batch", principal: { id: principalId }, run: { id: "run" }, input, signal: new AbortController().signal };
}

/** Actual repositories and contributors; only the authorization outcome is controlled. */
async function harness() {
  const postRepo = new InMemoryPostRepo();
  const newsletterCampaignRepo = new InMemoryNewsletterCampaignRepo();
  const redirects: RedirectRecord[] = [];
  for (const id of ["first", "second", "third", "foreign"]) {
    const workspaceId = id === "foreign" ? "other-workspace" : WORKSPACE;
    await postRepo.save(buildPostRecord({ id, workspaceId, title: id, slug: id }));
    await newsletterCampaignRepo.saveCampaignRow({
      id, workspaceId, status: "draft", subject: id, preheader: null, fromName: "Ops",
      fromEmail: "ops@example.test", replyTo: "ops@example.test", listId: "list", scheduledAt: null,
      sendStartedAt: null, audienceSnapshotId: null,
      counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
      version: 1, createdByPrincipal: PRINCIPAL, createdAt: NOW, updatedAt: NOW,
    } satisfies CampaignRecord);
    redirects.push({
      id, workspaceId, matchType: "exact", fromPattern: `/${id}`, toTarget: "/target",
      statusCode: 301, status: "active", override: false, priority: 0, source: "manual",
      version: 1, createdByPrincipal: PRINCIPAL, createdAt: NOW, updatedAt: NOW,
    });
  }
  const checks: Array<Record<string, unknown>> = [];
  let deniedCheck = -1, sequence = 0;
  const deps = {
    workspaceId: WORKSPACE, clock: { nowMs: () => Date.parse(NOW) }, idGen: { newId: () => `id-${++sequence}` },
    postRepo, newsletterCampaignRepo, newsletterReady: Promise.resolve(),
    redirectRepo: new InMemoryRedirectRepo({ seed: redirects }),
    redirectsWriteDeps: { isInTrash: isNeverInTrash },
    entryRepo: new InMemoryEntryRepo(), contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(), widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    outbox: { enqueue: async () => undefined },
    authorize: async (input: Record<string, unknown>) => {
      checks.push(input);
      return { allowed: checks.length !== deniedCheck, reason: "batch fixture" };
    },
  } as unknown as RegistryDepsWithoutLimiter;
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  for (const contribution of [contributePostTools(), contributeNewsletterTools(), contributeRedirectsTools(), contributeWidgetsTools()]) {
    contributions.contributors.register({ contribution });
  }
  const build = (workspaceId = WORKSPACE, batch = true) => buildAssistantToolRegistrations(
    toAssistantRegistryDeps({ routeDeps: { ...deps, workspaceId } }), undefined,
    { contributions, ...(batch ? {} : { batchableTools: [] }) },
  );
  const find = (registrations: readonly ToolRegistration[], id: string) => {
    const registration = registrations.find(tool => tool.descriptor.id === id);
    assert.ok(registration, id);
    return registration;
  };
  const registrations = build();
  const widgetIds: Record<string, string> = {};
  for (const name of ["first", "second", "third", "foreign"]) {
    const tools = name === "foreign" ? build("other-workspace") : registrations;
    const created = await find(tools, "widgets_create_instance").handler(context({ widgetType: "text", title: name, config: { body: name } })) as { instance: { id: string } };
    widgetIds[name] = created.instance.id;
    await find(tools, "widgets_bind_region").handler(context({ regionKey: name }));
  }
  checks.length = 0;
  return {
    checks, registrations, baseline: build(WORKSPACE, false), find,
    input: (reader: typeof READERS[number], name: string) => ({
      [reader.id]: reader.id === "widgetInstanceId" ? widgetIds[name] : name,
    }),
    denySecond: () => { deniedCheck = 2; },
  };
}

/** Executor notes for each legacy selector the card renames to its canonical `id`. */
function legacyIdNotes(reader: typeof READERS[number], prefixes: readonly string[]): string[] {
  return reader.id === "id" ? [] : prefixes.map(prefix => `${prefix}${reader.id}→id`);
}

for (const reader of READERS) {
  test(`${reader.source}: three ids succeed through the merged card with the 25-item schema`, async () => {
    const h = await harness();
    const registration = h.find(h.registrations, reader.card);
    assert.equal(h.registrations.some(tool => tool.descriptor.id === reader.source), false);
    assert.equal(registration.descriptor.readOnly, true);
    const schema = registration.descriptor.inputSchema as { properties: { items: { maxItems: number } } };
    assert.equal(schema.properties.items.maxItems, 25);
    const inputs = ["first", "second", "third"].map(name => h.input(reader, name));
    const result = await invokeRegisteredTool(registration, context({ ...reader.shared, items: inputs })) as BatchResult;
    assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 3, 3, 0]);
    assert.deepEqual(result.results.map(item => {
      assert.equal(item.ok, true);
      return { index: item.index, id: (item.result as Record<string, Record<string, unknown>>)[reader.view]![reader.viewId] };
    }), inputs.map((input, index) => ({ index, id: input[reader.id] })));
    assert.deepEqual(h.checks.map(check => [check.permission, check.workspaceId, check.principalId]),
      inputs.map(() => [reader.permission, WORKSPACE, PRINCIPAL]));
  });

  for (const missingField of [false, true]) test(`${reader.source}: isolates ${missingField ? "an absent id field" : "a nonexistent id"} and reads the next item`, async () => {
    const h = await harness();
    const result = await invokeRegisteredTool(h.find(h.registrations, reader.card), context({ ...reader.shared, items: [
      h.input(reader, "first"), missingField ? {} : { [reader.id]: "missing" }, h.input(reader, "third"),
    ] })) as BatchResult;
    if (missingField) {
      // All read operations now batch, including the card's list operation. Its existing
      // permission-filtered list handler remains the owner of the returned data.
      assert.deepEqual(result.results.map(item => item.ok), [true, true, true]);
      assert.deepEqual((result.results[1] as { result: unknown }).result,
        await h.find(h.baseline, reader.card).handler(context(reader.shared)));
      return;
    }
    assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 3, 2, 1]);
    assert.deepEqual(result.results.map(item => item.ok), [true, false, true]);
    const failed = result.results[1]!;
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.match(failed.error, missingField ? new RegExp(`'${reader.id}' .* is required`) : reader.missing);
    assert.deepEqual(result.results.filter(item => item.ok).map(item =>
      (item.result as Record<string, Record<string, unknown>>)[reader.view]![reader.viewId]),
    [h.input(reader, "first")[reader.id], h.input(reader, "third")[reader.id]]);
  });

  test(`${reader.source}: refuses an unauthorized item without stopping later reads`, async () => {
    const h = await harness();
    h.denySecond();
    const result = await invokeRegisteredTool(h.find(h.registrations, reader.card), context({ ...reader.shared, items: [
      h.input(reader, "first"), h.input(reader, "second"), h.input(reader, "third"),
    ] })) as BatchResult;
    assert.deepEqual([result.succeeded, result.failed], [2, 1]);
    assert.deepEqual(result.results.map(item => item.ok), [true, false, true]);
    const failed = result.results[1]!;
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.match(failed.error, /batch fixture/);
      assert.equal(Object.hasOwn(failed, "result"), false);
    }
    assert.deepEqual(h.checks.map(check => check.permission), [reader.permission, reader.permission, reader.permission]);
  });

  test(`${reader.source}: accepts 25 and refuses 26 items before authorization`, async () => {
    const h = await harness();
    const registration = h.find(h.registrations, reader.card);
    // The card owns the batch cap now, so it refuses before normalizing any item's legacy id.
    await assert.rejects(invokeRegisteredTool(registration, context({ ...reader.shared,
      items: Array.from({ length: 26 }, () => h.input(reader, "first")),
    })), { message: `${reader.card}: 'items' has 26 entries; the most one call takes is 25. Split them into several calls.` });
    assert.deepEqual(h.checks, []);
    const result = await invokeRegisteredTool(registration, context({ ...reader.shared,
      items: Array.from({ length: 25 }, () => h.input(reader, "first")),
    })) as BatchResult;
    assert.deepEqual([result.total, result.succeeded, result.failed], [25, 25, 0]);
    assert.equal(h.checks.length, 25);
  });

  test(`${reader.source}: malformed items cannot fall through to the list`, async () => {
    const h = await harness();
    const registration = h.find(h.registrations, reader.card);
    for (const items of [undefined, null, [], "first"]) {
      await assert.rejects(invokeRegisteredTool(registration, context({ ...reader.shared, items })), {
        message: `${reader.card}: 'items' must be a non-empty array of inputs`,
      });
    }
    assert.deepEqual(h.checks, []);
  });

  test(`${reader.source}: cannot override the workspace to read a foreign record`, async () => {
    const h = await harness();
    const result = await invokeRegisteredTool(h.find(h.registrations, reader.card), context({ ...reader.shared, items: [
      h.input(reader, "first"), { ...h.input(reader, "foreign"), workspaceId: "other-workspace" }, h.input(reader, "third"),
    ] })) as BatchResult;
    assert.deepEqual([result.succeeded, result.failed], [2, 1]);
    assert.deepEqual(result.results.map(item => item.ok), [true, false, true]);
    const failed = result.results[1]!;
    assert.equal(failed.ok, false);
    // The closed item schema refuses the override before the item reaches its handler.
    if (!failed.ok) assert.match(failed.error, /Unknown input 'workspaceId'/);
    assert.deepEqual(h.checks.map(check => check.workspaceId), [WORKSPACE, WORKSPACE]);
  });

  test(`${reader.source}: single get and list calls keep the unbatched shape and card`, async () => {
    const h = await harness();
    const registration = h.find(h.registrations, reader.card), baseline = h.find(h.baseline, reader.card);
    assert.equal(registration.descriptor.id, baseline.descriptor.id);
    assert.equal(registration.descriptor.readOnly, baseline.descriptor.readOnly);
    assert.deepEqual(registration.descriptor.metadata, baseline.descriptor.metadata);
    for (const [input, prefixes] of [[{ ...reader.shared, ...h.input(reader, "first") }, [""]], [{ ...reader.shared }, []]] as const) {
      const expected = await baseline.handler(context(input));
      const actual = await invokeRegisteredTool(registration, context(input));
      // why: canonical card ids — a legacy selector still reads the same record, plus the executor's rename note.
      const notes = legacyIdNotes(reader, prefixes);
      assert.equal(JSON.stringify(actual), JSON.stringify(notes.length ? { ...expected as object, normalizationNotes: notes } : expected));
      assert.equal(Object.hasOwn(actual as object, "batch"), false);
    }
  });
}

test("all five merged reader cards refuse non-owner peer-site items before opening a database", async t => {
  const f = await peerFixture(t);
  const registrations = f.build(true);
  for (const reader of READERS) {
    const registration = registrations.find(tool => tool.descriptor.id === reader.card);
    assert.ok(registration, reader.card);
    const result = await invokeRegisteredTool(registration, context({ ...reader.shared, site: "B", items: [
      { [reader.id]: "first" }, { [reader.id]: "second", site: "B" },
    ] }, "admin")) as BatchResult;
    assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 2, 0, 2], reader.card);
    // Cards canonicalize legacy ids before the site scope refuses, so the executor appends that note.
    const notes = legacyIdNotes(reader, [""]);
    const error = `Only this installation's owner can read other sites.${notes.length ? `\nnormalized: ${notes.join("; ")}` : ""}`;
    assert.deepEqual(result.results, [0, 1].map(index => ({ index, ok: false, error })), reader.card);
  }
  assert.deepEqual(f.contentHandles, []);
  assert.deepEqual(f.audits, []);
});

test("all five merged reader cards reject nested peer-site batches at the closed item gate", async t => {
  const f = await peerFixture(t);
  const registrations = f.build(true);
  for (const reader of READERS) {
    const registration = registrations.find(tool => tool.descriptor.id === reader.card);
    assert.ok(registration, reader.card);
    const result = await invokeRegisteredTool(registration, context({ ...reader.shared, site: "B", items: [
      { items: Array.from({ length: 25 }, () => ({ [reader.id]: "post" })) },
      { items: [{ [reader.id]: "post" }] },
    ] }, f.a.ownerId)) as BatchResult;
    assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 2, 0, 2], reader.card);
    assert.deepEqual(result.results.map(item => [item.index, item.ok]), [[0, false], [1, false]], reader.card);
    for (const item of result.results) {
      assert.equal(item.ok, false);
      // The closed item schema refuses a nested batch before any scalar read.
      if (!item.ok) assert.match(item.error, /Unknown input 'items'/, reader.card);
      assert.equal(Object.hasOwn(item, "result"), false, reader.card);
      assert.equal(Object.hasOwn(item, "results"), false, reader.card);
    }
  }
  // Refused at the item gate, so no cross-site read is requested or audited.
  assert.equal(f.audits.length, 0);
});

test("the merged post card scopes each item before reading and continues after an unknown site", async t => {
  const f = await peerFixture(t);
  const registration = f.build(true).find(tool => tool.descriptor.id === "content_read.content_post");
  assert.ok(registration);
  const result = await invokeRegisteredTool(registration, context({ kind: "post", site: "B", items: [
    { id: "post" }, { id: "post", site: "unknown-site" }, { id: "post", site: "A" },
  ] }, f.a.ownerId)) as BatchResult;
  assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 3, 2, 1]);
  assert.deepEqual(result.results.map(item => item.ok), [true, false, true]);
  assert.deepEqual(result.results.filter(item => item.ok).map(item =>
    (item.result as { post: { title: string } }).post.title), ["B post", "A post"]);
  const failed = result.results[1]!;
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.error, /No readable local site has that name/);
  assert.equal(f.audits.length, 1);
});

test('collapsed batches retain the retired source policy and never turn a missing item id into a list', async () => {
  const { withBatchInput, ToolInputError } = await import('@jini-ai/core');
  const { deriveContentReadRegistrations } = await import('../content-read-tool.js');
  const authorized: unknown[] = [], handled: unknown[] = [];
  let listed = 0;
  const get: ToolRegistration = {
    descriptor: { id: 'content_post_get', readOnly: true, inputSchema: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, enabled: { type: 'boolean' } } } },
    policy: { authorize: ({ input }) => { authorized.push(input); return (input as { enabled?: boolean }).enabled === true ? 'deny' : 'allow'; } },
    handler: async ({ input }) => {
      if (typeof (input as { id?: string }).id !== 'string') throw new ToolInputError({ message: 'id is required' });
      handled.push(input);
      return { post: input };
    },
  };
  const list: ToolRegistration = {
    descriptor: { id: 'content_post_list', readOnly: true, inputSchema: { type: 'object', properties: {} } },
    policy: { authorize: () => 'allow' }, handler: async () => { listed++; return { posts: ['private list'] }; },
  };
  const registrations = deriveContentReadRegistrations([withBatchInput({ registration: get, tool: { toolId: 'content_post_get' } }), list]);
  assert.equal(registrations.some(registration => registration.descriptor.id === 'content_post_get'), false);
  const card = registrations.find(registration => registration.descriptor.id === 'content_read.content_post')!;
  const result = await invokeRegisteredTool(card, context({ items: [{ id: 'denied', enabled: 'true' }, {}, { id: 'allowed', enabled: 'false' }] })) as BatchResult;
  assert.deepEqual(result.results.map(item => item.ok), [false, false, true]);
  assert.match((result.results[0] as { error: string }).error, /denied/);
  assert.match((result.results[1] as { error: string }).error, /id is required/);
  assert.deepEqual(authorized, [{ id: 'denied', enabled: true }, {}, { id: 'allowed', enabled: false }]);
  assert.deepEqual(handled, [{ id: 'allowed', enabled: false }]);
  assert.equal(listed, 0);
});
