import { afterEach, expect, test, vi } from "vitest";

import { ApiError, api } from "../api";

test("external MCP approvals list and revoke use separately encoded server and tool names", async () => {
  const { calls } = stubFetchCapturing();
  await api.listExternalMcpToolApprovals();
  await api.revokeExternalMcpToolApproval("server/one", "tool/name");
  expect(calls.map(({ url, init }) => [url, init?.method ?? "GET"])).toEqual([
    ["/api/admin/v1/workspaces/workspace-local/mcp-servers/tool-approvals", "GET"],
    ["/api/admin/v1/workspaces/workspace-local/mcp-servers/server%2Fone/tool-approvals/tool%2Fname", "DELETE"],
  ]);
});

test("publish destination reads and connects the workspace singleton with an optional site URL", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.getPublishDestination();
  await api.connectPublishDestination();
  await api.connectPublishDestination({ siteUrl: "https://live.example" });
  expect(calls.map(({ url, init }) => [url, init?.method ?? "GET"])).toEqual([
    ["/api/admin/v1/workspaces/workspace-local/publish-content/destination", "GET"],
    ["/api/admin/v1/workspaces/workspace-local/publish-content/destination/connect", "POST"],
    ["/api/admin/v1/workspaces/workspace-local/publish-content/destination/connect", "POST"],
  ]);
  expect(body(1)).toEqual({});
  expect(body(2)).toEqual({ siteUrl: "https://live.example" });
});

test("publish peers are read from the workspace peer collection", async () => {
  const { calls } = stubFetchCapturing();
  await api.listPublishContentPeers();
  expect(calls[0].url).toBe("/api/admin/v1/workspaces/workspace-local/publish-content/peers");
  expect(calls[0].init?.method ?? "GET").toBe("GET");
});

test("publish plans omit a body when unfiltered and retain each explicitly supplied selection", async () => {
  const { calls, body } = stubFetchCapturing();
  const scope = { entityTypes: ["post"] };
  await api.planPublishContent({ peerId: "peer/one" });
  await api.planPublishContent({ peerId: "peer/one", selectedEntityKeys: [] });
  await api.planPublishContent({ peerId: "peer/one", overwriteEntityKeys: [] });
  await api.planPublishContent({ peerId: "peer/one", scope });
  await api.planPublishContent({ peerId: "peer/one", selectedEntityKeys: ["post:p1"], overwriteEntityKeys: ["post:p1"], scope });
  expect(calls.every(({ url, init }) => url === "/api/admin/v1/workspaces/workspace-local/publish-content/peers/peer%2Fone/push/plan" && init?.method === "POST")).toBe(true);
  expect(calls[0].init?.body).toBeUndefined();
  expect(body(1)).toEqual({ selectedEntityKeys: [] });
  expect(body(2)).toEqual({ overwriteEntityKeys: [] });
  expect(body(3)).toEqual({ scope });
  expect(body(4)).toEqual({ selectedEntityKeys: ["post:p1"], overwriteEntityKeys: ["post:p1"], scope });
});

test("publish confirmation and execution retain their distinct authorization payloads", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.confirmPublishContent({ peerId: "peer/one", planId: "plan", planHash: "hash" });
  await api.executePublishContent({ peerId: "peer/one", bundleId: "bundle", confirmationToken: "approved" });
  await api.executePublishContent({ peerId: "peer/one", bundleId: "bundle", confirmationToken: "approved", overwriteEntityKeys: [] }, {});
  expect(calls.map(({ url, init }) => [url, init?.method])).toEqual([
    ["/api/admin/v1/workspaces/workspace-local/publish-content/peers/peer%2Fone/push/confirm", "POST"],
    ["/api/admin/v1/workspaces/workspace-local/publish-content/peers/peer%2Fone/push/execute", "POST"],
    ["/api/admin/v1/workspaces/workspace-local/publish-content/peers/peer%2Fone/push/execute", "POST"],
  ]);
  expect(body(0)).toEqual({ planId: "plan", planHash: "hash" });
  expect(body(1)).toEqual({ bundleId: "bundle", confirmationToken: "approved" });
  expect(body(2)).toEqual({ bundleId: "bundle", confirmationToken: "approved", overwriteEntityKeys: [] });
});

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
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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

// --- Workspace -----------------------------------------------------------------

// --- Plugins -----------------------------------------------------------------

test("setPluginEnabled PATCHes { enabled } to /plugins/:id", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.setPluginEnabled("p1", { enabled: false });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/plugins/p1`);
  expect(calls[0].init?.method).toBe("PATCH");
  expect(body()).toEqual({ enabled: false });
});

// --- Deployments -----------------------------------------------------------------

test("getExternalMcpAdmissions hits GET /mcp-servers/admissions", async () => {
  const { calls } = stubFetchCapturing();
  await api.getExternalMcpAdmissions();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/mcp-servers/admissions`);
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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
  expect(calls[0].init?.method ?? "GET").toBe("GET");
});

// --- Content types -----------------------------------------------------------------

test("listContentTypes hits GET /content-types — not workspace-scoped", async () => {
  const { calls } = stubFetchCapturing();
  await api.listContentTypes();
  expect(calls[0].url).toBe(`/api/admin/v1/content-types`);
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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

test("unassignTerms POSTs the input verbatim to /taxonomy/unassign-terms", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.unassignTerms({ contentType: "recipe", contentId: "e1", termIds: ["term1"] });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/unassign-terms`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ contentType: "recipe", contentId: "e1", termIds: ["term1"] });
});

test("assignedTerms GETs /taxonomy/assigned-terms with both ids encoded", async () => {
  const { calls } = stubFetchCapturing();
  await api.assignedTerms({ contentType: "recipe", contentId: "e 1" });
  expect(calls[0].url).toBe(`/api/admin/v1/taxonomy/assigned-terms?contentType=recipe&contentId=e%201`);
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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
  expect(calls[0].init?.method ?? "GET").toBe("GET");
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

test("presentation requests identify each editor's template kind", async () => {
  const { calls } = stubFetchCapturing();
  await api.getPresentation({ kind: "post" });
  await api.getPresentation({ kind: "page" });
  expect(calls.map((call) => call.url)).toEqual([
    "/api/admin/v1/workspaces/workspace-local/presentation?kind=post",
    "/api/admin/v1/workspaces/workspace-local/presentation?kind=page",
  ]);
});
