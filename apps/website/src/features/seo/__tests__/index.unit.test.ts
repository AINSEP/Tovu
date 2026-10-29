import assert from "node:assert/strict";
import test from "node:test";

import { getEffective, set, type AuthorizeFn } from "@jini-ai/core/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemoryEventBus, InMemoryOutbox } from "../../../contracts/core/events/index.js";
import { InMemoryMediaRepo } from "../../media/index.js";
import { InMemoryPostRepo } from "../../post/repo.memory.js";
import { createSettingsPrincipalLookup, InMemorySettingsRepo } from "../../settings/index.js";
import { ensureSiteTitleSettingDefinition, SITE_TITLE_KEY, SITE_TITLE_NAMESPACE } from "../../settings/site-title.js";
import { createSeoDeps, createSeoPostPort } from "../index.js";

/**
 * @file `createSeoDeps` / `createSeoPostPort` — the SEO host bindings, exercised through the
 * returned ports against in-memory owners and hand-written fakes (no module mocks).
 */

const WORKSPACE = "ws-seo-index";
const clock = { nowIso: () => "2026-09-12T00:00:00.000Z", nowMs: () => Date.parse("2026-09-12T00:00:00.000Z") };
let idCounter = 0;
const ids = { newId: () => `seo-index-id-${++idCounter}` };
const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });

function makeDeps() {
  const settingsRepo = new InMemorySettingsRepo();
  const listedNames: string[] = [];
  const transformDefinitionRepo = {
    marker: "transform-repo",
    async listByName(this: { marker: string }, { workspaceId, name }: { workspaceId: string; name: string }) { listedNames.push(`${this.marker}:${workspaceId}:${name}`); return []; },
  };
  const deps = {
    mediaRepo: new InMemoryMediaRepo({}, { initialRows: [] }),
    postRepo: new InMemoryPostRepo(),
    settingsRepo,
    transformDefinitionRepo,
    originRegistry: { marker: "origins" },
    clock: { prefix: "bound", nowIso(this: { prefix: string }) { return `${this.prefix}:2026-09-12T00:00:00.000Z`; } },
  };
  return { deps, listedNames, settingsRepo };
}

test("createSeoDeps: siteTitle counts only an explicit workspace title, never the registered default", async () => {
  const { deps, settingsRepo } = makeDeps();
  const ledger = { settingsRepo, clock, ids, principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) }) };
  await ensureSiteTitleSettingDefinition(ledger, { systemPrincipalId: "system-seo-index" });
  const seo = createSeoDeps({ deps } as never, {});

  assert.equal((await getEffective({ repo: settingsRepo }, { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scopeContext: { workspaceId: WORKSPACE } }))?.sourceLayer !== "workspace", true);
  assert.equal(await seo.siteTitle({ workspaceId: WORKSPACE }), undefined, "the default layer is not an explicit title");

  await set({
    deps: { repo: settingsRepo, clock, ids, authorize: allowAll, principals: ledger.principals },
    input: { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scope: "workspace", workspaceId: WORKSPACE, value: "  Field Notes  ", callerPrincipalId: "owner" },
  });
  assert.equal(await seo.siteTitle({ workspaceId: WORKSPACE }), "Field Notes");
});

test("createSeoDeps: static bindings, clock/transform receivers and public-access decision", async () => {
  const { deps, listedNames } = makeDeps();
  const seo = createSeoDeps({ deps } as never, {});

  assert.equal(seo.shareImageTransform, "og");
  assert.equal(seo.originRegistry, deps.originRegistry);
  assert.equal(typeof seo.rootSlug, "string");
  assert.equal(seo.clock.nowIso(), "bound:2026-09-12T00:00:00.000Z", "nowIso keeps its receiver");
  await seo.media.transformDefinitionRepo.listByName({ workspaceId: "ws", name: "og" });
  assert.deepEqual(listedNames, ["transform-repo:ws:og"], "listByName keeps its receiver and workspace-scoped input");

  assert.equal(seo.isPubliclyAccessible({ post: { memberAccessJson: null } } as never), true);
  assert.equal(seo.isPubliclyAccessible({ post: { memberAccessJson: JSON.stringify({ visibility: "members" }) } } as never), false);
  assert.equal(seo.isPubliclyAccessible({ post: { memberAccessJson: "{not json" } } as never), false, "malformed access fails closed");
});

test("createSeoDeps: liveness and url ports delegate to the scheduled-publish and routing owners", () => {
  const { deps } = makeDeps();
  const seo = createSeoDeps({ deps } as never, {});
  const live = { status: "published", publishAt: "2026-01-01T00:00:00.000Z", updatedAt: "2025-12-31T00:00:00.000Z", deletedAt: null };
  const scheduled = { ...live, publishAt: "2027-01-01T00:00:00.000Z" };
  const nowIso = "2026-06-01T00:00:00.000Z";

  assert.equal(seo.liveness.isLiveAt({ post: live, nowIso } as never), true);
  assert.equal(seo.liveness.isLiveAt({ post: scheduled, nowIso } as never), false);
  assert.equal(seo.liveness.isScheduledAt({ post: scheduled, nowIso } as never), true);
  assert.equal(seo.liveness.postDisplayDateIso({ post: live } as never), "2026-01-01T00:00:00.000Z");
  assert.equal(seo.urls.postPublicPath({ slug: "hello-world" }), "/hello-world");
});

test("createSeoDeps: dispatch drains the outbox through the host outbox worker", async () => {
  const { deps } = makeDeps();
  const seo = createSeoDeps({ deps } as never, {});
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const delivered: string[] = [];
  await bus.subscribe({ eventName: "seo.test", handler: async (event) => { delivered.push(event.id); } });
  await outbox.enqueue({ id: "evt-1", name: "seo.test", occurredAt: "2026-01-01T00:00:00.000Z", payload: {} } as never);
  const processed = await seo.dispatch({ outbox, bus, clock } as never);
  assert.equal(processed, 1);
  assert.deepEqual(delivered, ["evt-1"]);
});

test("createSeoPostPort: every port method calls through the host repo with its receiver intact", async () => {
  const calls: string[] = [];
  const postRepo = {
    tag: "repo",
    async findById(this: { tag: string }, input: unknown) { calls.push(`${this.tag}:findById:${JSON.stringify(input)}`); return null; },
    async list(this: { tag: string }, input: unknown) { calls.push(`${this.tag}:list:${JSON.stringify(input)}`); return []; },
    async transaction(this: { tag: string }, fn: () => Promise<string>) { calls.push(`${this.tag}:transaction`); return fn(); },
    async saveIfVersion(this: { tag: string }, input: { ifVersion: number }) { calls.push(`${this.tag}:saveIfVersion:${input.ifVersion}`); return true; },
    async appendRevision(this: { tag: string }, input: { stateJson: { id: string } }) { calls.push(`${this.tag}:appendRevision:${input.stateJson.id}`); },
  };
  const port = createSeoPostPort({ postRepo } as never);

  assert.equal(await port.findById({ workspaceId: "w", id: "p" } as never), null);
  assert.deepEqual(await port.list({ workspaceId: "w" } as never), []);
  assert.equal(await port.transaction({ fn: async () => "inside" } as never), "inside");
  assert.equal(await port.saveIfVersion({ record: { id: "p" }, ifVersion: 3 } as never), true);
  await port.appendRevision({ stateJson: { id: "p" }, workspaceId: "w" } as never);
  assert.equal(port.extractPlainText({ html: "<p>Hello <b>there</b></p>" }).replace(/\s+/g, " ").trim(), "Hello there");
  assert.equal(port.isTrashed({ post: { deletedAt: "2026-01-01T00:00:00.000Z" } } as never), true);
  assert.equal(port.isTrashed({ post: { deletedAt: null } } as never), false);
  assert.deepEqual(calls, [
    'repo:findById:{"workspaceId":"w","id":"p"}', 'repo:list:{"workspaceId":"w"}', "repo:transaction", "repo:saveIfVersion:3", "repo:appendRevision:p",
  ]);
});
