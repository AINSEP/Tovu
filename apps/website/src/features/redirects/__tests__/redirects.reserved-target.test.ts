import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "#src/features/origin/index";
import { redirectMatcher } from "../matcher.js";
import type { RedirectDbHandle } from "../ports.internal.js";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import { createRedirect, tombstoneRedirect, updateRedirect, type RedirectsWriteDeps } from "../redirects.js";
import { RedirectTargetNotAllowedError } from "../types.js";
import type { RedirectRecord } from "../types.js";

/**
 * @file The site-relative half of the write-path target gate (REQ-08's own
 * threat, applied to targets that never reach the origin allowlist because
 * they carry no authority).
 *
 * `assertTargetAllowed` consults `OriginRegistryPort.isAllowedRedirectTarget`
 * only for absolute/protocol-relative targets — a site-relative target has no
 * host to check, so the oracle has nothing to say about it. That leaves the
 * admin application's own URL space (`/admin`, `/api/...` — the SAME Express
 * app serves them, see `admin-static.ts`'s `app.use("/admin", ...)` and
 * `core.ts`'s `app.use("/api/admin", ...)`) reachable as a redirect
 * destination from a public-site rule, including through an agent-callable
 * `redirects_create`. These tests pin the refusal, its decode-then-compare
 * order, and — just as load-bearing — that a path which merely STARTS with
 * the same letters stays allowed.
 */

const WORKSPACE_ID = "workspace-1";
const ACTOR_ID = "user-1";

function makeDeps(): RedirectsWriteDeps {
  const repo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo([
    {
      workspaceId: WORKSPACE_ID,
      origin: createVerifiedOrigin({
        scheme: "https",
        host: "trusted.example",
        verifiedAt: "2026-07-13T00:00:00.000Z",
        source: "workspace-setting",
      }),
      redirectAllowlist: [],
    },
  ]);
  let clockTick = 0;
  let idTick = 0;
  return {
    repo,
    db: repo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowIso: () => `2026-07-13T00:00:${String(clockTick++).padStart(2, "0")}.000Z` },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };
}

function create(deps: RedirectsWriteDeps, fromPattern: string, toTarget: string) {
  return createRedirect({
    deps,
    input: { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern, toTarget, statusCode: 301, actorId: ACTOR_ID },
  });
}

/**
 * Every spelling that reaches the admin application's own URL space. Each row is a distinct
 * evasion, not a restatement: raw, percent-encoded, case-shifted, dot-segmented, and separator-
 * disguised forms all normalize to `/admin` or `/api/...` in a browser following the `Location`.
 */
const RESERVED_TARGETS: readonly { readonly target: string; readonly why: string }[] = [
  { target: "/admin", why: "the bare admin SPA root" },
  { target: "/admin/settings", why: "a screen inside the admin SPA" },
  { target: "/%61dmin", why: "percent-encoded 'a' — a raw-prefix denylist never sees it" },
  { target: "/%61dmin/settings", why: "percent-encoded 'a' with a deeper path" },
  { target: "/ADMIN", why: "upper case — URL paths are compared case-sensitively by servers" },
  { target: "/AdMiN/settings", why: "mixed case" },
  { target: "/api/admin/v1/workspaces/workspace-1/settings", why: "the session-gated admin API" },
  { target: "/API/admin/v1/auth/me", why: "upper-cased API surface" },
  { target: "/%61pi/admin/v1/auth/me", why: "percent-encoded API surface" },
  { target: "/blog/../admin", why: "a dot segment the browser resolves away before requesting" },
  { target: "/blog/%2e%2e/admin", why: "an encoded dot segment" },
];

for (const { target, why } of RESERVED_TARGETS) {
  test(`createRedirect refuses the reserved target '${target}' (${why})`, async () => {
    const deps = makeDeps();
    await assert.rejects(() => create(deps, "/old", target), (err: unknown) => {
      assert.ok(err instanceof RedirectTargetNotAllowedError, `expected RedirectTargetNotAllowedError, got ${String(err)}`);
      assert.match(err.message, /is not an allowed redirect destination/);
      return true;
    });
  });
}

/**
 * The negative case that makes the rule worth having rather than a blunt prefix ban: a public
 * page whose slug merely begins with the same letters is ordinary site content.
 */
const ALLOWED_TARGETS: readonly string[] = [
  "/administer-survey",
  "/administration",
  "/apiary",
  "/api-docs",
  "/blog/admin-interview",
  "/admins-are-people-too",
];

for (const target of ALLOWED_TARGETS) {
  test(`createRedirect still allows the ordinary site path '${target}'`, async () => {
    const deps = makeDeps();
    const { record } = await create(deps, "/old", target);
    assert.equal(record.toTarget, target);
  });
}

test("updateRedirect refuses a reserved target on an already-live rule", async () => {
  const deps = makeDeps();
  const { record } = await create(deps, "/old", "/new");
  await assert.rejects(
    () =>
      updateRedirect({
        deps,
        input: { workspaceId: WORKSPACE_ID, id: record.id, toTarget: "/admin/settings", actorId: ACTOR_ID },
      }),
    RedirectTargetNotAllowedError
  );
});

test("createRedirect refuses a one-hop chain that COLLAPSES onto a reserved target", async () => {
  const deps = makeDeps();
  // Planted straight into the repo, deliberately bypassing the chokepoint: this is the row a
  // workspace that predates this guard already carries. The collapse re-check (redirects.ts) is
  // what must catch it, not the first-pass check on the caller's own literal target.
  const planted: RedirectRecord = {
    id: "planted-1",
    workspaceId: WORKSPACE_ID,
    matchType: "exact",
    fromPattern: "/hop",
    toTarget: "/admin/settings",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: ACTOR_ID,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    version: 1,
  };
  (deps.repo as InMemoryRedirectRepo).insertRedirect(planted);

  await assert.rejects(() => create(deps, "/old", "/hop"), RedirectTargetNotAllowedError);
});

test("createRedirect refuses a backslash-disguised protocol-relative target", async () => {
  // `/\evil.example` starts with a single '/', so the absolute/protocol-relative branch never
  // fires — but a URL parser treats '\' as '/', making this `//evil.example`. The origin
  // allowlist is the gate this was walking around.
  const deps = makeDeps();
  await assert.rejects(() => create(deps, "/old", "/\\evil.example"), RedirectTargetNotAllowedError);
});

test("tombstoneRedirect can still turn OFF a legacy rule whose target is now refused", async () => {
  // The escape hatch this guard must leave open: a workspace that predates it can be carrying a
  // rule pointing at /admin, and `updateRedirect` re-validates the EXISTING target on every field
  // change — so if tombstoning went through the same gate, the one operation that neutralizes the
  // bad rule would be the one operation the gate blocked.
  const deps = makeDeps();
  const planted: RedirectRecord = {
    id: "planted-2",
    workspaceId: WORKSPACE_ID,
    matchType: "exact",
    fromPattern: "/legacy",
    toTarget: "/admin/settings",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: ACTOR_ID,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    version: 1,
  };
  (deps.repo as InMemoryRedirectRepo).insertRedirect(planted);

  const { record } = await tombstoneRedirect({
    deps,
    input: { workspaceId: WORKSPACE_ID, id: "planted-2", actorId: ACTOR_ID },
  });
  assert.equal(record.status, "disabled");
});

test("updateRedirect can still REPOINT a legacy rule away from a refused target", async () => {
  const deps = makeDeps();
  const planted: RedirectRecord = {
    id: "planted-3",
    workspaceId: WORKSPACE_ID,
    matchType: "exact",
    fromPattern: "/legacy-2",
    toTarget: "/admin/settings",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: ACTOR_ID,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    version: 1,
  };
  (deps.repo as InMemoryRedirectRepo).insertRedirect(planted);

  const { record } = await updateRedirect({
    deps,
    input: { workspaceId: WORKSPACE_ID, id: "planted-3", toTarget: "/somewhere-safe", actorId: ACTOR_ID },
  });
  assert.equal(record.toTarget, "/somewhere-safe");
});
