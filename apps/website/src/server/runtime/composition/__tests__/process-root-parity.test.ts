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

const KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS: ReadonlySet<string> = new Set([
  // `skill_incident_response` — the fixture this file installs below, standing in for the daemon's
  // real `registerInstalledSkillTools` call (`agent-daemon-server.ts:1408-1414`). Proven here with a
  // real installed-skill fixture rather than asserted from source reading: with zero skills installed
  // the daemon and BYOK builds would coincidentally agree, which would hide exactly the drift this
  // file exists to catch.
  "skill_incident_response",
]);

/**
 * TODO(owner ruling, architecture pass P1 finding C1): `assistant-byok.ts`'s `createAssistantByokModule`
 * (and therefore `createApp`, which builds its BYOK surface through it) calls none of
 * `registerInstalledAgentPluginTools` (`agent-daemon-server.ts:1386`), `registerInstalledSkillTools`
 * (`:1409`), `registerEnabledPluginCapabilityTools` (`:1433`), or federated MCP tools attached via
 * `attachFederatedMcpTools`/`registerSupabaseMcpPreset` (`:1260`/`:1290`) — every one of those is a
 * daemon-only call. A BYOK chat therefore cannot see an installed Agent Plugin's tool, an installed
 * Agent Skill's tool, an enabled plugin-runtime capability tool, or a federated (e.g. Supabase MCP)
 * tool, even though the spawned-CLI/daemon path can. `KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS` above proves
 * the agent-plugin/skill half of this with a real fixture; the plugin-capability half is exercised
 * below with zero enabled plugins (so it contributes no ids today — see that test's own comment); the
 * federated-MCP half needs a live subprocess to attach a tool and is out of scope for a unit test, so
 * it is disclosed here rather than reproduced. This test does NOT fix the gap — an owner decides
 * whether BYOK should have these categories (SUSPECTED live gap, not yet reproduced against a live
 * BYOK chat — see the architecture pass's own "Not done / caveats" section). If that decision changes
 * `createAssistantByokModule` to call one of these registrars, this file's allow-list must shrink to
 * match, which is exactly the "fails on any NEW drift" property this test is for.
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
 *  `app.ts:1724` and hands to both the admin BYOK route and the daemon-proxy's redemption store. */
function buildByokRole(routeDeps: NewsletterRouteDeps): RoleSnapshot {
  resetToolContributorsForTests();
  resetPublishContentContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  const byok = createAssistantByokModule(routeDeps); // calls installFirstPartyToolContributors() itself
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
  const byok = buildByokRole(routeDeps);

  assert.deepEqual([...byok.ids].sort(), [...base.ids].sort());
  assert.deepEqual(byok.publishContentTypes, base.publishContentTypes);
  assert.ok(byok.publishContentTypes.length > 0, "the publish-content type registry must not be empty — that is the f0cfd0c67 regression this pins from the other side");
  assert.deepEqual(byok.duplicateResources, base.duplicateResources);
});

test("the daemon's replayed registry is a strict superset of the real BYOK module's — the only extra ids are the documented, owner-flagged gap (KNOWN_DAEMON_ONLY_EXTRA_TOOL_IDS)", async () => {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  const byok = buildByokRole(routeDeps);
  const daemon = await withEmptyAgentPluginsDir(() =>
    withOneInstalledSkill(routeDeps.workspaceId, () => buildDaemonRole(routeDeps))
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
