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
import { registerInstalledAgentPluginTools } from "#src/features/agent-plugins/tool-registrations";
import { registerInstalledSkillTools } from "#src/features/skills/tool-registrations";
import { registerEnabledPluginCapabilityTools } from "#src/features/plugin-runtime/capability-tool-registrations";

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
 * TODO(owner ruling, architecture pass P1 finding C1 — partially closed 2026-09-24, S1 above):
 * `assistant-byok.ts`'s `createAssistantByokModule` (and therefore `createApp`, which builds its BYOK
 * surface through it) now calls `registerInstalledAgentPluginTools`, `registerInstalledSkillTools`,
 * and `registerEnabledPluginCapabilityTools` through the shared `registerInstalledExtensionTools`
 * pass, the same three the daemon calls (`agent-daemon-server.ts`'s own call into that function) — a
 * BYOK chat can now see an installed Agent Plugin's tool, an installed Agent Skill's tool, and an
 * enabled plugin-runtime capability tool, proven below with a real installed-skill fixture (with zero
 * skills installed the two builds would coincidentally agree either way, which would hide exactly the
 * drift this file exists to catch) and, for `search_tools` specifically, the dedicated "BYOK's
 * search_tools catalog finds an installed skill" test further down.
 *
 * The one remaining daemon-only category is federated MCP tools, attached via
 * `attachFederatedMcpTools`/`registerSupabaseMcpPreset` (`agent-daemon-server.ts:1260`/`:1290`): BYOK
 * has no equivalent connection lifecycle (admission, reload, auth-failure reporting) at all, so a
 * BYOK chat still cannot reach the owner's connected external MCP servers or the Supabase preset. That
 * needs its own architect pass (F4b in the fix plan above) and is disclosed here rather than
 * reproduced — it needs a live subprocess to attach a tool, out of scope for a unit test. If that
 * decision changes `createAssistantByokModule` to also cover federated MCP, this file's allow-list
 * must shrink to match, which is exactly the "fails on any NEW drift" property this test is for.
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

/** (c) A faithful replay of the daemon's own boot order (`agent-daemon-server.ts:390-444`): the same
 *  base, PLUS the three optional, workspace-scoped registrars the daemon calls directly on its
 *  registry that no BYOK/createApp path calls at all. Fail-open on the two disk-backed registrars,
 *  mirroring the daemon's own try/catch around each (":1385-1391", ":1408-1414") — an unreadable tree
 *  must not fail this test any more than it fails a real boot. */
async function buildDaemonRole(routeDeps: NewsletterRouteDeps): Promise<RoleSnapshot> {
  resetToolContributorsForTests();
  resetPublishContentContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(routeDeps)) registry.register(registration);

  try {
    await registerInstalledAgentPluginTools(registry, { workspaceId: routeDeps.workspaceId });
  } catch {
    // fail-open, matching agent-daemon-server.ts:1385-1391
  }
  try {
    await registerInstalledSkillTools(registry, { workspaceId: routeDeps.workspaceId });
  } catch {
    // fail-open, matching agent-daemon-server.ts:1408-1414
  }
  // Real in-memory deps (createRouteDeps()'s composePluginRuntime), not disk-backed — no fixture
  // needed, and no plugin-runtime plugin is enabled by default, so this contributes zero ids today.
  // Exercised anyway so a future enabled capability plugin is covered by the same replay, not a gap
  // this file's allow-list has to grow to cover later.
  await registerEnabledPluginCapabilityTools(registry, {
    authorize: routeDeps.authorize,
    workspaceId: routeDeps.workspaceId,
    postRepo: routeDeps.postRepo,
    discoverPlugins: routeDeps.discoverPlugins,
    pluginActivationRepo: routeDeps.pluginActivationRepo,
  });

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
