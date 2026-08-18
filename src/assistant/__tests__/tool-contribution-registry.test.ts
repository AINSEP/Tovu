/**
 * @file Contract tests for `tool-contribution-registry.ts` and `server/tool-catalog-manifest.ts` —
 * the 2026-08-17 registry that replaced `assistant/tool-registrations.ts` importing `comments` and
 * `newsletter` by name (see that file's own header for why: it used to close the `[assistant,
 * comments, features/plugins, newsletter]` module cycle `check:architecture` flagged). `post` was
 * also tried and reverted the same night — see `features/post/tool-registrations.ts`'s trailing
 * comment and this file's own dedicated test below for why.
 *
 * Covers exactly the five properties the design's own addendum called for: the exact set of
 * installed contributors, duplicate-tool-id rejection, an omitted contributor failing loud rather
 * than being silently treated as safe, deterministic registration order, and daemon/BYOK catalog
 * parity — i.e. that the two real composition roots which both call
 * `installFirstPartyToolContributors()` before `buildAssistantToolRegistrations` end up with the
 * identical tool surface, since they are independent processes that must never drift apart.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AgentToolSideEffect, DerivedRiskByToolId } from "@jini-ai/cms/core";
import type { ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "../../server/app";
import { installFirstPartyToolContributors } from "../../server/tool-catalog-manifest";
import {
  listToolContributors,
  registerToolContributor,
  resetToolContributorsForTests,
  type ToolContributor,
} from "../tool-contribution-registry";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";
import { commentsAgentToolCatalog } from "../../comments/agent-tools";

/** A minimal, valid `ToolRegistration` — enough to satisfy `buildAssistantToolRegistrations`'s own
 *  bookkeeping (it only reads `descriptor.id`); no test here executes a handler. */
function fakeRegistration(id: string): ToolRegistration {
  return {
    descriptor: { id, description: `fake tool ${id}`, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    handler: async () => ({ ok: true }),
    policy: { authorize: () => "allow" },
  };
}

/** A trivial contributor for exercising the registry mechanism itself, independent of any real
 *  domain's business logic. */
function fakeContributor(domain: string, toolIds: readonly string[]): ToolContributor {
  const risk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>(toolIds.map((id) => [id, "none"]));
  return { domain, build: () => toolIds.map(fakeRegistration), risk };
}

test.beforeEach(() => {
  resetToolContributorsForTests();
});

// ---------------------------------------------------------------------------
// 1. Registry mechanics — register/list/reset, replace-by-domain-key idempotency
// ---------------------------------------------------------------------------

test("a freshly reset registry has no contributors", () => {
  assert.deepEqual(listToolContributors(), []);
});

test("registerToolContributor appends in call order", () => {
  registerToolContributor(fakeContributor("alpha", ["alpha_one"]));
  registerToolContributor(fakeContributor("beta", ["beta_one"]));
  assert.deepEqual(listToolContributors().map((c) => c.domain), ["alpha", "beta"]);
});

test("re-registering the same domain REPLACES the earlier entry in place, not appends — idempotent per catalog instance", () => {
  registerToolContributor(fakeContributor("alpha", ["alpha_one"]));
  registerToolContributor(fakeContributor("beta", ["beta_one"]));
  registerToolContributor(fakeContributor("alpha", ["alpha_two"])); // replaces "alpha", position preserved

  const contributors = listToolContributors();
  assert.deepEqual(contributors.map((c) => c.domain), ["alpha", "beta"], "domain count/order must not change on replacement");
  assert.deepEqual(contributors[0].build({} as never, {} as never).map((r) => r.descriptor.id), ["alpha_two"]);
});

test("installFirstPartyToolContributors is idempotent — calling it twice leaves the registry in the same state as calling it once", () => {
  installFirstPartyToolContributors();
  const once = listToolContributors().map((c) => c.domain).sort();
  installFirstPartyToolContributors();
  const twice = listToolContributors().map((c) => c.domain).sort();
  assert.deepEqual(twice, once);
});

// ---------------------------------------------------------------------------
// 2. Exact installed contributors + deterministic order
// ---------------------------------------------------------------------------

test("installFirstPartyToolContributors installs exactly the converted domains — no more, no fewer", () => {
  installFirstPartyToolContributors();
  // Stage 1 (2026-08-17): comments, newsletter. Stage 2 batch 1 (same day): identity, members,
  // redirects, taxonomy. Stage 2 batch 2 (same day, run as two parallel worker groups): group A
  // did widgets, content-types, forms, menus, recovery, plugins, entries; group B did integrations,
  // workspace, pages, seo — see `server/tool-catalog-manifest.ts`'s own header for the running
  // count. `themes` was also tried in Stage 2 batch 1 and reverted (new module cycle through
  // `export`); `database` (group A) and `source-control`/`deployments`/`static-publish`/`media`
  // (group B) were all tried in Stage 2 batch 2 and reverted (see each one's own trailing comment
  // for its own cycle). `media` was retried in a later, separate pass this session — once
  // `widgets`'s own conversion above had merged and removed the static edge that caused the
  // original revert, `check:architecture` confirmed 0 module cycles with `media` converted too (see
  // `media/tool-registrations.ts`'s own header) — so it is now present below. `database` was ALSO
  // retried in a later, separate pass — once the one edge that closed its 16-module SCC
  // (`getDriftStatus`'s value import into `features/database`) was cut by relocating `drift.ts` into
  // `db/`, `check:architecture` confirmed 0 module cycles with `database` converted too (see
  // `features/database/tool-registrations.ts`'s own header) — so it is now present below as well.
  // `settings` is ALSO present below, but unlike every domain above it does NOT have its own
  // `contribute<Domain>Tools()` — `server/tool-catalog-manifest.ts`'s
  // `installFirstPartyToolContributors()` registers it inline instead, a deliberate one-off
  // exception (see that function's own DELIBERATE ONE-OFF EXCEPTION comment and
  // `ADS-memory/reports/architecture/2026-08-17-settings-blocker-investigation.md`): the standard
  // shape would reopen an `assistant <-> features/settings` cycle through 3 side-door files inside
  // `assistant/` itself. `themes`/`source-control`/`deployments`/`static-publish`/`post` remain
  // deliberately absent, each covered by its own test below.
  assert.deepEqual(listToolContributors().map((c) => c.domain), [
    "comments",
    "content-types",
    "database",
    "entries",
    "forms",
    "identity",
    "integrations",
    "media",
    "members",
    "menus",
    "newsletter",
    "pages",
    "plugins",
    "recovery",
    "redirects",
    "seo",
    "settings",
    "taxonomy",
    "widgets",
    "workspace",
  ]);
});

test("post is deliberately NOT installed by installFirstPartyToolContributors — it was tried and reverted the same night (see features/post/tool-registrations.ts's trailing comment: converting it opened a new module cycle through widgets/export)", () => {
  installFirstPartyToolContributors();
  assert.equal(listToolContributors().some((c) => c.domain === "post"), false);
});

test("themes is deliberately NOT installed by installFirstPartyToolContributors — it was tried in the Stage 2 batch and reverted the same night (see features/theme/tool-registrations.ts's trailing comment: converting it opened a new module cycle through export/features/deployments/features/source-control/features/vendor-credentials)", () => {
  installFirstPartyToolContributors();
  assert.equal(listToolContributors().some((c) => c.domain === "themes"), false);
});

test("database IS installed by installFirstPartyToolContributors — converted to the registry in a later pass than the test above's comment describes (see features/database/tool-registrations.ts's own header: the `getDriftStatus` edge that closed its 16-module SCC was cut by relocating drift.ts into db/, and check:architecture confirmed 0 cycles with database wired this way)", () => {
  installFirstPartyToolContributors();
  assert.equal(listToolContributors().some((c) => c.domain === "database"), true);
});

test("source-control is deliberately NOT installed by installFirstPartyToolContributors — tried in Stage 2 batch 2 and reverted the same session (see features/source-control/tool-registrations.ts's trailing comment: converting it closed a 3-module cycle through features/vendor-credentials)", () => {
  installFirstPartyToolContributors();
  assert.equal(listToolContributors().some((c) => c.domain === "source-control"), false);
});

test("deployments is deliberately NOT installed by installFirstPartyToolContributors — tried in Stage 2 batch 2 and reverted the same session (see features/deployments/tool-registrations.ts's trailing comment: converting it closed a 4-module cycle through features/source-control/features/vendor-credentials)", () => {
  installFirstPartyToolContributors();
  assert.equal(listToolContributors().some((c) => c.domain === "deployments"), false);
});

test("static-publish is deliberately NOT installed by installFirstPartyToolContributors — tried in Stage 2 batch 2 and reverted the same session for the identical reason as deployments above (see features/deployments/publish-agent-tools.ts's trailing comment: same features/deployments module)", () => {
  installFirstPartyToolContributors();
  assert.equal(listToolContributors().some((c) => c.domain === "static-publish"), false);
});

test("registration order is deterministic across repeated installs, not just stable within one", () => {
  installFirstPartyToolContributors();
  const first = listToolContributors().map((c) => c.domain);
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const second = listToolContributors().map((c) => c.domain);
  assert.deepEqual(second, first);
});

// ---------------------------------------------------------------------------
// 3. Duplicate-tool-id rejection — buildAssistantToolRegistrations refuses a shared id
//    regardless of whether both owners are legacy DOMAIN_SLICES entries or registry contributors
// ---------------------------------------------------------------------------

test("two registry contributors claiming the same tool id fail buildAssistantToolRegistrations, naming both domains", () => {
  registerToolContributor(fakeContributor("dup-a", ["shared_tool_id"]));
  registerToolContributor(fakeContributor("dup-b", ["shared_tool_id"]));

  assert.throws(
    () => buildAssistantToolRegistrations(createRouteDeps()),
    /'shared_tool_id' is registered by both the dup-a and dup-b domains/,
  );
});

test("a registry contributor colliding with a legacy DOMAIN_SLICES id fails the same way — the check does not care which seam registered which side", () => {
  // `content_post_list` is one of the legacy, still-statically-wired `post` domain's ids
  // (`features/post/tool-registrations.ts`) — colliding a fake contributor against it proves
  // the duplicate check spans both seams, not just registry-vs-registry or slice-vs-slice. (Was
  // `workspace_get`, then `database_get_health`, before Stage 2 batch 2 and this dispatch
  // respectively converted `workspace` and `database` onto the registry — switched again to a
  // domain that is still genuinely legacy, so this test keeps proving the cross-seam case rather
  // than silently becoming a registry-vs-registry collision, which the earlier test above already
  // covers. This test does NOT call `installFirstPartyToolContributors()`, so it does not depend on
  // `post` staying unconverted forever — it just needs SOME id from a currently-legacy
  // `DOMAIN_SLICES` entry; whichever domain that is next, update this comment and id together.)
  registerToolContributor(fakeContributor("impersonator", ["content_post_list"]));

  assert.throws(() => buildAssistantToolRegistrations(createRouteDeps()), /'content_post_list' is registered by both the post and impersonator domains/);
});

// ---------------------------------------------------------------------------
// 4. Omitted-contributor failure — a tool whose contributor was never installed is refused as
//    unclassified, never silently treated as safe (the same guard `contracts.test.ts` exercises
//    generically, pinned here specifically against the registry seam's own omission case)
// ---------------------------------------------------------------------------

test("a real catalog entry from a NOT-installed contributor fails assertRiskMetadataIsWirable — omission is a loud failure, not a silent pass", () => {
  // Registry left empty by `beforeEach` above — comments was never installed in this test.
  const entry = commentsAgentToolCatalog.find((tool) => tool.name === "comments_approve_comment");
  assert.ok(entry, "sanity: the catalog entry itself still exists independent of wiring");

  assert.throws(() => assertRiskMetadataIsWirable("comments_approve_comment", entry!), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
});

test("installing the contributor afterward makes the same id wirable — proving the failure above was about installation state, not something else", async () => {
  const { contributeCommentsTools } = await import("../../comments/tool-registrations");
  const entry = commentsAgentToolCatalog.find((tool) => tool.name === "comments_approve_comment")!;

  assert.throws(() => assertRiskMetadataIsWirable("comments_approve_comment", entry));
  contributeCommentsTools();
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("comments_approve_comment", entry));
});

// ---------------------------------------------------------------------------
// 5. Daemon/BYOK catalog parity — two independent `buildAssistantToolRegistrations` calls, made the
//    same way the two real composition roots make them, must agree exactly
// ---------------------------------------------------------------------------

test("two independent buildAssistantToolRegistrations calls after one installFirstPartyToolContributors() see the identical tool-id set — daemon and BYOK must never drift apart", async () => {
  installFirstPartyToolContributors();

  // Two separately-constructed deps bags, mirroring `agent-daemon-server.ts` and
  // `assistant-byok.ts`/`byok-tool-surface.ts` each building their own `routeDeps` independently
  // rather than sharing one instance across processes.
  const daemonLikeDeps = createRouteDeps();
  await daemonLikeDeps.identityReady;
  const byokLikeDeps = createRouteDeps();
  await byokLikeDeps.identityReady;

  const daemonIds = buildAssistantToolRegistrations(daemonLikeDeps).map((r) => r.descriptor.id).sort();
  const byokIds = buildAssistantToolRegistrations(byokLikeDeps).map((r) => r.descriptor.id).sort();

  assert.deepEqual(byokIds, daemonIds);
  // And specifically includes the registry-contributed domains, not just parity on whatever
  // DOMAIN_SLICES already provided — a parity check that passed vacuously (both empty) would not
  // prove anything about THIS seam.
  assert.ok(daemonIds.includes("comments_approve_comment"));
  assert.ok(daemonIds.includes("newsletter_list_campaigns"));
  // Stage 2 batch 1's four converted domains — same proof, extended to cover them too.
  assert.ok(daemonIds.some((id) => id.startsWith("identity_")));
  assert.ok(daemonIds.includes("members_list"));
  assert.ok(daemonIds.includes("redirects_list"));
  assert.ok(daemonIds.includes("taxonomy_list"));
  // Stage 2 batch 2's converted domains (both worker groups) — same proof, extended to cover them too.
  assert.ok(daemonIds.includes("widgets_list_instances"));
  assert.ok(daemonIds.includes("collections_content_type_list"));
  assert.ok(daemonIds.some((id) => id.startsWith("forms_")));
  assert.ok(daemonIds.includes("menus_list_menus"));
  assert.ok(daemonIds.includes("backup_list_restore_points"));
  assert.ok(daemonIds.includes("plugins_list"));
  assert.ok(daemonIds.includes("collections_entry_list"));
  assert.ok(daemonIds.includes("integrations_list_subscriptions"));
  assert.ok(daemonIds.includes("workspace_get"));
  assert.ok(daemonIds.includes("pages_read_html"));
  assert.ok(daemonIds.includes("seo_get_entry_meta"));
  // `media`, converted in a later, separate pass this session (retried after `widgets`'s own
  // conversion above had merged) — same proof, extended to cover it too.
  assert.ok(daemonIds.includes("media_list_assets"));
});
