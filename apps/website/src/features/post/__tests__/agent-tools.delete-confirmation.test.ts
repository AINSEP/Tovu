import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";
import { removeVia } from "./remove-post-double.js";

/** Owner policy: reversible removal runs immediately; authorization and data integrity remain enforced. */

const WORKSPACE_ID = "ws-delete-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-30T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  let allow = options.allow ?? true;
  const postRepo = new InMemoryPostRepo();
  const changeSets = new InMemoryChangeSetRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox,
    bus,
    postRepo,
    removePost: removeVia(postRepo),
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  } as unknown as PostToolDeps;

  return {
    deps,
    postRepo,
    changeSets,
    outbox,
    bus,
    authorizeCalls,
    setAllow: (value: boolean) => {
      allow = value;
    },
  };
}

function buildRegistrations(deps: PostToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildPostRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

/** Checked registry lookup — `registrations.get(id)!` would trip the repo's noNonNullAssertion rule. */
function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? { id: "p1", kind: "post" },
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function seedPost(postRepo: InMemoryPostRepo, overrides: Record<string, unknown> = {}) {
  const row = {
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "My Article",
    slug: "my-article",
    bodyJson: EMPTY_DOC,
    status: "published" as const,
    kind: "post" as const,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
  await postRepo.save(row as never);
  return row;
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe would. */

test("kind:'page' refuses a row whose actual kind is 'post', before any dialog is raised", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { kind: "post" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  await assert.rejects(() => call(deleteTool, { input: { id: "p1", kind: "page" } }), /page 'p1' was not found/);
  assert.equal(surfaceExchanges.size(), 0, "a refused target must never raise a dialog");
});

test("n06: reversible removal runs without a confirmation channel", async () => {
  const { deps, postRepo, changeSets } = fakeRouteDeps();
  await seedPost(postRepo);
  const store = createSurfaceExchangeStore();
  const result = await call(tool(buildRegistrations(deps, store), "content_post_delete")) as {deleted: boolean; cancelled: boolean};
  assert.equal(result.deleted, true);
  assert.equal(result.cancelled, false);
  assert.equal((await postRepo.findById({workspaceId: WORKSPACE_ID, id: "p1"}))?.deletedAt, NOW);
  assert.equal((await changeSets.listByWorkspace({workspaceId: WORKSPACE_ID})).length, 1);
  assert.equal(store.size(), 0);
});

test("permissions still deny content reads and writes without trashing the row", async () => {
  for (const deniedPermission of ["content.read", "content.write"]) {
    const {deps, postRepo} = fakeRouteDeps();
    await seedPost(postRepo);
    deps.authorize = async ({permission}) => ({allowed: permission !== deniedPermission, reason: "insufficient_permission"});
    await assert.rejects(call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), "content_post_delete")), new RegExp(deniedPermission));
    assert.equal((await postRepo.findById({workspaceId: WORKSPACE_ID, id: "p1"}))?.version, 1);
  }
});

test("a concurrent edit is refused by the existing version guard", async (t) => {
  const {deps, postRepo} = fakeRouteDeps();
  await seedPost(postRepo);
  const find = postRepo.findById.bind(postRepo);
  let reads = 0;
  t.mock.method(postRepo, "findById", async (input: Parameters<typeof find>[0]) => {
    const row = await find(input);
    if (++reads === 2 && row) return {...row, version: row.version + 1};
    return row;
  });
  await assert.rejects(call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), "content_post_delete")), /stale-entity-version/);
  assert.equal((await find({workspaceId: WORKSPACE_ID, id: "p1"}))?.version, 1);
});
