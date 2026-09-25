import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import {
  listDuplicateResourceHandlers,
  resetDuplicateResourceHandlersForTests,
} from "#src/assistant/duplicate-resource-registry";
import {
  listPublishContentContributors,
  resetPublishContentContributorsForTests,
} from "#src/features/publish-content/type-registry";
import { attachAssistantToolExtensions } from "#src/assistant/installed-extension-tools";
import { buildExternalMcpFederationDeps } from "#src/assistant/external-mcp-connection-source";

import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";

import { createRouteDeps } from "../app.js";
import { createAssistantByokModule } from "../modules/assistant-byok.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

/**
 * @file Architecture pass P1 (2026-09-24, `ADS-memory/.local-artifacts/architecture-pass-2026-09-24.md`
 * C1/C8): several process roots — `createApp` (via `createAssistantByokModule`, which it builds
 * directly, see `app.ts:1724`), the in-process BYOK host (`modules/assistant-byok.ts`), and the
 * spawned agent daemon (`agent-daemon-server.ts`) — each build their own tool registry and
 * publish-content type registry from the SAME module-level registration singletons
 * (`assistant/tool-contribution-registry.ts`, `assistant/duplicate-resource-registry.ts`,
 * `features/publish-content/type-registry.ts`), which start empty every process boot. Nothing
 * asserted the three roots end up with the same registries — that gap is exactly what shipped
 * f0cfd0c67 (the daemon never registered publish-content types, so the assistant said "nothing to
 * publish" on a site with 33 pages and 6 posts; regression-pinned separately in
 * `tool-catalog-publish-content-types.test.ts`).
 *
 * This file is the general parity test: it builds the tool id set, the publish-content type set, and
 * the duplicate-resource-handler set through (a) the shared `installFirstPartyToolContributors()` +
 * `buildAssistantToolRegistrations()` base every root calls, (b) `createAssistantByokModule`'s real
 * surface (the exact object `createApp` builds at `app.ts:1724` and `assistant-byok.ts`'s own real
 * caller), and (c) a faithful replay of the agent daemon's own boot order
 * (`agent-daemon-server.ts:395-444`), and asserts they are equal — modulo the ONE documented,
 * commented gap below. No production call site changes in this slice; this file only reads the
 * existing registration seams.
 */

// Empty as of the F4a fix (`ADS-memory/.local-artifacts/fix-plan-tool-design-2026-09-24.md`, S1):
// `createAssistantByokModule`'s surface now calls the identical `registerInstalledExtensionTools`
// pass (`assistant/installed-extension-tools.ts`) the daemon does — see `buildByokRole`'s own
// `await byok.toolSurface.ready` below — so the agent-plugin/skill/capability families that used to
// be daemon-only are no longer a documented gap. Kept as a named, typed allow-list (rather than
// deleted outright) so a REAL future daemon-only id has somewhere to be recorded with a reason,
// exactly like the one entry it used to hold.
const KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS: ReadonlySet<string> = new Set([]);

/**
 * RESOLVED (owner ruling, architecture pass P1 finding C1 — closed 2026-09-24, S1 above closed the
 * installed-extension-tools third of this gap; `design-byok-external-mcp-2026-09-24.md`'s S1-S6
 * closed the rest): `assistant-byok.ts`'s `createAssistantByokModule` (and therefore `createApp`,
 * which builds its BYOK surface through it) now calls the SAME `attachAssistantToolExtensions`
 * (`assistant/installed-extension-tools.ts`) the daemon calls (`agent-daemon-server.ts`'s own
 * `start()`), which in turn calls `registerInstalledAgentPluginTools`, `registerInstalledSkillTools`,
 * and `registerEnabledPluginCapabilityTools`, THEN builds (but does not start) a `FederationRuntime` —
 * a BYOK chat can now see an installed Agent Plugin's tool, an installed Agent Skill's tool, an
 * enabled plugin-runtime capability tool (proven below with a real installed-skill fixture — with
 * zero skills installed the two builds would coincidentally agree either way, which would hide
 * exactly the drift this file exists to catch — and, for `search_tools` specifically, the dedicated
 * "BYOK's search_tools catalog finds an installed skill" test further down), and, once a turn awaits
 * `ByokToolSurface.awaitFederation`, the owner's connected external MCP servers and the Supabase
 * preset too. `federation.started === false` immediately after construction (proven in the
 * dedicated federation test below) is what makes this free at boot: BYOK starts federation lazily
 * on the first API-mode turn instead of the daemon's eager `start()`-time admission, per
 * `installed-extension-tools.ts`'s own header.
 *
 * `KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS` stays empty, but for a narrower reason than before: this file's
 * `buildByokRole`/`buildDaemonRole` replays never call `federation.start()` on either side (a real
 * admission needs a live MCP subprocess, out of scope for a unit test), so no `mcp__`-prefixed
 * federated id is ever contributed to either role's snapshot here today — there is no live gap left
 * to allow-list, only an untested one. If this file ever grows an in-memory federation fixture that
 * admits a connection on one side and not the other, any resulting id must be resolved here the same
 * way any other drift would be, not added to this allow-list by default.
 */

async function withEmptyAgentPluginsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-process-root-parity-agent-plugins-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

const INCIDENT_RESPONSE_SKILL_MD = `---
name: incident-response
version: 1.0.0
description: Use when handling production incidents, defining severity and escalation, writing runbooks, or facilitating blameless post-mortems and SLO-driven follow-up.
---

# Skill: Incident Response

Use this for production outages, degraded services, rollback decisions, runbooks, and post-mortems.
`;

/**
 * Isolates `TOVU_SKILLS_DIR` to a fresh, empty temp dir — the skills-side counterpart to
 * {@link withEmptyAgentPluginsDir}. Needed as of S1 (`registerInstalledExtensionTools`, F4a): BYOK now
 * reads BOTH the real agent-plugins tree AND the real skills tree for `routeDeps.workspaceId`, and
 * this repo's dev checkout has real installed content for that workspace on disk
 * (`sites/tovu-com/skills/ws/workspace-local/incident-response/` — the SAME id this file's own
 * `withOneInstalledSkill` fixture uses, confirmed empirically, not assumed). Without this, the
 * "identical sets" test below would pick up that real skill (and the daemon-only replay's real
 * agent-plugins) as spurious BYOK-only ids that `buildBaseRole` never had, failing for a reason that
 * has nothing to do with this file's own fixtures.
 */
async function withEmptySkillsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-process-root-parity-skills-empty-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_SKILLS_DIR;
    else process.env.TOVU_SKILLS_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

async function withOneInstalledSkill<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-process-root-parity-skills-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = dir;
  try {
    const skillDir = path.join(dir, "ws", workspaceId, "incident-response");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), INCIDENT_RESPONSE_SKILL_MD, "utf8");
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_SKILLS_DIR;
    else process.env.TOVU_SKILLS_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

interface RoleSnapshot {
  readonly ids: ReadonlySet<string>;
  readonly publishContentTypes: readonly string[];
  readonly duplicateResources: readonly string[];
}

function currentPublishContentTypes(): readonly string[] {
  return listPublishContentContributors()
    .map((c) => c.entityType)
    .sort();
}

function currentDuplicateResources(): readonly string[] {
  return listDuplicateResourceHandlers()
    .map((c) => c.resource)
    .sort();
}

/** (a) The shared base every real root calls before building its own registry — see
 *  `tool-catalog-manifest.ts`'s own header, "Real callers". */
function buildBaseRole(routeDeps: NewsletterRouteDeps): RoleSnapshot {
  resetToolContributorsForTests();
  resetPublishContentContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  installFirstPartyToolContributors();
  const ids = new Set(buildAssistantToolRegistrations(routeDeps).map((r) => r.descriptor.id));
  return { ids, publishContentTypes: currentPublishContentTypes(), duplicateResources: currentDuplicateResources() };
}

/** (b) The real `createAssistantByokModule` surface — the exact object `createApp` builds at
 *  `app.ts:1724` and hands to both the admin BYOK route and the daemon-proxy's redemption store.
 *  Awaits `toolSurface.ready` before reading the registry, so the installed-extension-tools pass
 *  (S1's fix) has already been applied — the same wait `modules/assistant-byok.ts`'s real turn route
 *  performs once per boot; see `ByokToolSurface.ready`'s own doc. */
async function buildByokRole(routeDeps: NewsletterRouteDeps): Promise<RoleSnapshot> {
  resetToolContributorsForTests();
  resetPublishContentContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  const byok = createAssistantByokModule(routeDeps); // calls installFirstPartyToolContributors() itself
  await byok.toolSurface.ready;
  const ids = new Set(byok.toolSurface.registry.list().map((d) => d.id));
  return { ids, publishContentTypes: currentPublishContentTypes(), duplicateResources: currentDuplicateResources() };
}

/** (c) A faithful replay of the daemon's own boot order (`agent-daemon-server.ts`'s `start()`, the
 *  `attachAssistantToolExtensions` call around `:1227-1255`): the same base, PLUS the SAME shared
 *  registrar `buildByokRole` above awaits through `toolSurface.ready` — not a second, hand-copied
 *  call to the three families it wraps. That is the point of this change: before, this function
 *  called `registerInstalledAgentPluginTools`/`registerInstalledSkillTools`/
 *  `registerEnabledPluginCapabilityTools` directly, with its OWN fail-open try/catch around each,
 *  which could silently drift from the daemon's real call the moment that call's own
 *  ordering/fail-open behavior changed; now both sides call `attachAssistantToolExtensions`, whose
 *  `installed` promise (`registerInstalledExtensionTools`) owns that fail-open behavior once, for
 *  every caller. `federation` is built here (a required part of that call's deps) but deliberately
 *  never started — no `.start()` — so `resolveConnections` below is structurally required but never
 *  actually invoked: a real admission needs a live MCP subprocess, out of scope for a unit test, and
 *  is exactly the documented non-gap the rewritten TODO above explains. Real in-memory deps
 *  (`createRouteDeps()`'s `composePluginRuntime`), not disk-backed, for the plugin-capability family
 *  — no fixture needed, and no plugin-runtime plugin is enabled by default, so it contributes zero
 *  ids today; exercised anyway so a future enabled capability plugin is covered by this same replay. */
async function buildDaemonRole(routeDeps: NewsletterRouteDeps): Promise<RoleSnapshot> {
  resetToolContributorsForTests();
  resetPublishContentContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(routeDeps)) registry.register(registration);

  const extensions = attachAssistantToolExtensions(
    registry,
    {
      ...routeDeps,
      federation: {
        deps: buildExternalMcpFederationDeps({
          authorize: routeDeps.authorize,
          workspaceId: routeDeps.workspaceId,
          repo: routeDeps.externalMcpServerRepo,
        }),
        // Never invoked: `federation.start()`/`.reload()` are the only callers, and neither is
        // called in this replay — see this function's own doc.
        resolveConnections: () => Promise.resolve([]),
      },
    },
    "[agent-daemon]",
  );
  await extensions.installed;

  const ids = new Set(registry.list().map((d) => d.id));
  return { ids, publishContentTypes: currentPublishContentTypes(), duplicateResources: currentDuplicateResources() };
}

test("the shared base (installFirstPartyToolContributors + buildAssistantToolRegistrations) and the real BYOK module build the identical tool id, publish-content-type, and duplicate-resource-handler sets", async () => {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  const base = buildBaseRole(routeDeps);
  // `base` never calls the installed-extension-tools registrars, so it can never see this dev
  // checkout's own real installed agent-plugins/skills for `routeDeps.workspaceId` — `byok` now does
  // (S1's fix), so it needs the same "nothing installed" isolation the daemon-replay tests below
  // already use, or this comparison would fail on THIS repo's own real dev-site fixtures rather than
  // on anything this test is actually meant to catch.
  const byok = await withEmptyAgentPluginsDir(() => withEmptySkillsDir(() => buildByokRole(routeDeps)));

  assert.deepEqual([...byok.ids].sort(), [...base.ids].sort());
  assert.deepEqual(byok.publishContentTypes, base.publishContentTypes);
  assert.ok(byok.publishContentTypes.length > 0, "the publish-content type registry must not be empty — that is the f0cfd0c67 regression this pins from the other side");
  assert.deepEqual(byok.duplicateResources, base.duplicateResources);
});

test("the daemon's replayed registry is a strict superset of the real BYOK module's — the only extra ids are the documented, owner-flagged gap (KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS)", async () => {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  // Both roles are built under the SAME fixture — an empty Agent Plugins tree and one real installed
  // skill — so this proves BYOK now picks up the installed skill too (S1's fix), not merely that both
  // sides agree when neither has one. Building `byok` outside this wrapper (as before the fix, when
  // BYOK never read either tree at all) would have been harmless; after the fix it would silently
  // stop proving anything, since BYOK's own disk read would see no installed skill either.
  const { byok, daemon } = await withEmptyAgentPluginsDir(() =>
    withOneInstalledSkill(routeDeps.workspaceId, async () => ({
      byok: await buildByokRole(routeDeps),
      daemon: await buildDaemonRole(routeDeps),
    }))
  );

  const missingFromDaemon = [...byok.ids].filter((id) => !daemon.ids.has(id));
  assert.deepEqual(missingFromDaemon, [], "BYOK must never expose a tool id the daemon does not also carry — that would mean the daemon is missing something BYOK has, the opposite of the documented gap");

  const extraOnDaemon = [...daemon.ids].filter((id) => !byok.ids.has(id));
  assert.deepEqual(
    extraOnDaemon.sort(),
    [...KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS].sort(),
    "a NEW id present on the daemon but not BYOK that isn't in KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS is unreviewed drift — either wire it into createAssistantByokModule too, or add it to the allow-list with a reason"
  );

  // Both still boot through installFirstPartyToolContributors()/installFirstPartyPublishContentTypes()
  // — the daemon-only registrars above add tool ids, never publish-content types or duplicate
  // handlers, so these must still agree exactly.
  assert.deepEqual(daemon.publishContentTypes, byok.publishContentTypes);
  assert.deepEqual(daemon.duplicateResources, byok.duplicateResources);
});

test("BYOK's search_tools catalog finds an installed skill's tool once ready resolves — proving the catalog rebuild, not just the registry, picks it up", async () => {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  await withEmptyAgentPluginsDir(() =>
    withOneInstalledSkill(routeDeps.workspaceId, async () => {
      resetToolContributorsForTests();
      resetPublishContentContributorsForTests();
      resetDuplicateResourceHandlersForTests();
      const byok = createAssistantByokModule(routeDeps); // calls installFirstPartyToolContributors() itself
      await byok.toolSurface.ready;

      const result = await byok.toolSurface.executeMetaTool(
        { id: "principal-process-root-parity" },
        { id: "run-process-root-parity" },
        { name: "search_tools", input: { query: "incident response runbook severity escalation" } },
      );

      assert.notEqual(result.isError, true, `search_tools itself failed: ${result.content}`);
      const { hits } = JSON.parse(result.content) as { hits: ReadonlyArray<{ id: string }> };
      assert.ok(
        hits.some((hit) => hit.id === "skill_incident_response"),
        `expected "skill_incident_response" among search_tools hits, got: ${hits.map((hit) => hit.id).join(", ") || "(none)"}`,
      );
    }),
  );
});

test("BYOK's federation is a real, non-stubbed FederationRuntime that boots lazily — built but not started before any turn", async () => {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  resetToolContributorsForTests();
  resetPublishContentContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  const { toolSurface } = createAssistantByokModule(routeDeps);

  // Proves federation is attached at all (S1-S6 above wired it into `createByokToolSurface` itself
  // — see that file's own header — not merely typed as optional and left `undefined` for every real
  // caller) without waiting on `toolSurface.ready` or `awaitFederation` first: this assertion is
  // ABOUT the state before either of those would start it.
  assert.ok(toolSurface.federation, "createAssistantByokModule's real surface must carry a federation runtime, not undefined");
  // Proves the boot pass is lazy, not eager: constructing the module (and therefore `createApp`)
  // must cost nothing beyond building the object — no connection, no subprocess, no I/O — until a
  // turn actually calls `awaitFederation`. An eager `start()` here (the daemon's own timing, wrongly
  // copied onto BYOK) would flip this to `true` before this assertion ever runs.
  assert.equal(toolSurface.federation?.started, false, "federation must not be started at construction — BYOK starts it lazily on the first turn, not at boot");
});
