import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { MCP_UI_MIME_TYPE, type UIResource } from "../../../assistant/mcp-ui";
import { createPendingConfirmationStore, type PendingConfirmationStore } from "../../../assistant/pending-confirmations";
import { InMemoryChangeSetRepo } from "../../../core/commands";
import { InMemoryEventBus, InMemoryOutbox } from "../../../core/events";
import type { RouteDeps } from "../../../server/routes/types";
import { InMemoryPostRepo } from "../repo.memory";
import { buildPostRegistrations } from "../tool-registrations";
import { handleUIAction, renderUIResource } from "./fake-mcp-ui-host";

/**
 * @file Certification of `content_post_delete`'s MCP-UI confirmation gate — the two-step protocol
 * itself, not just the delete underneath it.
 *
 * The client side is faked (`fake-mcp-ui-host.ts`) because no live MCP host runs in this sandbox,
 * but the fake EXECUTES the dialog's real inline script against a sandboxed DOM and routes the real
 * `postMessage` it emits back into the real handler. So these tests fail if the returned resource
 * stops being valid MCP-UI, if the dialog stops posting a well-formed `UIActionResult`, or if the
 * token stops travelling only through the rendered UI.
 *
 * The load-bearing assertion is `the confirmation token never appears anywhere the model can read`.
 * Everything else is a supporting property.
 */

const WORKSPACE_ID = "ws-delete-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-30T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function fakeRouteDeps(options: { allow?: boolean; confirmations?: PendingConfirmationStore } = {}) {
  const allow = options.allow ?? true;
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
  } as unknown as RouteDeps;

  const confirmations = options.confirmations ?? createPendingConfirmationStore();
  const registrations = new Map<string, ToolRegistration>(
    buildPostRegistrations(deps, { confirmations }).map((r) => [r.descriptor.id, r])
  );

  const deleteTool = registrations.get("content_post_delete");
  assert.ok(deleteTool, "content_post_delete must be wired");

  return { deps, postRepo, changeSets, outbox, bus, authorizeCalls, confirmations, registrations, deleteTool };
}

/** Checked registry lookup — `registrations.get(id)!` would trip the repo's noNonNullAssertion rule. */
function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function ctx(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
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

/** Narrows a step-1 result to its two halves: what the model reads, and what the human sees. */
function splitResult(result: unknown): { modelText: string; ui: UIResource } {
  const shaped = result as { content?: Array<{ type: string; text?: string; resource?: unknown }> };
  assert.ok(Array.isArray(shaped.content), "an MCP-UI tool result must carry a content array");
  assert.equal(shaped.content.length, 2, "expected [textBlock, uiResource]");
  assert.equal(shaped.content[0].type, "text");
  assert.equal(shaped.content[1].type, "resource");
  return { modelText: String(shaped.content[0].text), ui: shaped.content[1] as unknown as UIResource };
}

// ---------------------------------------------------------------------------
// 1. Step 1 returns a genuine MCP-UI resource and deletes NOTHING
// ---------------------------------------------------------------------------

test("step 1 returns an MCP-UI resource with a ui:// URI and the MCP Apps mime type — not a text answer", async () => {
  const { postRepo, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo);

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));

  assert.equal(ui.type, "resource");
  assert.match(ui.resource.uri, /^ui:\/\/tovu\/content-post-delete\/p1\/1$/);
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(ui.resource.mimeType, "text/html;profile=mcp-app", "the spec's literal, not a paraphrase");
  assert.ok(ui.resource.text.includes("<html"), "the resource must carry renderable HTML");
  assert.deepEqual(ui.resource._meta, { "mcpui.dev/ui-preferred-frame-size": ["420px", "440px"] });
});

test("step 1 writes NOTHING — calling the tool is not deleting", async () => {
  const { postRepo, changeSets, outbox, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo);

  await deleteTool.handler(ctx({ id: "p1", kind: "post" }));

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt ?? null, null, "the row must still be live after step 1");
  assert.equal(row?.version, 1, "step 1 must not advance the version");
  assert.equal((await changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID })).length, 0, "step 1 must record no change set");
  assert.equal((await outbox.claimPending({ limit: 10, now: NOW })).length, 0, "step 1 must emit no event");
});

test("the dialog names exactly what is about to be deleted, so the consent is informed", async () => {
  const { postRepo, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo, { title: "Quarterly Report", slug: "quarterly-report", status: "published" });

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));

  assert.match(ui.resource.text, /Quarterly Report/);
  assert.match(ui.resource.text, /quarterly-report/);
  assert.match(ui.resource.text, /published/);
  assert.match(ui.resource.text, /soft delete/i, "the human must be told it is recoverable");
});

test("the dialog HTML-escapes the row's own fields — a title cannot inject markup into the dialog", async () => {
  const { postRepo, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo, { title: `<img src=x onerror="alert(1)">` });

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));

  assert.equal(ui.resource.text.includes("<img src=x"), false, "the raw tag must not survive into the dialog");
  assert.match(ui.resource.text, /&lt;img src=x/);
});

// ---------------------------------------------------------------------------
// 2. THE security property: the token reaches the human, never the model
// ---------------------------------------------------------------------------

test("the confirmation token appears ONLY in the rendered UI, never in anything the model can read", async () => {
  let minted = "";
  const confirmations = createPendingConfirmationStore({
    randomToken: () => {
      minted = "SECRET-TOKEN-VALUE-0123456789";
      return minted;
    },
  });
  const { postRepo, deleteTool } = fakeRouteDeps({ confirmations });
  await seedPost(postRepo);

  const raw = await deleteTool.handler(ctx({ id: "p1", kind: "post" }));
  const { modelText, ui } = splitResult(raw);

  assert.ok(minted, "sanity: a token was minted");
  assert.ok(ui.resource.text.includes(minted), "the rendered dialog must carry the token — it is the only copy");

  // The whole gate rests on this: the model-visible half must not contain the secret, anywhere.
  assert.equal(modelText.includes(minted), false, "the model-readable text block leaked the token");
  assert.equal(ui.resource.uri.includes(minted), false, "the ui:// URI leaked the token (hosts may log URIs)");
  assert.equal(JSON.stringify(ui.resource._meta ?? {}).includes(minted), false, "_meta leaked the token");
  assert.equal(
    JSON.stringify({ ...(raw as Record<string, unknown>), content: (raw as { content: unknown[] }).content.slice(0, 1) }).includes(minted),
    false,
    "the token must not survive stripping the UI resource — that is exactly what the model is left with",
  );
});

test("the model-facing text tells the agent it cannot proceed on its own", async () => {
  const { postRepo, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo);

  const { modelText } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));

  assert.match(modelText, /NOTHING HAS BEEN DELETED/);
  assert.match(modelText, /cannot complete this yourself/i);
});

test("an agent that fabricates a confirmationToken is refused and nothing is deleted", async () => {
  const { postRepo, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo);

  await assert.rejects(
    () => deleteTool.handler(ctx({ id: "p1", kind: "post", confirmationToken: "i-made-this-up", decision: "confirm" })),
    /confirmation could not be redeemed \(unknown-or-expired\)/,
  );

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt ?? null, null);
});

test("a token minted for one post cannot be replayed against another", async () => {
  const { postRepo, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo, { id: "p1", slug: "one" });
  await seedPost(postRepo, { id: "p2", slug: "two" });

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const dialog = renderUIResource(ui);
  const action = dialog.click("confirm");
  assert.equal(action.type, "tool");
  const token = action.type === "tool" ? action.payload.params.confirmationToken : undefined;

  await assert.rejects(
    () => deleteTool.handler(ctx({ id: "p2", kind: "post", confirmationToken: token, decision: "confirm" })),
    /binding-mismatch/,
  );

  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p2" }))?.deletedAt ?? null, null);
});

// ---------------------------------------------------------------------------
// 3. The full round trip through the faked host — this is the protocol working end to end
// ---------------------------------------------------------------------------

test("full round trip: dialog renders, human clicks Delete, the host's follow-up call performs the soft delete", async () => {
  const { postRepo, deleteTool, registrations } = fakeRouteDeps();
  await seedPost(postRepo, { status: "published" });

  // Step 1 — the agent's call.
  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));

  // The host renders it and a human clicks.
  const dialog = renderUIResource(ui);
  const action = dialog.click("confirm");

  // The action is a real mcp-ui UIActionResult of type "tool".
  assert.equal(action.type, "tool");
  assert.ok(action.messageId, "the action must carry a messageId so the host can answer the iframe");
  if (action.type !== "tool") throw new Error("unreachable");
  assert.equal(action.payload.toolName, "content_post_delete");
  assert.equal(action.payload.params.id, "p1");
  assert.equal(action.payload.params.kind, "post");
  assert.equal(action.payload.params.decision, "confirm");
  assert.equal(typeof action.payload.params.confirmationToken, "string");

  // Step 2 — the host routes it back as an ordinary tool call.
  const routed = await handleUIAction(action, dialog, (toolId, input) => {
    const registration = registrations.get(toolId);
    assert.ok(registration, `host tried to call unknown tool '${toolId}'`);
    return registration.handler(ctx(input)) as Promise<unknown>;
  });

  assert.equal(routed.error, undefined, `the confirmed delete failed: ${routed.error}`);
  assert.deepEqual((routed.result as { deleted: boolean; cancelled: boolean }).deleted, true);

  // The row is trashed but retained.
  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.ok(row, "a soft delete keeps the row");
  assert.equal(row.deletedAt, NOW);
  assert.equal(row.version, 2);
  assert.equal(row.title, "My Article", "no data was lost");

  // And it is gone from every read the agent has.
  const listed = (await tool(registrations, "content_post_list").handler(ctx({ kind: "post" }))) as { posts: unknown[] };
  assert.deepEqual(listed.posts, []);
  await assert.rejects(() => tool(registrations, "content_post_get").handler(ctx({ id: "p1", kind: "post" })), /was not found/);

  // The dialog reported the outcome to the human via ui-message-received / ui-message-response.
  assert.equal(dialog.textOf("outcome"), "Done.");
});

test("full round trip: clicking Cancel deletes nothing and burns the token", async () => {
  const { postRepo, deleteTool, registrations, confirmations } = fakeRouteDeps();
  await seedPost(postRepo);

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  assert.equal(confirmations.size(), 1);

  const dialog = renderUIResource(ui);
  const action = dialog.click("cancel");
  if (action.type !== "tool") throw new Error("unreachable");
  assert.equal(action.payload.params.decision, "cancel");

  const routed = await handleUIAction(action, dialog, (toolId, input) =>
    tool(registrations, toolId).handler(ctx(input)) as Promise<unknown>
  );

  assert.deepEqual(routed.result as Record<string, unknown>, {
    deleted: false,
    cancelled: true,
    post: { id: "p1", kind: "post", title: "My Article", slug: "my-article", bodyJson: EMPTY_DOC, status: "published", updatedAt: NOW, version: 1 },
  });

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt ?? null, null, "cancel must not delete");
  assert.equal(confirmations.size(), 0, "cancel must burn the token, not leave it live");
});

test("the confirmed delete cannot be replayed — the second run of the same action is refused and changes nothing", async () => {
  const { postRepo, deleteTool, registrations } = fakeRouteDeps();
  await seedPost(postRepo);

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const dialog = renderUIResource(ui);
  const action = dialog.click("confirm");

  const call: Parameters<typeof handleUIAction>[2] = (toolId, input) =>
    tool(registrations, toolId).handler(ctx(input)) as Promise<unknown>;

  const first = await handleUIAction(action, dialog, call);
  assert.equal(first.error, undefined);
  const afterFirst = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(afterFirst?.version, 2);

  const second = await handleUIAction(action, dialog, call);
  // Two INDEPENDENT guards refuse this replay, and the outer one wins: `post.ts` treats an
  // already-trashed row as not-found, so the handler rejects before it ever reaches the token
  // store. (The store would refuse too — the token was burned on the first call — which the
  // cancel-then-confirm test below exercises against a row that is still live.) Asserting the
  // not-found message here pins the ORDER: target validity is checked before the token.
  assert.match(String(second.error), /post 'p1' was not found/);
  assert.equal(dialog.textOf("outcome"), `Failed: ${second.error}`, "the human is told the replay failed");

  const afterSecond = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(afterSecond?.version, 2, "the refused replay must not advance the version");
  assert.equal(afterSecond?.deletedAt, NOW);
});

test("a token burned by Cancel cannot then be used to Confirm — the store refuses it while the row is still live", async () => {
  const { postRepo, deleteTool } = fakeRouteDeps();
  await seedPost(postRepo);

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const action = renderUIResource(ui).click("cancel");
  if (action.type !== "tool") throw new Error("unreachable");

  // Cancel first — the row stays live, so the trashed-row guard cannot mask the store's refusal.
  await deleteTool.handler(ctx(action.payload.params));
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);

  await assert.rejects(
    () => deleteTool.handler(ctx({ ...action.payload.params, decision: "confirm" })),
    /could not be redeemed \(unknown-or-expired\)/,
  );
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

test("a delete confirmed against a stale version is refused — the row changed after the human was asked", async () => {
  const { postRepo, deleteTool, registrations } = fakeRouteDeps();
  await seedPost(postRepo);

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const dialog = renderUIResource(ui);
  const action = dialog.click("confirm");

  // Someone edits the post between the dialog rendering and the human clicking.
  await tool(registrations, "content_post_update")
    .handler(ctx({ id: "p1", kind: "post", title: "Rewritten", slug: "my-article", bodyJson: EMPTY_DOC, status: "draft" }));

  const routed = await handleUIAction(action, dialog, (toolId, input) =>
    tool(registrations, toolId).handler(ctx(input)) as Promise<unknown>
  );

  assert.match(String(routed.error), /stale-entity-version/);
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

// ---------------------------------------------------------------------------
// 4. Authorization, kind guard, and the lifecycle event
// ---------------------------------------------------------------------------

test("step 1 requires content.read, and a denied principal never even sees a dialog", async () => {
  const { postRepo, deleteTool, authorizeCalls } = fakeRouteDeps();
  await seedPost(postRepo);
  authorizeCalls.length = 0;

  await deleteTool.handler(ctx({ id: "p1", kind: "post" }));
  assert.equal(authorizeCalls[0].permission, "content.read");

  const denied = fakeRouteDeps({ allow: false });
  await seedPost(denied.postRepo);
  await assert.rejects(
    () => denied.deleteTool.handler(ctx({ id: "p1", kind: "post" })),
    /is not authorized for 'content\.read'/,
  );
  assert.equal(denied.confirmations.size(), 0, "a denied principal must not have a token minted for them");
});

test("the confirmed delete goes through executeCommand's content.write gate, and records the human-approved summary", async () => {
  const { postRepo, deleteTool, authorizeCalls, changeSets } = fakeRouteDeps();
  await seedPost(postRepo, { title: "Quarterly Report" });

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const action = renderUIResource(ui).click("confirm");
  if (action.type !== "tool") throw new Error("unreachable");
  await deleteTool.handler(ctx(action.payload.params));

  const writeCall = authorizeCalls.find((c) => c.permission === "content.write");
  assert.ok(writeCall, "the confirmed delete must consult content.write");
  assert.equal(writeCall.principalId, PRINCIPAL_ID);

  const [changeSet] = await changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.ok(changeSet, "the confirmed delete must record a revertible change set");
  assert.match(
    changeSet.summary,
    /human-confirmed.*Quarterly Report/,
    "the audit trail must record what the human actually agreed to, not what the agent asked for",
  );
});

test("a denied principal cannot complete the delete even holding a valid token", async () => {
  const confirmations = createPendingConfirmationStore();
  const allowed = fakeRouteDeps({ confirmations });
  await seedPost(allowed.postRepo);
  const { ui } = splitResult(await allowed.deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const action = renderUIResource(ui).click("confirm");
  if (action.type !== "tool") throw new Error("unreachable");

  // Same store, same seeded row, but authorize() now denies.
  const denied = fakeRouteDeps({ allow: false, confirmations });
  await seedPost(denied.postRepo);

  await assert.rejects(
    () => denied.deleteTool.handler(ctx(action.payload.params)),
    /is not authorized/,
  );
  assert.equal((await denied.postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" }))?.deletedAt ?? null, null);
});

test("kind:'page' refuses a row whose actual kind is 'post', before any dialog is raised", async () => {
  const { postRepo, deleteTool, confirmations } = fakeRouteDeps();
  await seedPost(postRepo, { kind: "post" });

  await assert.rejects(() => deleteTool.handler(ctx({ id: "p1", kind: "page" })), /page 'p1' was not found/);
  assert.equal(confirmations.size(), 0, "a refused target must not mint a token");
});

test("deleting a published row drains entry.unpublished to the bus (SEO's sitemap-cache signal)", async () => {
  const { postRepo, deleteTool, registrations, bus } = fakeRouteDeps();
  await seedPost(postRepo, { status: "published" });

  const seen: string[] = [];
  await bus.subscribe("entry.unpublished", (event: { name?: string }) => {
    seen.push(event.name ?? "entry.unpublished");
  });

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const action = renderUIResource(ui).click("confirm");
  if (action.type !== "tool") throw new Error("unreachable");
  await tool(registrations, "content_post_delete").handler(ctx(action.payload.params));

  assert.equal(seen.length, 1, "the confirmed delete of a published row must reach the bus");
});

test("a trashed row cannot be deleted again — the second attempt does not even raise a dialog", async () => {
  const { postRepo, deleteTool, registrations, confirmations } = fakeRouteDeps();
  await seedPost(postRepo);

  const { ui } = splitResult(await deleteTool.handler(ctx({ id: "p1", kind: "post" })));
  const action = renderUIResource(ui).click("confirm");
  if (action.type !== "tool") throw new Error("unreachable");
  await tool(registrations, "content_post_delete").handler(ctx(action.payload.params));

  assert.equal(confirmations.size(), 0);
  await assert.rejects(() => deleteTool.handler(ctx({ id: "p1", kind: "post" })), /post 'p1' was not found/);
  assert.equal(confirmations.size(), 0, "a already-trashed target must not mint a token");
});
