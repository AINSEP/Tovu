import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
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

import type { AgentToolSideEffect, DerivedRiskByToolId } from "@jini-ai/core";
import type { ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { type ToolContributor } from "../tool-contribution-registry.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";
import { commentsAgentToolCatalog } from "../../features/comments/agent-tools.js";
import { DEMO_CHOICES_TOOL_ID } from "../demo-choices-tool.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

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
  contributions.contributors.clear({});
});

// ---------------------------------------------------------------------------
// 1. Registry mechanics — register/list/reset, replace-by-domain-key idempotency
// ---------------------------------------------------------------------------

test("a freshly reset registry has no contributors", () => {
  assert.deepEqual(contributions.contributors.list({}), []);
});

test("registerToolContributor appends in call order", () => {
  contributions.contributors.register({ contribution: fakeContributor("alpha", ["alpha_one"]) });
  contributions.contributors.register({ contribution: fakeContributor("beta", ["beta_one"]) });
  assert.deepEqual(contributions.contributors.list({}).map((c) => c.domain), ["alpha", "beta"]);
});

test("re-registering the same domain REPLACES the earlier entry in place, not appends — idempotent per catalog instance", () => {
  contributions.contributors.register({ contribution: fakeContributor("alpha", ["alpha_one"]) });
  contributions.contributors.register({ contribution: fakeContributor("beta", ["beta_one"]) });
  contributions.contributors.register({ contribution: fakeContributor("alpha", ["alpha_two"]) }); // replaces "alpha", position preserved

  const contributors = contributions.contributors.list({});
  assert.deepEqual(contributors.map((c) => c.domain), ["alpha", "beta"], "domain count/order must not change on replacement");
  assert.deepEqual(contributors[0].build({} as never, {} as never).map((r) => r.descriptor.id), ["alpha_two"]);
});

test("installFirstPartyToolContributors is idempotent — calling it twice leaves the registry in the same state as calling it once", () => {
  installFirstPartyToolContributors({ contributions });
  const once = contributions.contributors.list({}).map((c) => c.domain).sort();
  installFirstPartyToolContributors({ contributions });
  const twice = contributions.contributors.list({}).map((c) => c.domain).sort();
  assert.deepEqual(twice, once);
});

// ---------------------------------------------------------------------------
// 2. Exact installed contributors + deterministic order
// ---------------------------------------------------------------------------

test("installFirstPartyToolContributors installs exactly the converted domains — no more, no fewer", () => {
  installFirstPartyToolContributors({ contributions });
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
  // `assistant/` itself. `source-control` is ALSO present below — retried once
  // `features/vendor-credentials/dual-read.ts`'s two legacy-table imports were injected instead of
  // value-imported (Option B,
  // `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md`), which
  // removed the `features/vendor-credentials -> features/source-control` edge that closed its
  // original 3-module cycle — see `features/source-control/tool-registrations.ts`'s own header.
  // `deployments`/`static-publish` are ALSO present below — retried together once
  // `features/vendor-credentials/store.ts`'s own `extractGitHubLogin` import was ALSO injected
  // instead of value-imported (a second, previously-undocumented edge Option B alone did not cover)
  // — see `features/deployments/tool-registrations.ts`'s own header. The two convert in lockstep,
  // not independently: `check:architecture`'s module graph is per-directory and both live in the
  // same `features/deployments` module, so either one alone (with the other still value-imported
  // from `assistant`) still closes a live 2-module `[assistant, features/deployments]` cycle.
  // `themes` is ALSO present below — retried once `deployments`/`static-publish` above left
  // `assistant` without any transitive path into `export` (see
  // `features/theme/tool-registrations.ts`'s own header for the full trace, including its two prior
  // reverts). `post` is ALSO present below — converted last of the 25 (`fc8ad2a6`), covered by its
  // own test below, which was updated at the same time as this list.
  //
  // A "capability" entry (2026-08-22) used to be listed below too — a single tool PAIR
  // (`capability_search`/`capability_get`), not a per-domain catalog. REMOVED 2026-08-26 (owner
  // call): every installed Agent Plugin now gets its own real `agent_plugin_<pluginId>` tool
  // instead. See `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.
  //
  // `site-inspection` (2026-08-26) is present below as a NEW domain, not a 26th entry in that
  // rollout: it never existed before, so nothing about it was ever wired through `DOMAIN_SLICES`
  // and there is no cycle history to record. It contributes three tools — `site_get_profile`,
  // `fetch_published_page` and (2026-09-15) `site_describe_capabilities` — and imports no other
  // feature by name — every read is an injected port bound in `features/site-inspection/deps.ts`
  // (including `site_describe_capabilities`' registry reader, which each registry-owning root binds
  // to its own registry), so it adds no runtime edge beyond the
  // `features/site-inspection -> assistant` one every contributor has.
  //
  // "site-evidence" (2026-08-26) is also not part of the 25-domain rollout: it is a genuinely NEW
  // first-party domain (`features/site-evidence`), added because a configuration snapshot cannot
  // establish what a published page actually renders. It carries exactly one tool,
  // `site_collect_page_evidence`, wired through the standard `contributeSiteEvidenceTools()` shape
  // with its own `agent-tools.ts` catalog — an ordinary domain, just one that did not exist when
  // the rollout was counted.
  //
  // "media-generation" (2026-09-02) is likewise NOT a 5th entry on `media`'s own 4-tool catalog: it
  // is a genuinely NEW first-party domain (`features/media-generation`), added to close the "the
  // assistant can upload an image but cannot GENERATE one" gap with one tool,
  // `media_generate_asset`. Kept separate from `media` specifically because `media`'s catalog is
  // `@jini-ai/cms`-owned (shared across every host of that package, with its own "wire the ENTIRE
  // catalog" tripwire test), while this tool's whole pipeline — Tovu's saved-credential store, the
  // vendor dispatch engine, Tovu's own ADR-027 URL contract — is host-specific glue, the same
  // category `custom-credentials`/`site-inspection`/`site-evidence` above already established.
  // NOTE (2026-09-09): four of these entries — `content-duplication`, `external-mcp`, `media-import`,
  // `sites` — were ALREADY missing from this list before `agent-plugin-search` was added (each their
  // own domain's own `tool-catalog-manifest.ts` addition landed without this assertion being updated
  // to match, the exact drift class this test exists to catch). Added here opportunistically while
  // fixing this list for `agent-plugin-search` — not introduced by, and not otherwise in scope for,
  // that addition. See `features/agent-plugins/tool-registrations.ts`'s own "search_agent_plugin_local"
  // section header for what `agent-plugin-search` itself contributes.
  assert.deepEqual(contributions.contributors.list({}).map((c) => c.domain), [
    // 2026-10-03 (landed in 5ec1a964d): content stats, analytics and system-mail status reads,
    // registered first in `installFirstPartyToolContributors`. Each its own domain key.
    "content-stats",
    "analytics",
    "system-mail",
    "system-server-logs",
    "identity-policy-list-permissions",
    "sites-list",
    "publish-content-disconnect",
    "theme-set-page-published",
    "agent-plugin-search",
    // 2026-09-27 (S-G1, 1ec285153): `agent_plugin_connect`, the generic "connect this plugin's
    // account" tool (`features/agent-plugins/tool-registrations.ts`).
    "agent-plugin-connect",
    // "agent-plugin-uninstall" was REMOVED 2026-09-24 (S4, b4ff558c6): its Agent Plugin branch is now
    // reached through `plugins_uninstall` (`plugins` below, family: "agent-plugin").
    "comments",
    "content-duplication",
    "content-types",
    "custom-credentials",
    "database",
    // 2026-09-27: `database_transfer_plan`/`database_transfer_run` (`features/database-transfer`).
    "database-transfer",
    "deployments",
    // 2026-10-03 (landed in 5ec1a964d): deploy operations, its own key beside `deployments`.
    "deploy-ops",
    "domain-dns",
    "entries",
    "external-mcp",
    "external-mcp-operations",
    "fs-files",
    "forms",
    "identity",
    "integrations",
    "media",
    // 2026-10-01 (82d2be726): `media_view_image`, its own key so it does not replace `media`'s
    // `@jini-ai/cms`-owned catalog.
    "media-view",
    "media-video-view",
    "media-generation",
    // 2026-10-03 (landed in 5ec1a964d): media-generation provider tools, own key.
    "media-providers",
    "media-import",
    "members",
    "menus",
    "newsletter",
    "newsletter-delivery",
    "pages",
    "plugins",
    // 2026-10-05: confirmed installs, each its own domain beside the tools they feed.
    "plugins-install",
    "agent-plugins-install",
    "skills-install",
    "post",
    // 2026-10-03 (landed in 5ec1a964d): post preview rendering, own key beside `post`.
    "post-preview",
    // 2026-09-19: the three publishing tools — "is publishing set up", "set it up", "publish".
    // A NEW domain rather than an entry in the 25-domain rollout: `features/publish-content` had no
    // agent-tool surface at all until this, which is the gap that made publishing undiscoverable to
    // an assistant. See its own `agent-tools.ts` header.
    "publish-content",
    "recovery",
    "redirects",
    "seo",
    "settings",
    "settings-ui-locales",
    // 2026-09-21: `site_backup_plan`/`site_backup_push` (`features/site-backup`).
    "site-backup",
    "site-evidence",
    "site-inspection",
    "sites",
    "source-control",
    "static-publish",
    "credential-save",
    "taxonomy",
    "themes",
    // 2026-09-24: `theme_set_active` (F7a, ca9f97328) and `change_sets_list`/`change_sets_revert`
    // (F7b S6, e6d6963f0) — each its own domain key, registered right after `themes` (this list is
    // registration order, not alphabetical).
    "theme-set-active",
    "change-sets",
    // 2026-10-01 (ee5629af7, owner Q1): human-confirmed permanent deletes through the authenticated
    // human-confirm exchange. This supersedes the "no purge tool, ever" line in the `trash` note
    // below: the agent still cannot purge without the human's own confirmation.
    "permanent-delete",
    // 2026-09-20: the local admin Trash — `trash_list_items` and `trash_restore_item`, and
    // deliberately nothing else. A NEW domain (`features/trash`), not an entry in the 25-domain
    // rollout. There is no purge tool and there must never be one: permanent deletion is
    // human-only, from the Trash screen's confirm modal. See its own `agent-tools.ts` header and
    // `features/trash/__tests__/tool-registrations.purge-ban.test.ts`.
    "trash",
    "widgets",
    "workspace",
  ]);
});

// UPDATED 2026-08-17: this test previously asserted the OPPOSITE — that `post` is deliberately NOT
// installed, because an early conversion attempt was reverted the same night (it opened a new module
// cycle through `widgets`/`export`). That reverted attempt is history: `post` was converted for real
// in `fc8ad2a6` as the LAST of the 25 domains, once `listPublishedPosts` was injected rather than
// reimplemented (`PostRepoPort.list()` is status-blind, so that filter is the only thing keeping
// draft/trashed posts away from anonymous visitors — see
// `ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md`). The
// rollout is 25/25 with zero exceptions and `check:architecture` reports 0 cycles / 0 largest SCC
// with `post` wired this way. The assertion was simply never flipped when that landed, so this test
// failed against correct code for a day — a stale test, not a regression.
test("post IS installed by installFirstPartyToolContributors — the final conversion of the 25/25 registry rollout, after an earlier attempt was reverted (see features/post/tool-registrations.ts's own header)", () => {
  installFirstPartyToolContributors({ contributions });
  assert.equal(contributions.contributors.list({}).some((c) => c.domain === "post"), true);
});

test("database IS installed by installFirstPartyToolContributors — converted to the registry in a later pass than the test above's comment describes (see features/database/tool-registrations.ts's own header: the `getDriftStatus` edge that closed its 16-module SCC was cut by relocating drift.ts into db/, and check:architecture confirmed 0 cycles with database wired this way)", () => {
  installFirstPartyToolContributors({ contributions });
  assert.equal(contributions.contributors.list({}).some((c) => c.domain === "database"), true);
});

test("source-control IS installed by installFirstPartyToolContributors — retried once dual-read.ts's legacy-table imports were injected instead of value-imported (see features/source-control/tool-registrations.ts's own header, and ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md)", () => {
  installFirstPartyToolContributors({ contributions });
  assert.equal(contributions.contributors.list({}).some((c) => c.domain === "source-control"), true);
});

test("deployments IS installed by installFirstPartyToolContributors — retried once vendor-credentials/store.ts's own extractGitHubLogin import was ALSO injected instead of value-imported (see features/deployments/tool-registrations.ts's own header)", () => {
  installFirstPartyToolContributors({ contributions });
  assert.equal(contributions.contributors.list({}).some((c) => c.domain === "deployments"), true);
});

test("static-publish IS installed by installFirstPartyToolContributors — retried and landed together with deployments above (see features/deployments/publish-agent-tools.ts's own header: the two share the same features/deployments module, so check:architecture required converting both together)", () => {
  installFirstPartyToolContributors({ contributions });
  assert.equal(contributions.contributors.list({}).some((c) => c.domain === "static-publish"), true);
});

test("themes IS installed by installFirstPartyToolContributors — retried once deployments/static-publish above left assistant without any transitive path into export (see features/theme/tool-registrations.ts's own header for the full trace, including its two prior reverts)", () => {
  installFirstPartyToolContributors({ contributions });
  assert.equal(contributions.contributors.list({}).some((c) => c.domain === "themes"), true);
});

test("registration order is deterministic across repeated installs, not just stable within one", () => {
  installFirstPartyToolContributors({ contributions });
  const first = contributions.contributors.list({}).map((c) => c.domain);
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const second = contributions.contributors.list({}).map((c) => c.domain);
  assert.deepEqual(second, first);
});

// ---------------------------------------------------------------------------
// 3. Duplicate-tool-id rejection — buildAssistantToolRegistrations refuses a shared id
//    regardless of whether both owners are legacy DOMAIN_SLICES entries or registry contributors
// ---------------------------------------------------------------------------

test("two registry contributors claiming the same tool id fail buildAssistantToolRegistrations, naming both domains", () => {
  contributions.contributors.register({ contribution: fakeContributor("dup-a", ["shared_tool_id"]) });
  contributions.contributors.register({ contribution: fakeContributor("dup-b", ["shared_tool_id"]) });

  assert.throws(
    () => buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: createRouteDeps() }), undefined, { contributions }),
    /'shared_tool_id' is registered by both the dup-a and dup-b domains/,
  );
});

test("a registry contributor colliding with a legacy DOMAIN_SLICES id fails the same way — the check does not care which seam registered which side", () => {
  // This test needs SOME tool id from a domain still wired the LEGACY way (a `DOMAIN_SLICES` entry),
  // so that colliding a fake registry contributor against it proves the duplicate check spans BOTH
  // seams — not just registry-vs-registry, which the test above already covers.
  //
  // That id has had to move four times as the rollout advanced: `workspace_get` -> `database_get_health`
  // -> `content_post_list` -> here. The 2026-08-17 rollout finished at 25/25, which retired the last
  // real legacy domain (`post`) and left `DOMAIN_SLICES` holding ONLY the two env-gated demo slices.
  // So `content_post_list` stopped colliding with anything and this test failed against correct code
  // — a stale test, not a regression, and ours: completing our own rollout is what invalidated it.
  //
  // `demo-choices` is now the only non-demo-free option, and it is a genuine `DOMAIN_SLICES` entry,
  // so the cross-seam property this test exists to prove is still really being proven. It used to
  // need a `TOVU_ENABLE_DEMO_TOOLS` set/restore around this body; that gate was removed on
  // 2026-08-26 (see `demo-choices-tool.ts`'s header) and the slice now registers unconditionally,
  // so the fixture is just the real registration list.
  //
  // If the in-chat UI slices are ever removed too, `DOMAIN_SLICES` becomes empty and the legacy seam
  // ceases to exist — at which point DELETE this test rather than contriving a fixture for it. A
  // test that proves a seam still behaves correctly is worthless once there is no seam.
  contributions.contributors.register({ contribution: fakeContributor("impersonator", [DEMO_CHOICES_TOOL_ID]) });
  assert.throws(() => buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: createRouteDeps() }), undefined, { contributions }), /'assistant_demo_choices' is registered by both the demo-choices and impersonator domains/);
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

  assert.throws(() => assertRiskMetadataIsWirable("comments_approve_comment", entry!, contributions), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
});

test("installing the contributor afterward makes the same id wirable — proving the failure above was about installation state, not something else", async () => {
  const { contributeCommentsTools } = await import("../../features/comments/tool-registrations.js");
  const entry = commentsAgentToolCatalog.find((tool) => tool.name === "comments_approve_comment")!;

  assert.throws(() => assertRiskMetadataIsWirable("comments_approve_comment", entry, contributions));
  contributions.contributors.register({ contribution: contributeCommentsTools() });
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("comments_approve_comment", entry, contributions));
});

// ---------------------------------------------------------------------------
// 5. Daemon/BYOK catalog parity — two independent `buildAssistantToolRegistrations` calls, made the
//    same way the two real composition roots make them, must agree exactly
// ---------------------------------------------------------------------------

// 2026-09-27 — vendor logic lives in `content/agent-plugins/<id>/`, not core. The Supabase-only
// `supabase_get_database` prototype (a679de93d) out-competed the generic
// `agent_plugin_connect { pluginId: "supabase" }` in a live test because its wording was more
// attractive to the model; it was deleted, and so was the one-project picker
// `supabase_set_project_scope` (the plugin works account-wide). The token fallback
// `supabase_set_access_token` became the generic `agent_plugin_set_access_token` on 2026-09-29, and
// `features/supabase-connect/` was deleted. This list stays empty.
const SUPABASE_TOOLS_STILL_IN_CORE: readonly string[] = [];

test("core registers no Supabase-specific connect tool — the generic agent_plugin_connect is the only way in", async () => {
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const ids = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: deps }), undefined, { contributions }).map((r) => r.descriptor.id);

  assert.ok(ids.includes("agent_plugin_connect"), "the generic Agent Plugin Connect tool must stay registered");
  assert.ok(!ids.includes("supabase_get_database"), "supabase_get_database must not be registered");
  assert.deepEqual(
    ids.filter((id) => id.startsWith("supabase_")).sort(),
    [...SUPABASE_TOOLS_STILL_IN_CORE].sort().filter((id) => ids.includes(id)),
    "a supabase_* tool outside the shrinking allow list is registered in core",
  );
});

test("daemon construction statements and the real BYOK root independently build the identical tool-id set", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createAssistantByokModule } = await import("../../server/runtime/composition/modules/assistant-byok.js");
  const { buildDaemonToolSurface } = await import("../../server/inbound/assistant/__tests__/helpers/daemon-tool-surface.js");
  const root = await mkdtemp(join(tmpdir(), "tovu-root-parity-"));
  const previous = [process.env.TOVU_AGENT_PLUGINS_DIR, process.env.TOVU_SKILLS_DIR];
  process.env.TOVU_AGENT_PLUGINS_DIR = join(root, "plugins");
  process.env.TOVU_SKILLS_DIR = join(root, "skills");
  t.after(async () => {
    for (const [index, key] of ["TOVU_AGENT_PLUGINS_DIR", "TOVU_SKILLS_DIR"].entries()) {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }
    await rm(root, { recursive: true, force: true });
  });
  const daemonDeps = createRouteDeps();
  await daemonDeps.identityReady;
  const byokDeps = createRouteDeps();
  await byokDeps.identityReady;
  const daemonRegistry = await buildDaemonToolSurface(daemonDeps);
  const byok = createAssistantByokModule(byokDeps);
  await byok.toolSurface.ready;
  const daemonIds = daemonRegistry.list({}).map(({ id }) => id).sort();
  const byokIds = byok.toolSurface.registry.list({}).map(({ id }) => id).sort();

  assert.deepEqual(byokIds, daemonIds);
  // And specifically includes the registry-contributed domains, not just parity on whatever
  // DOMAIN_SLICES already provided — a parity check that passed vacuously (both empty) would not
  // prove anything about THIS seam.
  // Several of these probes name `content_read.<resource>` cards: the 2026-09-08 collapse
  // (assistant/content-read-tool.ts) replaces each domain's Tier-1 read tool with one in the FINAL
  // wired list, which is exactly the list this test builds. The probe still proves the same thing —
  // that domain contributed through the registry seam — because a card only exists at all when its
  // member tool was contributed.
  assert.ok(daemonIds.includes("comments_approve_comment"));
  assert.ok(daemonIds.includes("content_read.newsletter_campaign"));
  // Stage 2 batch 1's four converted domains — same proof, extended to cover them too.
  assert.ok(daemonIds.some((id) => id.startsWith("identity_")));
  assert.ok(daemonIds.includes("content_read.member"));
  assert.ok(daemonIds.includes("content_read.redirect"));
  assert.ok(daemonIds.includes("content_read.taxonomy"));
  // Stage 2 batch 2's converted domains (both worker groups) — same proof, extended to cover them too.
  assert.ok(daemonIds.includes("content_read.widget_instance"));
  assert.ok(daemonIds.includes("content_read.collection_content_type"));
  assert.ok(daemonIds.some((id) => id.startsWith("forms_")));
  assert.ok(daemonIds.includes("content_read.menu"));
  assert.ok(daemonIds.includes("content_read.backup_restore_point"));
  assert.ok(daemonIds.includes("content_read.plugin"));
  assert.ok(daemonIds.includes("content_read.collection_entry"));
  assert.ok(daemonIds.includes("content_read.webhook_subscription"));
  assert.ok(daemonIds.includes("content_read.workspace"));
  assert.ok(daemonIds.includes("pages_read_html"));
  assert.ok(daemonIds.includes("content_read.seo_entry_meta"));
  // `media`, converted in a later, separate pass this session (retried after `widgets`'s own
  // conversion above had merged) — same proof, extended to cover it too.
  assert.ok(daemonIds.includes("content_read.media_asset"));
});
