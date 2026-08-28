import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file Certification of `content_post_delete`'s confirmation gate (ADR-055 Decision 2), which
 * replaced the two-call token-redemption protocol this file used to certify (ADR-053 Decision 3,
 * `assistant/pending-confirmations.ts`).
 *
 * ## What changed, and why this file was rewritten rather than patched
 *
 * The old protocol was: call 1 mints a token and returns; the model's turn ends; a human click sends
 * a SECOND, independent tool call carrying the token; that call performs the delete and reports the
 * result — to the dialog, not the model (the bug ADR-055 exists to fix). The new protocol is one
 * call that opens a `SurfaceExchangeStore` exchange, emits the dialog through it, and PARKS until the
 * human answers (or times out, or the run ends) — the SAME call then returns the truthful outcome.
 * There is no second tool call, so there is nothing left for a token to guard.
 *
 * ## The property this file is responsible for, restated for the new mechanism
 *
 * ADR-055's own words: "the replacement invariant is: the handler, not the model, performs the
 * destructive act." Concretely: the ONLY way to make a pending `content_post_delete` call resolve
 * with a decision is `surfaceExchanges.deliver(...)` — the in-process equivalent of a browser POST to
 * `mcp-ui-tool-calls-route.ts`, a channel the model has no access to (see
 * `delete-confirmation-ui.ts`'s header for the full chain). A model re-calling the tool, or fabricating
 * `{decision:"confirm"}` as ordinary input, cannot resolve an existing pending call — the new schema
 * (`agent-tools.ts`) does not even accept those fields as model input anymore, and this file asserts
 * that directly rather than assuming it from reading the schema.
 */

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
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox,
    bus,
    postRepo,
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
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Raises the dialog and returns everything a test needs to answer it. */
async function raiseDialog(deleteTool: ToolRegistration, input: Record<string, unknown> = { id: "p1", kind: "post" }) {
  const emitted: unknown[] = [];
  const pending = call(deleteTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId };
}

// ---------------------------------------------------------------------------
// 1. The call parks, the dialog names exactly what is about to be deleted, and nothing is written
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is deleted while it is pending", async () => {
  const { deps, postRepo, changeSets, outbox } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildRegistrations(deps, surfaceExchanges);
  const deleteTool = tool(registrations, "content_post_delete");

  const { pending, ui, exchangeId } = await raiseDialog(deleteTool);

  assert.equal(ui.type, "resource");
  assert.match(ui.resource.uri, /^ui:\/\/tovu\/content-post-delete\/p1\/1$/);
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers",
  );

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt ?? null, null, "the row must still be live while the dialog is open");
  assert.equal(row?.version, 1);
  assert.equal((await changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID })).length, 0);
  assert.equal((await outbox.claimPending({ limit: 10, now: NOW })).length, 0);

  // Let the call resolve so the test does not leak a pending exchange.
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names exactly what is about to be deleted, so the consent is informed", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { title: "Quarterly Report", slug: "quarterly-report", status: "published" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { ui, exchangeId, pending } = await raiseDialog(deleteTool);

  assert.match(ui.resource.text, /Quarterly Report/);
  assert.match(ui.resource.text, /quarterly-report/);
  assert.match(ui.resource.text, /published/);
  assert.match(ui.resource.text, /moved to the trash/i, "the human must be told it is recoverable");

  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog HTML-escapes the row's own fields — a title cannot inject markup into the dialog", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { title: `<img src=x onerror="alert(1)">` });
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { ui, exchangeId, pending } = await raiseDialog(deleteTool);

  assert.equal(ui.resource.text.includes("<img src=x"), false, "the raw tag must not survive into the dialog");
  assert.match(ui.resource.text, /&lt;img src=x/);

  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 2. THE security property: the model cannot complete the delete on its own
// ---------------------------------------------------------------------------

test("the model's own schema no longer accepts a decision/confirmation field at all", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const schema = deleteTool.descriptor.inputSchema as { properties: object; additionalProperties?: boolean };
  assert.deepEqual(Object.keys(schema.properties), ["id", "kind"]);
  assert.equal(schema.additionalProperties, false);

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("re-calling the tool while a dialog is pending opens a SEPARATE dialog — it does not answer the first one", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const first = await raiseDialog(deleteTool);
  const second = await raiseDialog(deleteTool);

  assert.notEqual(first.exchangeId, second.exchangeId);
  assert.equal(surfaceExchanges.size(), 2);
  assert.equal(
    await Promise.race([first.pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "a fresh call must not resolve an earlier pending call",
  );

  surfaceExchanges.deliver({ exchangeId: first.exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  surfaceExchanges.deliver({ exchangeId: second.exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await Promise.all([first.pending, second.pending]);
});

test("delivering to an unknown exchange id is refused and deletes nothing", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { exchangeId, pending } = await raiseDialog(deleteTool);

  const forged = surfaceExchanges.deliver({
    exchangeId: "not-a-real-exchange-id",
    toolId: "content_post_delete",
    principalId: PRINCIPAL_ID,
    params: { decision: "confirm" },
  });
  assert.deepEqual(forged, { ok: false, reason: "unknown-or-closed" });

  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

test("a redelivery to an already-closed exchange is refused — the confirmed delete cannot be replayed", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  const result = (await pending) as { deleted: boolean };
  assert.equal(result.deleted, true);

  const replay = surfaceExchanges.deliver({
    exchangeId,
    toolId: "content_post_delete",
    principalId: PRINCIPAL_ID,
    params: { decision: "confirm" },
  });
  assert.deepEqual(replay, { ok: false, reason: "unknown-or-closed" }, "the exchange must not still be open after it resolved");

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.version, 2, "the replay must not process a second delete");
});

// ---------------------------------------------------------------------------
// 3. Confirm, cancel, and the two no-answer outcomes (ADR-055 Decision 6)
// ---------------------------------------------------------------------------

test("confirm: the human's click performs the soft delete and the SAME call reports it to the agent", async () => {
  const { deps, postRepo, bus } = fakeRouteDeps();
  await seedPost(postRepo, { status: "published" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildRegistrations(deps, surfaceExchanges);
  const deleteTool = tool(registrations, "content_post_delete");

  const seen: string[] = [];
  await bus.subscribe("entry.unpublished", (event: { name?: string }) => seen.push(event.name ?? "entry.unpublished"));

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  const delivered = surfaceExchanges.deliver({
    exchangeId,
    toolId: "content_post_delete",
    principalId: PRINCIPAL_ID,
    params: { decision: "confirm" },
  });
  assert.deepEqual(delivered, { ok: true });

  const result = await pending;
  assert.deepEqual((result as { deleted: boolean; cancelled: boolean }).deleted, true);
  assert.deepEqual((result as { deleted: boolean; cancelled: boolean }).cancelled, false);

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.ok(row, "a soft delete keeps the row");
  assert.equal(row.deletedAt, NOW);
  assert.equal(row.version, 2);
  assert.equal(row.title, "My Article", "no data was lost");
  assert.equal(seen.length, 1, "a published row's delete must drain entry.unpublished to the bus");

  const listed = (await tool(registrations, "content_post_list").handler({
    executionId: "e", principal: { id: PRINCIPAL_ID }, run: { id: "r" }, input: { kind: "post" }, signal: new AbortController().signal,
  })) as { posts: unknown[] };
  assert.deepEqual(listed.posts, []);
});

test("cancel: nothing is deleted, and the SAME call reports the cancellation", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  assert.deepEqual(await pending, {
    deleted: false,
    cancelled: true,
    post: { id: "p1", kind: "post", title: "My Article", slug: "my-article", bodyJson: EMPTY_DOC, status: "published", updatedAt: NOW, version: 1 },
  });
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const result = (await call(deleteTool, { emitSurface: async () => undefined })) as {
    deleted: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.deleted, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

test("a cancelled run abandons the dialog and reports 'abandoned', not a hang or a throw", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");
  const controller = new AbortController();

  const pending = call(deleteTool, { emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();

  const result = (await pending) as { deleted: boolean; cancelled: boolean; reason: string };
  assert.equal(result.deleted, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "abandoned");
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

// ---------------------------------------------------------------------------
// 4. Staleness — the property the removed token used to carry
// ---------------------------------------------------------------------------

test("a delete confirmed against a stale version is refused — the row changed after the human was asked", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildRegistrations(deps, surfaceExchanges);
  const deleteTool = tool(registrations, "content_post_delete");

  const { exchangeId, pending } = await raiseDialog(deleteTool);

  // Someone edits the post between the dialog rendering and the human clicking.
  await tool(registrations, "content_post_update").handler({
    executionId: "e", principal: { id: PRINCIPAL_ID }, run: { id: "r" }, signal: new AbortController().signal,
    input: { id: "p1", kind: "post", title: "Rewritten", slug: "my-article", bodyJson: EMPTY_DOC, status: "draft" },
  });

  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  await assert.rejects(() => pending, /stale-entity-version/);

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt ?? null, null);
  assert.equal(row?.title, "Rewritten", "the intervening edit must not be reverted by the refused delete");
});

// ---------------------------------------------------------------------------
// 5. No emit seam: fail closed rather than degrade to an unguarded second call
// ---------------------------------------------------------------------------

test("with no emitSurface, the delete is refused outright — there is no token left to guard a fallback second call", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  await assert.rejects(() => call(deleteTool), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

// ---------------------------------------------------------------------------
// 6. Authorization and the kind guard — both checked before any dialog is raised
// ---------------------------------------------------------------------------

test("step requires content.read, and a denied principal never even sees a dialog", async () => {
  const { deps, postRepo, authorizeCalls } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");
  authorizeCalls.length = 0;

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  assert.equal(authorizeCalls[0]?.permission, "content.read");
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;

  const denied = fakeRouteDeps({ allow: false });
  await seedPost(denied.postRepo);
  const deniedSurfaces = createSurfaceExchangeStore();
  const deniedTool = tool(buildRegistrations(denied.deps, deniedSurfaces), "content_post_delete");
  await assert.rejects(() => call(deniedTool), /is not authorized for 'content\.read'/);
  assert.equal(deniedSurfaces.size(), 0, "a denied principal must never get a dialog opened for them");
});

test("kind:'page' refuses a row whose actual kind is 'post', before any dialog is raised", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo, { kind: "post" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  await assert.rejects(() => call(deleteTool, { input: { id: "p1", kind: "page" } }), /page 'p1' was not found/);
  assert.equal(surfaceExchanges.size(), 0, "a refused target must never raise a dialog");
});

test("a trashed row cannot be deleted again — the second attempt does not even raise a dialog", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  await pending;

  await assert.rejects(() => call(deleteTool), /post 'p1' was not found/);
  assert.equal(surfaceExchanges.size(), 0, "a refused, already-trashed target must never raise a second dialog");
});

test("the confirmed delete goes through executeCommand's content.write gate, and records the human-approved summary", async () => {
  const { deps, postRepo, authorizeCalls, changeSets } = fakeRouteDeps();
  await seedPost(postRepo, { title: "Quarterly Report" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  await pending;

  const writeCall = authorizeCalls.find((c) => c.permission === "content.write");
  assert.ok(writeCall, "the confirmed delete must consult content.write");
  assert.equal(writeCall.principalId, PRINCIPAL_ID);

  const [changeSet] = await changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.ok(changeSet, "the confirmed delete must record a revertible change set");
  assert.match(changeSet.summary, /human-confirmed.*Quarterly Report/);
});

test("a permission revoked between the dialog opening and the click still refuses the delete", async () => {
  const { deps, postRepo, setAllow } = fakeRouteDeps();
  await seedPost(postRepo);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), "content_post_delete");

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  setAllow(false);
  surfaceExchanges.deliver({ exchangeId, toolId: "content_post_delete", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  await assert.rejects(() => pending, /is not authorized/);
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});
