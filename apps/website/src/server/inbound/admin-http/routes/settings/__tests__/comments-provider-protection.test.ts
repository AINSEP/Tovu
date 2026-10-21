import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { DefinitionNotFoundError, ensureSettingDefinitions, ForbiddenError, InMemorySettingsRepo, type SettingDefinitionRecord } from "@jini-ai/core/settings";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/core/primitives";
import { createCommentsSelectionStore, ensureCommentsProviderDefinition } from "#src/features/comments/provider-selection";
import type { SetCommentsSettingsDeps } from "#src/features/comments/settings";
import { contributeSettingsTools, type SettingsToolDeps } from "#src/features/settings/tool-registrations";
import { clear, refuseCommentsProviderClear, refuseCommentsProviderReset, set } from "#src/features/settings/index";
import { registerAdminSettingsClearRoute } from "../clear.js";
import { registerAdminSettingsResetRoute } from "../reset.js";
import type { SettingsRouteDeps } from "../deps.js";
import { createTovuSettingsService } from "../shared.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file `core.comments/provider` hides or shows every stored comment, so only the comments selection
 * store (confirmation card, revision CAS, `comments.configure`) may change it. The `set` chokepoint
 * already refused generic writes; these pin the other generic paths a principal holding only the
 * workspace-settings permissions could use to reactivate comments an owner switched off: the HTTP
 * clear and namespace reset, an alias of the key, the host `clear` export, and the agent clear tool.
 */

const WS = "ws-comments-provider";
const base = "/api/admin/v1/workspaces/:workspaceId/settings";

async function fixture() {
  let id = 0;
  const granted = new Set(["settings.workspace.write", "settings.global.write", "settings.reset.workspace", "settings.reset.global", "comments.configure"]);
  const settingsRepo = new InMemorySettingsRepo();
  const authorize = async ({ permission }: { permission: string }) => ({ allowed: granted.has(permission), reason: granted.has(permission) ? "matched" : "insufficient_permission" });
  const comments: SetCommentsSettingsDeps = { settingsRepo, clock: { nowIso: () => "2026-10-21T00:00:00.000Z" }, ids: { newId: () => { id += 1; return `cp-${id}`; } }, authorize,
    principals: { findById: async ({ workspaceId, id: principalId }: { workspaceId: string; id: string }) => ({ workspaceId, id: principalId, status: "active" }) } as unknown as SetCommentsSettingsDeps["principals"] };
  await ensureCommentsProviderDefinition({ deps: comments, systemPrincipalId: "system" });
  const store = createCommentsSelectionStore(comments);
  // The owner switches public comments off through the card-backed store.
  await store.compareAndSet({ siteId: WS, providerId: null, expectedRevision: 0, actorPrincipalId: "owner" });
  assert.equal((await store.read({ siteId: WS })).providerId, null);
  // From here on the caller holds the generic settings permissions only.
  granted.delete("comments.configure");
  const deps = { workspaceId: WS, authorize, settingsReady: Promise.resolve(), settingsRepo, clock: comments.clock, idGen: comments.ids,
    principalRepo: comments.principals } as unknown as SettingsRouteDeps;
  const app = express();
  registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsResetRoute(app, deps);
  return { settingsRepo, store, comments, deps,
    async request(method: "delete" | "post", path: string, body: unknown) {
      const { res, capture } = createCapturingResponse();
      res.locals.principal = { id: "settings-admin" };
      await extractRouteHandler(app, method, base + path)({ params: { workspaceId: WS }, body, query: {} }, res);
      return capture;
    },
  };
}

async function assertStillDisabled(f: Awaited<ReturnType<typeof fixture>>, before: number): Promise<void> {
  assert.equal((await f.store.read({ siteId: WS })).providerId, null, "comments stay switched off");
  assert.equal(await f.settingsRepo.maxRevisionSeq(), before, "nothing reaches the ledger");
}

test("a settings-only principal cannot reactivate comments by clearing the provider over HTTP", async () => {
  const f = await fixture();
  const before = await f.settingsRepo.maxRevisionSeq();
  const response = await f.request("delete", "/value", { namespace: "core.comments", key: "provider", scope: "workspace" });
  assert.equal(response.statusCode, 403);
  assert.match(String((response.jsonBody as { error: string }).error), /comments_set_provider/);
  await assertStillDisabled(f, before);
});

/** A workspace-partition alias of the provider key, as a definition manager's rename would leave behind. */
async function addWorkspaceAlias(f: Awaited<ReturnType<typeof fixture>>): Promise<void> {
  const canonical = (await f.settingsRepo.listActiveDefinitions({ workspaceId: null })).find((d) => d.namespace === "core.comments" && d.key === "provider")!;
  const alias: SettingDefinitionRecord = { ...canonical, settingId: "alias-1", workspaceId: WS, namespace: "site.legacy", key: "commentsProvider", status: "alias",
    aliasOfNamespace: "core.comments", aliasOfKey: "provider" };
  await f.settingsRepo.saveDefinition(alias);
}

test("an alias of the provider key is refused for clear, and for a reset of the alias's namespace", async () => {
  const f = await fixture();
  await addWorkspaceAlias(f);
  const before = await f.settingsRepo.maxRevisionSeq();
  assert.equal((await f.request("delete", "/value", { namespace: "site.legacy", key: "commentsProvider", scope: "workspace" })).statusCode, 403);
  // A reset lists alias rows among the namespace's keys and clears through them, reaching the provider.
  const reset = await f.request("post", "/reset", { namespace: "site.legacy", scope: "workspace" });
  assert.equal(reset.statusCode, 403);
  assert.match(String((reset.jsonBody as { error: string }).error), /comments_set_provider/);
  await assertStillDisabled(f, before);
});

test("a reset whose keys include the canonical provider is refused; one that clears no provider key is unchanged", async () => {
  const f = await fixture();
  const before = await f.settingsRepo.maxRevisionSeq();
  // The platform-partition provider is a global-scope reset's key.
  const global = await f.request("post", "/reset", { namespace: "core.comments", scope: "global" });
  assert.equal(global.statusCode, 403);
  assert.match(String((global.jsonBody as { error: string }).error), /comments_set_provider/);
  // A workspace-scope reset lists only this workspace's partition, which holds no provider key.
  const workspace = await f.request("post", "/reset", { namespace: "core.comments", scope: "workspace" });
  assert.equal(workspace.statusCode, 200);
  assert.deepEqual(workspace.jsonBody, { namespace: "core.comments", clearedCount: 0, revisionSeqs: [] });
  await assertStillDisabled(f, before);
});

test("other settings in other namespaces still clear and reset normally", async () => {
  const f = await fixture();
  const response = await f.request("post", "/reset", { namespace: "core.unrelated", scope: "workspace" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.jsonBody, { namespace: "core.unrelated", clearedCount: 0, revisionSeqs: [] });
  assert.equal((await f.request("delete", "/value", { namespace: "core.unrelated", key: "missing", scope: "workspace" })).statusCode, 404);
});

test("the host clear export refuses the provider for any caller", async () => {
  const f = await fixture();
  const before = await f.settingsRepo.maxRevisionSeq();
  await assert.rejects(clear({ deps: { repo: f.settingsRepo, clock: { nowMs: () => 0 }, ids: f.comments.ids, authorize: async () => ({ allowed: true, reason: "all" }),
    principals: { findActiveById: async ({ id }) => ({ id }) } },
  input: { namespace: "core.comments", key: "provider", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner" } }), /comments_set_provider/);
  await assertStillDisabled(f, before);
});

test("the agent's settings_clear_value cannot reactivate comments, even with full settings permissions", async () => {
  const f = await fixture();
  const before = await f.settingsRepo.maxRevisionSeq();
  const toolDeps = { ...f.deps, settingsUiTabsReady: Promise.resolve(), clock: { nowMs: () => 0 } } as unknown as SettingsToolDeps;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "exchange-1" }, defaultChannel: "mcp-ui" });
  const registration = contributeSettingsTools().build(toolDeps as never, { surfaceExchanges }).find((r) => r.descriptor.id === "settings_clear_value")!;
  await assert.rejects(registration.handler({ executionId: "e", principal: { id: "settings-admin" }, run: { id: "r" }, signal: new AbortController().signal,
    input: { namespace: "core.comments", key: "provider" } }, {}), /comments_set_provider/);
  assert.equal(surfaceExchanges.size(), 0, "no card is opened for a refused key");
  await assertStillDisabled(f, before);
});

test("the host clear export still clears every other setting through the package", async () => {
  const f = await fixture();
  const writeDeps = { repo: f.settingsRepo, clock: { nowMs: () => 0 }, ids: f.comments.ids, authorize: async () => ({ allowed: true, reason: "all" }),
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } };
  await ensureSettingDefinitions({ ...writeDeps, settingsRepo: f.settingsRepo }, { namespace: "core.unrelated", systemPrincipalId: "system", definitions: [{ key: "note", schema: { type: "string" }, defaultValue: "" }] });
  const input = { namespace: "core.unrelated", key: "note", scope: "workspace" as const, workspaceId: WS, callerPrincipalId: "owner" };
  await set({ deps: writeDeps, input: { ...input, value: "kept" } });
  const { revisionSeq } = await clear({ deps: writeDeps, input });
  assert.equal(revisionSeq, await f.settingsRepo.maxRevisionSeq());
});

test("the reset guard falls back to the authorized workspace, and a workspace-less clear check reads the platform partition", async () => {
  const f = await fixture();
  await addWorkspaceAlias(f);
  await assert.rejects(refuseCommentsProviderReset({ repo: f.settingsRepo, input: { namespace: "site.legacy", scope: "workspace", authWorkspaceId: WS } }), ForbiddenError);
  // Neither id: the null partition, which holds no site.legacy keys.
  await refuseCommentsProviderReset({ repo: f.settingsRepo, input: { namespace: "site.legacy", scope: "workspace" } }, {});
  await assert.rejects(refuseCommentsProviderClear({ repo: f.settingsRepo, input: { namespace: "core.comments", key: "provider", scope: "workspace" } }, {}), ForbiddenError);
});

test("the host service's set delegates to an injected composed writer, which keeps its own provider refusal", async () => {
  const f = await fixture();
  const calls: string[] = [];
  const service = createTovuSettingsService({ deps: { ...f.deps, set: async (required) => { calls.push(`${required.input.namespace}.${required.input.key}`); return set(required); } } });
  await assert.rejects(service.set({ namespace: "core.comments", key: "provider", scope: "workspace", workspaceId: WS, value: "built-in", callerPrincipalId: "settings-admin" }), /comments_set_provider/);
  assert.deepEqual(calls, ["core.comments.provider"]);
  assert.equal((await f.store.read({ siteId: WS })).providerId, null);
});

test("an enable-shaped true value for a setting that does not exist is refused as not found, never as assistant readiness", async () => {
  const f = await fixture();
  await assert.rejects(set({ deps: { repo: f.settingsRepo, clock: { nowMs: () => 0 }, ids: f.comments.ids, authorize: async () => ({ allowed: true, reason: "all" }),
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } },
  input: { namespace: "site.assistant", key: "missing", scope: "workspace", workspaceId: WS, value: true, callerPrincipalId: "owner" } }), DefinitionNotFoundError);
});

test("the chokepoint resolves a global write, or a workspace write naming no workspace, in the platform partition, so the provider is still refused", async () => {
  const f = await fixture();
  await assert.rejects(set({ deps: { repo: f.settingsRepo, clock: { nowMs: () => 0 }, ids: f.comments.ids, authorize: async () => ({ allowed: true, reason: "all" }),
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } },
  input: { namespace: "core.comments", key: "provider", scope: "workspace", value: "built-in", callerPrincipalId: "owner" } }), /comments_set_provider/);
  await assert.rejects(set({ deps: { repo: f.settingsRepo, clock: { nowMs: () => 0 }, ids: f.comments.ids, authorize: async () => ({ allowed: true, reason: "all" }),
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } },
  input: { namespace: "core.comments", key: "provider", scope: "global", workspaceId: WS, value: "built-in", callerPrincipalId: "owner" } }), /comments_set_provider/);
  assert.equal((await f.store.read({ siteId: WS })).providerId, null);
});
