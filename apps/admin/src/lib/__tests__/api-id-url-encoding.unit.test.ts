import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";
import { menusApi } from "../../features/menus/api/menus-api";
import { membersApi } from "../../features/members/api/members-api";
import { widgetsApi } from "../../features/widgets/api/widgets-api";

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
  ["getPost", () => api.getPost({ id: SLASH_ID }), `${BASE_WORKSPACE}/posts/${ENC}`],
  ["updatePost", () => api.updatePost({ id: SLASH_ID }), `${BASE_WORKSPACE}/posts/${ENC}`],
  ["deletePost", () => api.deletePost({ id: SLASH_ID }), `${BASE_WORKSPACE}/posts/${ENC}`],
  ["getPage", () => api.getPage({ id: SLASH_ID }), `${BASE_WORKSPACE}/pages/${ENC}`],
  ["updatePageHtml", () => api.updatePageHtml({ id: SLASH_ID, html: "<p>x</p>" }), `${BASE_WORKSPACE}/pages/${ENC}/html`],
  ["deletePage", () => api.deletePage({ id: SLASH_ID }), `${BASE_WORKSPACE}/pages/${ENC}`],
  ["getMember", () => membersApi.getMember({ id: SLASH_ID }), `${BASE_WORKSPACE}/members/${ENC}`],
  ["disableMember", () => membersApi.disableMember({ id: SLASH_ID }), `${BASE_WORKSPACE}/members/${ENC}/disable`],
  ["getMenu", () => menusApi.getMenu({ id: SLASH_ID }), `${BASE_WORKSPACE}/menus/${ENC}`],
  [
    "updateMenuTree",
    () => menusApi.updateMenuTree({ id: SLASH_ID, expectedVersion: 1, items: [] }),
    `${BASE_WORKSPACE}/menus/${ENC}`,
  ],
  [
    "pauseIntegrationSubscription",
    () => api.pauseIntegrationSubscription({ id: SLASH_ID, paused: true }),
    `${BASE_WORKSPACE}/integrations/subscriptions/${ENC}/pause`,
  ],
  [
    "deleteIntegrationSubscription",
    () => api.deleteIntegrationSubscription({ id: SLASH_ID }),
    `${BASE_WORKSPACE}/integrations/subscriptions/${ENC}`,
  ],
  [
    "listIntegrationDeliveries",
    () => api.listIntegrationDeliveries({ subscriptionId: SLASH_ID }),
    `${BASE_WORKSPACE}/integrations/subscriptions/${ENC}/deliveries`,
  ],
  ["updateMedia", () => api.updateMedia({ id: SLASH_ID }), `${BASE_WORKSPACE}/media/${ENC}`],
  ["trashMedia", () => api.trashMedia({ id: SLASH_ID }), `${BASE_WORKSPACE}/media/${ENC}/trash`],
  ["deleteMedia", () => api.deleteMedia({ id: SLASH_ID }), `${BASE_WORKSPACE}/media/${ENC}`],
  ["updateUser", () => api.updateUser({ principalId: SLASH_ID }), `${BASE_WORKSPACE}/users/${ENC}`],
  ["disableUser", () => api.disableUser({ principalId: SLASH_ID }), `${BASE_WORKSPACE}/users/${ENC}/disable`],
  ["enableUser", () => api.enableUser({ principalId: SLASH_ID }), `${BASE_WORKSPACE}/users/${ENC}/enable`],
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
  ["deleteRole", () => api.deleteRole({ roleId: SLASH_ID }), `${BASE_WORKSPACE}/roles/${ENC}`],
  ["updatePolicy", () => api.updatePolicy({ policyId: SLASH_ID }), `${BASE_WORKSPACE}/policies/${ENC}`],
  ["deletePolicy", () => api.deletePolicy({ policyId: SLASH_ID }), `${BASE_WORKSPACE}/policies/${ENC}`],
  [
    "writePolicyPermission",
    () => api.writePolicyPermission({ policyId: SLASH_ID, permission: "read" }),
    `${BASE_WORKSPACE}/policies/${ENC}/permissions`,
  ],
  [
    "listPolicyPermissions",
    () => api.listPolicyPermissions({ policyId: SLASH_ID }),
    `${BASE_WORKSPACE}/policies/${ENC}/permissions`,
  ],

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

  ["getWidget", () => widgetsApi.getWidget({ id: SLASH_ID }), `${BASE_WORKSPACE}/widgets/${ENC}`],

  [
    "setPluginEnabled",
    () => api.setPluginEnabled({ pluginId: SLASH_ID, enabled: true }),
    `${BASE_WORKSPACE}/plugins/${ENC}`,
  ],
  [
    "updatePublishCredential",
    () => api.updatePublishCredential({ id: SLASH_ID, input: {} }),
    `${BASE_WORKSPACE}/system/publish/credentials/${ENC}`,
  ],
  [
    "deletePublishCredential",
    () => api.deletePublishCredential({ id: SLASH_ID }),
    `${BASE_WORKSPACE}/system/publish/credentials/${ENC}`,
  ],
  [
    "verifyPublishCredential",
    () => api.verifyPublishCredential({ id: SLASH_ID }),
    `${BASE_WORKSPACE}/system/publish/credentials/${ENC}/verify`,
  ],
  [
    "updateSourceControlCredential",
    () => api.updateSourceControlCredential({ id: SLASH_ID, input: {} }),
    `${BASE_WORKSPACE}/system/source-control/credentials/${ENC}`,
  ],
  [
    "deleteSourceControlCredential",
    () => api.deleteSourceControlCredential({ id: SLASH_ID }),
    `${BASE_WORKSPACE}/system/source-control/credentials/${ENC}`,
  ],
  [
    "updateCustomCredential",
    () => api.updateCustomCredential({ id: SLASH_ID, input: {} }),
    `${BASE_WORKSPACE}/system/custom/credentials/${ENC}`,
  ],
  [
    "deleteCustomCredential",
    () => api.deleteCustomCredential({ id: SLASH_ID }),
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
  expect(api.mediaOriginalUrl({ id: SLASH_ID })).toBe(`${BASE_API}/workspaces/workspace-local/media/${ENC}/original`);
});

// The Edit post cover slot shows the same `public` rendition the published post's cover uses, not the
// cropped `og` share card (owner 2026-10-11: the slot must match the published page).
test("mediaPreviewRenditionUrl builds the published cover's public.v1 URL with the id encoded", () => {
  expect(api.mediaPreviewRenditionUrl({ id: SLASH_ID })).toMatch(new RegExp(`/m/${ENC}/public\\.v1/image\\.jpg$`));
});

// --- Two-id call sites: each segment asserted independently ----------------

test("removePolicyPermission encodes both policyId and policyPermissionId", async () => {
  const { calls } = stubFetchCapturing();
  await api.removePolicyPermission({ policyId: SLASH_ID, policyPermissionId: SECOND_ID });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/policies/${ENC}/permissions/${ENC2}`);
});

// --- Deliberately-unencoded sibling segment ---------------------------------
