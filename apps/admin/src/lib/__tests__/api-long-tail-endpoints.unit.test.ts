import { afterEach, expect, test, vi } from "vitest";

import { ApiError, api } from "../api";

/**
 * @file Long-tail `api.ts` endpoint coverage (2026-09-05) — every endpoint method NOT already
 * exercised by a hook/screen test AND NOT already covered by
 * `api-endpoint-option-branches.unit.test.ts`'s optional-parameter-branch sweep. Scope: taxonomy,
 * recovery, database (restore-points/migrate-forward), content-types, entries, pages, roles,
 * integrations subscriptions, external-mcp admissions, settings reset, plugin enable/disable,
 * deployments, workspace delete, and `me`.
 *
 * Same convention as `api-endpoint-option-branches.unit.test.ts`: assert the ACTUAL `fetch` call's
 * URL/method/body (or the resolved/thrown outcome), never a trivially-true assertion.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Captures every `fetch` call's URL and `RequestInit` so tests can assert on the exact request
 *  shape a call produces, rather than only on the resolved value. */
function stubFetchCapturing(): { calls: Array<{ url: string; init?: RequestInit }>; body(n?: number): unknown } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({});
    })
  );
  return {
    calls,
    body(n = 0) {
      const raw = calls[n]?.init?.body;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    },
  };
}

// --- Auth -----------------------------------------------------------------

test("me hits GET /auth/me with no body", async () => {
  const { calls } = stubFetchCapturing();
  await api.me();
  expect(calls[0].url).toBe(`/api/admin/v1/auth/me`);
  expect(calls[0].init?.method).toBeUndefined();
});

// --- Pages -----------------------------------------------------------------

test("getPage builds a bare GET on /pages/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.getPage("pg1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/pages/pg1`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("updatePageHtml PUTs the html body to /pages/:id/html", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.updatePageHtml("pg1", "<p>hi</p>");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/pages/pg1/html`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ html: "<p>hi</p>" });
});

test("deletePage DELETEs /pages/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deletePage("pg1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/pages/pg1`);
  expect(calls[0].init?.method).toBe("DELETE");
});

// --- Roles -----------------------------------------------------------------

test("listRoles hits GET /roles", async () => {
  const { calls } = stubFetchCapturing();
  await api.listRoles();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/roles`);
});

test("createRole POSTs { name } to /roles", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createRole("Editor");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/roles`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ name: "Editor" });
});

test("deleteRole DELETEs /roles/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteRole("r1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/roles/r1`);
  expect(calls[0].init?.method).toBe("DELETE");
});

// --- Settings -----------------------------------------------------------------

test("resetSettingsNamespace POSTs { namespace, scope } to /settings/reset", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.resetSettingsNamespace({ namespace: "core", scope: "workspace" });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/settings/reset`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ namespace: "core", scope: "workspace" });
});

// --- Workspace -----------------------------------------------------------------

test("deleteWorkspace DELETEs the bare /workspaces/:id path (no sub-resource)", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteWorkspace();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local`);
  expect(calls[0].init?.method).toBe("DELETE");
});

// --- Plugins -----------------------------------------------------------------

test("setPluginEnabled PATCHes { enabled } to /plugins/:id", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.setPluginEnabled("p1", { enabled: false });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/plugins/p1`);
  expect(calls[0].init?.method).toBe("PATCH");
  expect(body()).toEqual({ enabled: false });
});

// --- Deployments -----------------------------------------------------------------

test("getDeployments hits GET /deployments", async () => {
  const { calls } = stubFetchCapturing();
  await api.getDeployments();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/deployments`);
});

// --- External MCP admissions -----------------------------------------------------------------

test("getExternalMcpAdmissions hits GET /mcp-servers/admissions", async () => {
  const { calls } = stubFetchCapturing();
  await api.getExternalMcpAdmissions();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/mcp-servers/admissions`);
});

test("getExternalMcpAdmissions surfaces a 503 (daemon unreachable) as an ApiError rather than an empty snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "daemon unreachable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
    )
  );
  const error = await api.getExternalMcpAdmissions().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(503);
});

// --- Integration subscriptions -----------------------------------------------------------------

test("listIntegrationSubscriptions hits GET /integrations/subscriptions", async () => {
  const { calls } = stubFetchCapturing();
  await api.listIntegrationSubscriptions();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`);
});

test("createIntegrationSubscription POSTs the input verbatim to /integrations/subscriptions", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createIntegrationSubscription({ label: "Slack", targetUrl: "https://x.example/hook", topics: ["post.published"] });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ label: "Slack", targetUrl: "https://x.example/hook", topics: ["post.published"] });
});

test("deleteIntegrationSubscription DELETEs /integrations/subscriptions/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteIntegrationSubscription("s1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/s1`);
  expect(calls[0].init?.method).toBe("DELETE");
});

test("listIntegrationDeliveries hits GET /integrations/subscriptions/:id/deliveries", async () => {
  const { calls } = stubFetchCapturing();
  await api.listIntegrationDeliveries("s1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/s1/deliveries`);
});

// --- Content types -----------------------------------------------------------------

test("listContentTypes hits GET /content-types — not workspace-scoped", async () => {
  const { calls } = stubFetchCapturing();
  await api.listContentTypes();
  expect(calls[0].url).toBe(`/api/admin/v1/content-types`);
});

test("createContentType POSTs the input verbatim to /content-types", async () => {
  const { calls, body } = stubFetchCapturing();
  const fields = [{ name: "title", kind: "text" as const, required: true, queryable: false }];
  await api.createContentType({ key: "recipe", label: "Recipe", fields });
  expect(calls[0].url).toBe(`/api/admin/v1/content-types`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ key: "recipe", label: "Recipe", fields });
});

test("updateContentTypeFields PUTs { fields, expectedVersion } to /content-types/:key/fields", async () => {
  const { calls, body } = stubFetchCapturing();
  const fields = [{ name: "title", kind: "text" as const, required: true, queryable: false }];
  await api.updateContentTypeFields({ key: "recipe", fields, expectedVersion: 2 });
  expect(calls[0].url).toBe(`/api/admin/v1/content-types/recipe/fields`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ fields, expectedVersion: 2 });
});

test("contentTypeLifecycle POSTs { op, expectedVersion } to /content-types/:key/lifecycle", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.contentTypeLifecycle({ key: "recipe", op: "deprecate", expectedVersion: 3 });
  expect(calls[0].url).toBe(`/api/admin/v1/content-types/recipe/lifecycle`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ op: "deprecate", expectedVersion: 3 });
});

// --- Entries -----------------------------------------------------------------

test("listEntries appends ?type= only when a type filter is given — not workspace-scoped", async () => {
  const { calls } = stubFetchCapturing();
  await api.listEntries({ type: "recipe" });
  expect(calls[0].url).toBe(`/api/admin/v1/entries?type=recipe`);
});

test("createEntry POSTs input+options merged to /entries", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createEntry({ type: "recipe", slug: "chili", title: "Chili" }, { bodyJson: { blocks: [] } });
  expect(calls[0].url).toBe(`/api/admin/v1/entries`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ type: "recipe", slug: "chili", title: "Chili", bodyJson: { blocks: [] } });
});

test("updateEntry PUTs { expectedVersion, ...options } to /entries/:id, accepting bodyJson", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.updateEntry({ id: "e1", expectedVersion: 4 }, { title: "New title", bodyJson: { blocks: ["x"] } });
  expect(calls[0].url).toBe(`/api/admin/v1/entries/e1`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ expectedVersion: 4, title: "New title", bodyJson: { blocks: ["x"] } });
});

test("entryLifecycle POSTs { op, expectedVersion } to /entries/:id/lifecycle", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.entryLifecycle({ id: "e1", op: "publish", expectedVersion: 1 });
  expect(calls[0].url).toBe(`/api/admin/v1/entries/e1/lifecycle`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ op: "publish", expectedVersion: 1 });
});

// --- Taxonomy -----------------------------------------------------------------

test("createTaxonomy POSTs the input verbatim to /taxonomy", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createTaxonomy({ name: "Genre", hierarchical: false });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ name: "Genre", hierarchical: false });
});

test("createTerm omits parentId from the body when the caller doesn't pass one", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createTerm({ taxonomyId: "t1", name: "Sci-Fi" });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/t1/terms`);
  expect(body()).toEqual({ name: "Sci-Fi", parentId: undefined });
});

test("createTerm includes parentId when the caller passes one", async () => {
  const { body } = stubFetchCapturing();
  await api.createTerm({ taxonomyId: "t1", name: "Space Opera" }, { parentId: "p1" });
  expect(body()).toEqual({ name: "Space Opera", parentId: "p1" });
});

test("renameTerm PUTs { newName } to /taxonomy/terms/:id", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.renameTerm({ termId: "term1", newName: "Fantasy" });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/terms/term1`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ newName: "Fantasy" });
});

test("assignTerms POSTs the input verbatim to /taxonomy/assign-terms", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.assignTerms({ contentType: "recipe", contentId: "e1", termIds: ["term1", "term2"] });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/assign-terms`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ contentType: "recipe", contentId: "e1", termIds: ["term1", "term2"] });
});

test("deleteTerm DELETEs /taxonomy/terms/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteTerm("term1");
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/terms/term1`);
  expect(calls[0].init?.method).toBe("DELETE");
});

test("deleteTerm surfaces the documented TERM_HAS_ASSIGNMENTS 409 contract on ApiError (code + assignedCount)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "term still assigned", code: "TERM_HAS_ASSIGNMENTS", assignedCount: 3 }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
    )
  );
  const error = await api.deleteTerm("term1").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("TERM_HAS_ASSIGNMENTS");
  expect((error as ApiError).body?.assignedCount).toBe(3);
});

test("deleteTaxonomy DELETEs /taxonomy/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteTaxonomy("t1");
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/t1`);
  expect(calls[0].init?.method).toBe("DELETE");
});

test("planMergeTerm POSTs { intoTermId } to /taxonomy/terms/:id/merge/plan", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.planMergeTerm({ fromTermId: "term1", intoTermId: "term2" });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/terms/term1/merge/plan`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ intoTermId: "term2" });
});

test("confirmMergeTerm POSTs { planId, planHash } to /taxonomy/terms/:id/merge/confirm", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.confirmMergeTerm({ fromTermId: "term1", planId: "plan1", planHash: "hash1" });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/terms/term1/merge/confirm`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ planId: "plan1", planHash: "hash1" });
});

test("executeMergeTerm POSTs { intoTermId, confirmationToken } to /taxonomy/terms/:id/merge/execute", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.executeMergeTerm({ fromTermId: "term1", intoTermId: "term2", confirmationToken: "tok1" });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/terms/term1/merge/execute`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ intoTermId: "term2", confirmationToken: "tok1" });
});

// --- Database -----------------------------------------------------------------

test("getDatabaseSchemaState hits GET /database/schema-state", async () => {
  const { calls } = stubFetchCapturing();
  await api.getDatabaseSchemaState();
  expect(calls[0].url).toBe(`/api/admin/v1/database/schema-state`);
});

test("listDatabaseRestorePoints hits GET /database/restore-points", async () => {
  const { calls } = stubFetchCapturing();
  await api.listDatabaseRestorePoints();
  expect(calls[0].url).toBe(`/api/admin/v1/database/restore-points`);
});

test("createDatabaseRestorePoint POSTs the options verbatim (empty by default) to /database/restore-points", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createDatabaseRestorePoint();
  expect(calls[0].url).toBe(`/api/admin/v1/database/restore-points`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({});
});

test("createDatabaseRestorePoint sends trigger/costAck when given", async () => {
  const { body } = stubFetchCapturing();
  await api.createDatabaseRestorePoint({ trigger: "pre-migrate", costAck: true });
  expect(body()).toEqual({ trigger: "pre-migrate", costAck: true });
});

test("planMigrateForward POSTs with no body at all", async () => {
  const { calls } = stubFetchCapturing();
  await api.planMigrateForward();
  expect(calls[0].url).toBe(`/api/admin/v1/database/migrate-forward/plan`);
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.body).toBeUndefined();
});

test("executeMigrateForward POSTs { confirmationToken } to /database/migrate-forward/execute", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.executeMigrateForward("tok1");
  expect(calls[0].url).toBe(`/api/admin/v1/database/migrate-forward/execute`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ confirmationToken: "tok1" });
});

// --- Recovery -----------------------------------------------------------------

test("listRecoveryRestorePoints hits GET /recovery/restore-points", async () => {
  const { calls } = stubFetchCapturing();
  await api.listRecoveryRestorePoints();
  expect(calls[0].url).toBe(`/api/admin/v1/recovery/restore-points`);
});

test("computeRecoveryDisclosure POSTs { restorePointId } to /recovery/disclosure", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.computeRecoveryDisclosure("rp1");
  expect(calls[0].url).toBe(`/api/admin/v1/recovery/disclosure`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ restorePointId: "rp1" });
});

test("resolveRecoveryDeepLink POSTs { envelope } to /recovery/deep-link", async () => {
  const { calls, body } = stubFetchCapturing();
  const envelope = {
    v: 1,
    correlationId: "corr1",
    siteId: "site1",
    ledgerEventId: null,
    restorePointId: "rp1",
    drift: "none",
    intent: "restore",
    issuedAt: "2026-09-05T00:00:00.000Z",
  };
  await api.resolveRecoveryDeepLink(envelope);
  expect(calls[0].url).toBe(`/api/admin/v1/recovery/deep-link`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ envelope });
});

test("getRecoveryStatus hits GET /recovery/status", async () => {
  const { calls } = stubFetchCapturing();
  await api.getRecoveryStatus();
  expect(calls[0].url).toBe(`/api/admin/v1/recovery/status`);
});

test("planRestore POSTs { restorePointId } to /recovery/restore/plan", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.planRestore("rp1");
  expect(calls[0].url).toBe(`/api/admin/v1/recovery/restore/plan`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ restorePointId: "rp1" });
});

test("confirmRestore POSTs { planId, planHash, disclosureAcknowledged } to /recovery/restore/confirm", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.confirmRestore({ planId: "plan1", planHash: "hash1", disclosureAcknowledged: true });
  expect(calls[0].url).toBe(`/api/admin/v1/recovery/restore/confirm`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ planId: "plan1", planHash: "hash1", disclosureAcknowledged: true });
});

test("executeRestore POSTs { confirmationToken, restorePointId } to /recovery/restore/execute", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.executeRestore({ confirmationToken: "tok1", restorePointId: "rp1" });
  expect(calls[0].url).toBe(`/api/admin/v1/recovery/restore/execute`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ confirmationToken: "tok1", restorePointId: "rp1" });
});

// --- Presentation -----------------------------------------------------------------
//
// Genuinely untested before this file: `use-themes.hooks.unit.test.ts`'s own header says
// `Themes.unit.test.tsx` drives the component through a full-controller fake (never the real
// hook), and its own injected-port describe block explicitly asserts
// `expect(getPresentationSpy/setActiveSpy).not.toHaveBeenCalled()` — proving the real `api.*`
// implementations below never ran anywhere in the suite.

test("getPresentation hits GET /presentation", async () => {
  const { calls } = stubFetchCapturing();
  await api.getPresentation();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/presentation`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("setActiveTheme PATCHes { activeThemeId } to /presentation", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.setActiveTheme("quartz");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/presentation`);
  expect(calls[0].init?.method).toBe("PATCH");
  expect(body()).toEqual({ activeThemeId: "quartz" });
});

// --- Members -----------------------------------------------------------------
//
// `listMembers`/`disableMember` already get real-fetch assertions from `Members.unit.test.tsx`
// (initial list render, and a `/disable` URL-substring check). `getMember` does not: every test
// that reaches it (`use-members.hooks.unit.test.ts`, `members-dependencies.unit.test.ts`) goes
// through `createFakeMembersPort` or a fully `vi.mock`'d `api` module instead.

test("getMember hits GET /members/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.getMember("m1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/members/m1`);
  expect(calls[0].init?.method).toBeUndefined();
});

// --- External MCP servers -----------------------------------------------------------------
//
// `use-external-mcp.unit.test.ts`'s own header says the hook calls `api.*` directly and this file
// therefore mocks all four of `lib/api`'s external-MCP bindings wholesale — proving the hook wires
// through to `api.*`, but never running the real implementations below. `getExternalMcpAdmissions`
// (untested anywhere) is covered further up this file.

test("listExternalMcpServers hits GET /mcp-servers", async () => {
  const { calls } = stubFetchCapturing();
  await api.listExternalMcpServers();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/mcp-servers`);
});

test("saveExternalMcpServer PUTs the body verbatim to /mcp-servers/:id", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.saveExternalMcpServer("local-fs", {
    label: "Local filesystem",
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: "-y @modelcontextprotocol/server-filesystem",
    allowedToolNames: "read_file,write_file",
    writeAllowedToolNames: "write_file",
  });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/mcp-servers/local-fs`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({
    label: "Local filesystem",
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: "-y @modelcontextprotocol/server-filesystem",
    allowedToolNames: "read_file,write_file",
    writeAllowedToolNames: "write_file",
  });
});

test("saveExternalMcpServer encodes the serverId into the URL", async () => {
  const { calls } = stubFetchCapturing();
  await api.saveExternalMcpServer("weird id/slash", {
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: "",
    allowedToolNames: "",
    writeAllowedToolNames: "",
  });
  expect(calls[0].url).toBe(
    `/api/admin/v1/workspaces/workspace-local/mcp-servers/${encodeURIComponent("weird id/slash")}`
  );
});

test("deleteExternalMcpServer DELETEs /mcp-servers/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteExternalMcpServer("local-fs");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/mcp-servers/local-fs`);
  expect(calls[0].init?.method).toBe("DELETE");
});

test("probeExternalMcpServer POSTs (no body) to /mcp-servers/:id/probe", async () => {
  const { calls } = stubFetchCapturing();
  await api.probeExternalMcpServer("local-fs");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/mcp-servers/local-fs/probe`);
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.body).toBeUndefined();
});

// --- Comments settings -----------------------------------------------------------------
//
// `use-comment-settings.unit.test.tsx`'s injected-port describe block explicitly asserts
// `expect(fetchMock).not.toHaveBeenCalled()` — proving the real `getCommentsSettings` binding is
// never exercised anywhere in that suite or `SettingsSection.unit.test.tsx`'s controller-fake
// tests. `putCommentsSettings` already gets a real assertion in
// `api-endpoint-option-branches.unit.test.ts`.

test("getCommentsSettings hits GET /comments/settings", async () => {
  const { calls } = stubFetchCapturing();
  await api.getCommentsSettings();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/comments/settings`);
});
