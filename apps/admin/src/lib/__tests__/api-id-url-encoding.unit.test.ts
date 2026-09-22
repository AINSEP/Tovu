import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file id-encoding sweep (2026-09-05, `fix-apienc` dispatch) — TASK 1.
 *
 * `getPost`/`updatePost`/`deletePost` were found interpolating `id` raw into the URL while a
 * sibling (`templatePreviewUrl`) and every `connectors`/`themes`/`mcp-servers` method run it through
 * `encodeURIComponent` first. Not exploitable today (post ids are server-generated), but the
 * inconsistency within one file is itself the hazard this pins against — a "let users choose a
 * slug" feature away from mattering.
 *
 * A whole-file sweep of every id-bearing URL interpolation found ~70 more call sites with the same
 * gap. This file is the RED→GREEN pin for every one of them: each case below asserts that an id
 * containing `/` arrives on the wire percent-encoded (`%2F`), not literal. Before the fix in
 * `api.ts`, every case here fails (the raw `/` splits the URL into an extra path segment); after,
 * every case passes.
 *
 * Two call sites are intentionally NOT included:
 * - `moderateComment`'s second path segment is `action`, typed `CommentModerationAction` — a closed
 *   4-member literal union (`"approve" | "spam" | "trash" | "restore"`), not a plain `string`. It
 *   cannot ever carry an unsafe character, so it stays unencoded; this file still asserts its
 *   *sibling* segment, `commentId`, is encoded.
 * - Query-string values (`options.type` on `listEntries`, every `URLSearchParams`-built query) were
 *   already handled correctly (either already `encodeURIComponent`-wrapped, or built via
 *   `URLSearchParams`, which encodes on `.toString()`) — out of scope for this sweep, which is about
 *   raw path-segment interpolation.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function stubFetchCapturing(): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({});
    })
  );
  return { calls };
}

const BASE_WORKSPACE = "/api/admin/v1/workspaces/workspace-local";
const BASE_API = "/api/admin/v1";
const SLASH_ID = "a/b";
const ENC = encodeURIComponent(SLASH_ID); // "a%2Fb"
const SECOND_ID = "c/d";
const ENC2 = encodeURIComponent(SECOND_ID); // "c%2Fd"

type Case = [name: string, run: () => unknown, expectedUrl: string];

// One entry per newly-encoded call site whose id-bearing segment is the ONLY thing under test
// (single-id methods). Each `run()` supplies just enough of the method's real signature to reach
// the URL-building line; unrelated fields (`expectedVersion`, `baseVersion`, required companion
// ids) get innocuous fixed values since only the URL is asserted.
const singleIdCases: Case[] = [
  ["getPost", () => api.getPost(SLASH_ID), `${BASE_WORKSPACE}/posts/${ENC}`],
  ["updatePost", () => api.updatePost({ id: SLASH_ID }), `${BASE_WORKSPACE}/posts/${ENC}`],
  ["deletePost", () => api.deletePost(SLASH_ID), `${BASE_WORKSPACE}/posts/${ENC}`],
  ["getPage", () => api.getPage(SLASH_ID), `${BASE_WORKSPACE}/pages/${ENC}`],
  ["updatePageHtml", () => api.updatePageHtml(SLASH_ID, "<p>x</p>"), `${BASE_WORKSPACE}/pages/${ENC}/html`],
  ["deletePage", () => api.deletePage(SLASH_ID), `${BASE_WORKSPACE}/pages/${ENC}`],
  ["getMember", () => api.getMember(SLASH_ID), `${BASE_WORKSPACE}/members/${ENC}`],
  ["disableMember", () => api.disableMember(SLASH_ID), `${BASE_WORKSPACE}/members/${ENC}/disable`],
  ["getMenu", () => api.getMenu(SLASH_ID), `${BASE_WORKSPACE}/menus/${ENC}`],
  [
    "updateMenuTree",
    () => api.updateMenuTree({ id: SLASH_ID, expectedVersion: 1, items: [] }),
    `${BASE_WORKSPACE}/menus/${ENC}`,
  ],
  [
    "pauseIntegrationSubscription",
    () => api.pauseIntegrationSubscription({ id: SLASH_ID, paused: true }),
    `${BASE_WORKSPACE}/integrations/subscriptions/${ENC}/pause`,
  ],
  [
    "deleteIntegrationSubscription",
    () => api.deleteIntegrationSubscription(SLASH_ID),
    `${BASE_WORKSPACE}/integrations/subscriptions/${ENC}`,
  ],
  [
    "listIntegrationDeliveries",
    () => api.listIntegrationDeliveries(SLASH_ID),
    `${BASE_WORKSPACE}/integrations/subscriptions/${ENC}/deliveries`,
  ],
  ["updateMedia", () => api.updateMedia({ id: SLASH_ID }), `${BASE_WORKSPACE}/media/${ENC}`],
  ["trashMedia", () => api.trashMedia(SLASH_ID), `${BASE_WORKSPACE}/media/${ENC}/trash`],
  ["deleteMedia", () => api.deleteMedia(SLASH_ID), `${BASE_WORKSPACE}/media/${ENC}`],
  ["updateUser", () => api.updateUser({ principalId: SLASH_ID }), `${BASE_WORKSPACE}/users/${ENC}`],
  ["disableUser", () => api.disableUser(SLASH_ID), `${BASE_WORKSPACE}/users/${ENC}/disable`],
  ["enableUser", () => api.enableUser(SLASH_ID), `${BASE_WORKSPACE}/users/${ENC}/enable`],
  [
    "resetUserPassword",
    () => api.resetUserPassword({ principalId: SLASH_ID, password: "x" }),
    `${BASE_WORKSPACE}/users/${ENC}/reset-password`,
  ],
  [
    "assignRole",
    () => api.assignRole({ principalId: SLASH_ID, roleId: "r1" }),
    `${BASE_WORKSPACE}/users/${ENC}/roles`,
  ],
  [
    "attachPolicy",
    () => api.attachPolicy({ principalId: SLASH_ID, policyId: "p1" }),
    `${BASE_WORKSPACE}/users/${ENC}/policies`,
  ],
  ["updateRole", () => api.updateRole({ roleId: SLASH_ID, name: "x" }), `${BASE_WORKSPACE}/roles/${ENC}`],
  ["deleteRole", () => api.deleteRole(SLASH_ID), `${BASE_WORKSPACE}/roles/${ENC}`],
  ["updatePolicy", () => api.updatePolicy({ policyId: SLASH_ID }), `${BASE_WORKSPACE}/policies/${ENC}`],
  ["deletePolicy", () => api.deletePolicy(SLASH_ID), `${BASE_WORKSPACE}/policies/${ENC}`],
  [
    "writePolicyPermission",
    () => api.writePolicyPermission({ policyId: SLASH_ID, permission: "read" }),
    `${BASE_WORKSPACE}/policies/${ENC}/permissions`,
  ],
  [
    "listPolicyPermissions",
    () => api.listPolicyPermissions(SLASH_ID),
    `${BASE_WORKSPACE}/policies/${ENC}/permissions`,
  ],
  ["getForm", () => api.getForm(SLASH_ID), `${BASE_WORKSPACE}/forms/${ENC}`],
  ["updateForm", () => api.updateForm({ id: SLASH_ID }), `${BASE_WORKSPACE}/forms/${ENC}`],
  [
    "listFormSubmissions",
    () => api.listFormSubmissions({ formId: SLASH_ID }),
    `${BASE_WORKSPACE}/forms/${ENC}/submissions`,
  ],
  ["getSeoEntry", () => api.getSeoEntry(SLASH_ID), `${BASE_WORKSPACE}/seo/entries/${ENC}`],
  ["putSeoEntry", () => api.putSeoEntry({ entryId: SLASH_ID }), `${BASE_WORKSPACE}/seo/entries/${ENC}`],
  [
    "getSeoEntryAnalyze",
    () => api.getSeoEntryAnalyze(SLASH_ID),
    `${BASE_WORKSPACE}/seo/entries/${ENC}/analyze`,
  ],
  ["updateRedirect", () => api.updateRedirect({ id: SLASH_ID }), `${BASE_WORKSPACE}/redirects/${ENC}`],
  ["tombstoneRedirect", () => api.tombstoneRedirect(SLASH_ID), `${BASE_WORKSPACE}/redirects/${ENC}`],
  ["getRedirectHits", () => api.getRedirectHits(SLASH_ID), `${BASE_WORKSPACE}/redirects/${ENC}/hits`],
  [
    "updateContentTypeFields",
    () => api.updateContentTypeFields({ key: SLASH_ID, fields: [], expectedVersion: 1 }),
    `${BASE_API}/content-types/${ENC}/fields`,
  ],
  [
    "contentTypeLifecycle",
    () => api.contentTypeLifecycle({ key: SLASH_ID, op: "deprecate", expectedVersion: 1 }),
    `${BASE_API}/content-types/${ENC}/lifecycle`,
  ],
  ["updateEntry", () => api.updateEntry({ id: SLASH_ID, expectedVersion: 1 }), `${BASE_API}/entries/${ENC}`],
  [
    "entryLifecycle",
    () => api.entryLifecycle({ id: SLASH_ID, op: "publish", expectedVersion: 1 }),
    `${BASE_API}/entries/${ENC}/lifecycle`,
  ],
  [
    "createTerm",
    () => api.createTerm({ taxonomyId: SLASH_ID, name: "x" }),
    `${BASE_API}/taxonomy/${ENC}/terms`,
  ],
  [
    "renameTerm",
    () => api.renameTerm({ termId: SLASH_ID, newName: "x" }),
    `${BASE_API}/taxonomy/terms/${ENC}`,
  ],
  [
    "planMergeTerm",
    () => api.planMergeTerm({ fromTermId: SLASH_ID, intoTermId: "t2" }),
    `${BASE_API}/taxonomy/terms/${ENC}/merge/plan`,
  ],
  [
    "confirmMergeTerm",
    () => api.confirmMergeTerm({ fromTermId: SLASH_ID, planId: "p1", planHash: "h1" }),
    `${BASE_API}/taxonomy/terms/${ENC}/merge/confirm`,
  ],
  [
    "executeMergeTerm",
    () => api.executeMergeTerm({ fromTermId: SLASH_ID, intoTermId: "t2", confirmationToken: "tok" }),
    `${BASE_API}/taxonomy/terms/${ENC}/merge/execute`,
  ],
  [
    "moderateComment (commentId segment)",
    () => api.moderateComment({ commentId: SLASH_ID, action: "approve", expectedVersion: 1 }),
    `${BASE_WORKSPACE}/comments/${ENC}/approve`,
  ],
  ["purgeComment", () => api.purgeComment({ commentId: SLASH_ID }), `${BASE_WORKSPACE}/comments/${ENC}/purge`],
  ["getWidget", () => api.getWidget(SLASH_ID), `${BASE_WORKSPACE}/widgets/${ENC}`],
  [
    "updateWidget",
    () => api.updateWidget({ id: SLASH_ID, baseVersion: 1, config: {} }),
    `${BASE_WORKSPACE}/widgets/${ENC}`,
  ],
  ["getWidgetRegion", () => api.getWidgetRegion(SLASH_ID), `${BASE_WORKSPACE}/widgets/regions/${ENC}`],
  [
    "mutateWidgetRegionPlacements",
    () => api.mutateWidgetRegionPlacements({ regionKey: SLASH_ID, baseVersion: 1, placements: [] }),
    `${BASE_WORKSPACE}/widgets/regions/${ENC}`,
  ],
  [
    "insertWidgetEmbed",
    () => api.insertWidgetEmbed({ hostEntryId: SLASH_ID, baseVersion: 1, widgetEntryId: "w1" }),
    `${BASE_WORKSPACE}/entries/${ENC}/widget-embeds`,
  ],
  [
    "setPluginEnabled",
    () => api.setPluginEnabled(SLASH_ID, { enabled: true }),
    `${BASE_WORKSPACE}/plugins/${ENC}`,
  ],
  [
    "updatePublishCredential",
    () => api.updatePublishCredential(SLASH_ID, {}),
    `${BASE_WORKSPACE}/system/publish/credentials/${ENC}`,
  ],
  [
    "deletePublishCredential",
    () => api.deletePublishCredential(SLASH_ID),
    `${BASE_WORKSPACE}/system/publish/credentials/${ENC}`,
  ],
  [
    "verifyPublishCredential",
    () => api.verifyPublishCredential(SLASH_ID),
    `${BASE_WORKSPACE}/system/publish/credentials/${ENC}/verify`,
  ],
  [
    "updateSourceControlCredential",
    () => api.updateSourceControlCredential(SLASH_ID, {}),
    `${BASE_WORKSPACE}/system/source-control/credentials/${ENC}`,
  ],
  [
    "deleteSourceControlCredential",
    () => api.deleteSourceControlCredential(SLASH_ID),
    `${BASE_WORKSPACE}/system/source-control/credentials/${ENC}`,
  ],
  [
    "updateCustomCredential",
    () => api.updateCustomCredential(SLASH_ID, {}),
    `${BASE_WORKSPACE}/system/custom/credentials/${ENC}`,
  ],
  [
    "deleteCustomCredential",
    () => api.deleteCustomCredential(SLASH_ID),
    `${BASE_WORKSPACE}/system/custom/credentials/${ENC}`,
  ],
];

test.each(singleIdCases)("%s encodes an id containing '/' in the request URL", async (_name, run, expectedUrl) => {
  const { calls } = stubFetchCapturing();
  await run();
  expect(calls[0].url).toBe(expectedUrl);
});

// `mediaOriginalUrl` is NOT routed through `request()`/`fetch` — it only builds a URL string handed
// to a DOM element's `src` (same shape as `templatePreviewUrl`, which already encodes). No stub
// needed.
test("mediaOriginalUrl encodes an id containing '/' in the URL string it builds", () => {
  expect(api.mediaOriginalUrl(SLASH_ID)).toBe(`${BASE_API}/workspaces/workspace-local/media/${ENC}/original`);
});

// --- Two-id call sites: each segment asserted independently ----------------

test("removePolicyPermission encodes both policyId and policyPermissionId", async () => {
  const { calls } = stubFetchCapturing();
  await api.removePolicyPermission({ policyId: SLASH_ID, policyPermissionId: SECOND_ID });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies/${ENC}/permissions/${ENC2}`);
});

test("getFormSubmission encodes both formId and submissionId", async () => {
  const { calls } = stubFetchCapturing();
  await api.getFormSubmission({ formId: SLASH_ID, submissionId: SECOND_ID });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/forms/${ENC}/submissions/${ENC2}`);
});

test("removeWidgetEmbed encodes both hostEntryId and placementId", async () => {
  const { calls } = stubFetchCapturing();
  await api.removeWidgetEmbed({ hostEntryId: SLASH_ID, placementId: SECOND_ID, baseVersion: 1 });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/entries/${ENC}/widget-embeds/${ENC2}`);
});

// --- Deliberately-unencoded sibling segment ---------------------------------

test("moderateComment leaves the action segment (a closed literal union) unencoded", async () => {
  const { calls } = stubFetchCapturing();
  await api.moderateComment({ commentId: "c1", action: "approve", expectedVersion: 1 });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/comments/c1/approve`);
});
