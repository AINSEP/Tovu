/**
 * @file EXTRACT-S6 G-plug observers: drive the CURRENT plugin tool, capability tool, declarative
 * enable and admin DTO code paths through their real registrations, serializers and policies, and
 * return one plain JSON-safe record of what they produced. The golden test compares that record,
 * byte for byte, against the frozen fixture recorded from the pinned tree before any seam/move.
 *
 * Every observer builds its own fresh repos, so the record does not depend on test order. The only
 * normalization is the card's surface-exchange id (a random UUID minted by the real exchange store)
 * and the harness's random change-set ids; both are replaced with fixed placeholders.
 */
import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";

import { createToolRegistry, type ToolRegistration } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { InMemoryPluginActivationRepo, PluginInvalidError, setPluginEnabled, type PluginActivationRecord, type PluginManifest } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";

import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import type { PostRecord } from "#src/features/post/post";
import { createDeclaredContentTypePorts } from "#src/server/runtime/composition/declared-content-types";
import { composePluginRuntime, type PluginRuntimeSource } from "#src/server/runtime/composition/plugin-runtime";
import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import { toAdminPluginResponse } from "../../admin-response.js";
import { pluginAgentToolCatalog } from "../../agent-tools.js";
import { CONTENT_ANALYZER_MANIFEST } from "../../built-ins/content-analyzer/index.js";
import { WORD_COUNT_MANIFEST } from "../../built-ins/word-count/index.js";
import { buildPluginCapabilityToolRegistrations, loadEnabledPluginCapabilityToolSources, pluginCapabilityToolDerivedRisk, registerEnabledPluginCapabilityTools, type PluginCapabilityToolDeps } from "../../capability-tool-registrations.js";
import { catalog as installCatalog, derivedRisk as installDerivedRisk } from "../../install-tool.js";
import { pluginSourceAgentToolCatalog, pluginSourceDerivedRisk } from "../../source-tools.js";
import { describeEnableApproval, pluginsDerivedRisk } from "../../tool-registrations.js";
import { describeUninstallApproval } from "../../uninstall-confirmation-ui.js";
import { PLUGIN_ID, WORKSPACE_ID, answerCard, context, harness, noDialog, siteRecord } from "./plugins-tool-harness.js";
import { requiredPostReader } from "./plugin-post-read.js";

type Json = unknown;

/** A thrown value as stable data: its class, name, message and (when present) code. */
export function describeError(error: unknown): Json {
  if (!(error instanceof Error)) return { thrown: String(error) };
  const code = (error as { code?: unknown }).code;
  return { class: error.constructor.name, name: error.name, message: error.message, ...(code === undefined ? {} : { code }) };
}

/** Settle `run` into `{ value }` or `{ error }` so refusals are recorded, not thrown. */
export async function settle(run: () => unknown): Promise<Json> {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/** JSON round trip: drops functions/undefined exactly like the wire would. */
function plain(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function descriptorOf(registration: ToolRegistration): Json {
  return plain(registration.descriptor);
}

const EXCHANGE_ID = /"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g;
function withoutExchangeId(html: string): string {
  return html.replace(EXCHANGE_ID, '"<surface-exchange-id>"');
}

async function cardRun(h: ReturnType<typeof harness>, toolId: string, input: unknown, decision: "confirm" | "cancel"): Promise<Json> {
  const { html, outcome } = await answerCard({ tool: h.tool(toolId), surfaceExchanges: h.surfaceExchanges, input, decision });
  return { cardHtml: withoutExchangeId(html), outcome: await settle(() => outcome) };
}

async function activationRows(repo: InMemoryPluginActivationRepo, pluginIds: readonly string[]): Promise<Json> {
  return plain(await Promise.all(pluginIds.map((pluginId) => repo.getActivation({ workspaceId: WORKSPACE_ID, pluginId }))));
}

const ENABLED_ROW: PluginActivationRecord = { pluginId: PLUGIN_ID, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: true, updatedAt: "2026-11-04T00:00:00.000Z" };

/** Item 1: the three `plugins_*` registrations, the install/source catalogs, and their result shapes. */
export async function observePluginsTools(): Promise<Json> {
  const descriptors = harness();
  const listed = harness({ discovery: () => [siteRecord(), siteRecord({ id: "quiet", name: "Quiet" })], initialRows: [ENABLED_ROW] });
  const listDenied = harness({ authorize: () => false });
  const disable = harness({ initialRows: [ENABLED_ROW] });
  const enableConfirm = harness({ confirmEnable: () => true });
  const enableCancel = harness({ confirmEnable: () => true });
  const enableDenied = harness({ authorize: () => false, confirmEnable: () => true });
  const uninstallBuiltIn = harness({ discovery: () => [siteRecord({ source: "built-in" })] });
  const uninstallEnabled = harness({ initialRows: [ENABLED_ROW] });
  const removed: string[] = [];
  const uninstallConfirm = harness({ removePlugin: async ({ id }) => { removed.push(id); return { ok: true, version: "1.0.0" }; } });
  const uninstallCancel = harness({ removePlugin: async ({ id }) => { removed.push(`cancel:${id}`); return { ok: true, version: "1.0.0" }; } });
  const site = { family: "site-runtime", pluginId: PLUGIN_ID };
  const results = {
    listNormal: await settle(() => listed.tool("plugins_list").handler(context({}), {})),
    listNormalAuthorizeCalls: plain(listed.authorizeCalls),
    listDenied: await settle(() => listDenied.tool("plugins_list").handler(context({}), {})),
    listMalformedInput: await settle(() => descriptors.tool("plugins_list").handler(context({ unexpected: true }), {})),
    setEnabledDisable: await settle(() => disable.tool("plugins_set_enabled").handler(context({ ...site, enabled: false }), { emitSurface: noDialog })),
    setEnabledDisableEvents: disable.events,
    setEnabledDisableRows: await activationRows(disable.activationRepo, [PLUGIN_ID]),
    setEnabledEnableConfirm: await cardRun(enableConfirm, "plugins_set_enabled", { ...site, enabled: true }, "confirm"),
    setEnabledEnableConfirmEvents: enableConfirm.events,
    setEnabledEnableConfirmPolicyCalls: plain(enableConfirm.policyCalls),
    setEnabledEnableConfirmRows: await activationRows(enableConfirm.activationRepo, [PLUGIN_ID]),
    setEnabledEnableCancel: await cardRun(enableCancel, "plugins_set_enabled", { ...site, enabled: true }, "cancel"),
    setEnabledEnableCancelRows: await activationRows(enableCancel.activationRepo, [PLUGIN_ID]),
    setEnabledDenied: await settle(() => enableDenied.tool("plugins_set_enabled").handler(context({ ...site, enabled: true }), { emitSurface: noDialog })),
    setEnabledDeniedAuthorizeCalls: plain(enableDenied.authorizeCalls),
    setEnabledMalformedFamily: await settle(() => descriptors.tool("plugins_set_enabled").handler(context({ family: "other", pluginId: PLUGIN_ID, enabled: true }), { emitSurface: noDialog })),
    uninstallBuiltIn: await settle(() => uninstallBuiltIn.tool("plugins_uninstall").handler(context(site), { emitSurface: noDialog })),
    uninstallStillEnabled: await settle(() => uninstallEnabled.tool("plugins_uninstall").handler(context(site), { emitSurface: noDialog })),
    uninstallConfirm: await cardRun(uninstallConfirm, "plugins_uninstall", site, "confirm"),
    uninstallCancel: await cardRun(uninstallCancel, "plugins_uninstall", site, "cancel"),
    uninstallRemoved: removed,
  };
  return {
    catalog: plain(pluginAgentToolCatalog),
    installCatalog: plain(installCatalog),
    sourceCatalog: plain(pluginSourceAgentToolCatalog),
    derivedRisk: { plugins: [...pluginsDerivedRisk], install: [...installDerivedRisk], source: [...pluginSourceDerivedRisk] },
    descriptors: ["plugins_list", "plugins_set_enabled", "plugins_uninstall"].map((id) => descriptorOf(descriptors.tool(id))),
    results,
    enableApprovalCopy: {
      sitePlugin: plain(describeEnableApproval({ subject: { family: "site-runtime", pluginId: PLUGIN_ID, label: "Site rules", version: "1.0.0", adds: ["hooks.attach"], previousEnabled: null, revision: "r1" }, scope: { personId: "owner", siteId: WORKSPACE_ID } })),
      agentPlugin: plain(describeEnableApproval({ subject: { family: "agent-plugin", pluginId: "higgsfield", version: "1.0.0" } })),
    },
    uninstallApprovalCopy: plain(describeUninstallApproval({ preview: { id: PLUGIN_ID, name: "Site rules", version: "1.0.0" } as never })),
  };
}

// --- Item 2: capability tools -----------------------------------------------------------------

const CAP_WORKSPACE = "ws-1";
const NO_DESCRIPTION_MANIFEST: PluginManifest = {
  id: "read-time", name: "Read Time", version: "1.0.0", sdkRange: "^0.1.0 || ^0.2.0", engine: 1, tier: "tier-3",
  capabilities: ["content.read", "content.extend", "hooks.attach"], hooks: ["content.entry.beforeSave"],
  fields: [{ path: "ext.read-time.minutes", type: "integer", queryable: false }], integrity: {},
};

function discoveryRecord(manifest: PluginManifest): PluginDiscoveryRecord {
  return { id: manifest.id, name: manifest.name, version: manifest.version, source: "built-in", tier: manifest.tier, status: "valid", errors: [], manifest };
}

function capActivation(pluginId: string, overrides: Partial<PluginActivationRecord> = {}): PluginActivationRecord {
  return { pluginId, workspaceId: CAP_WORKSPACE, version: "1.0.0", enabled: true, updatedAt: "2026-08-26T00:00:00.000Z", ...overrides };
}

function capPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return { id: "post-1", workspaceId: CAP_WORKSPACE, title: "Hello", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "published", kind: "post", bodyFormat: "doc", bodyHtml: null, updatedAt: "2026-08-26T00:00:00.000Z", version: 1, ...overrides };
}

const ALL_CAPABILITY_MANIFESTS = [WORD_COUNT_MANIFEST, CONTENT_ANALYZER_MANIFEST, NO_DESCRIPTION_MANIFEST];

/** The executor's answer for one call, keeping only the stable outcome fields. */
async function executeCapability(registry: ReturnType<typeof createToolRegistry>, toolId: string, input: unknown): Promise<Json> {
  const executor = createToolExecutor({ registry });
  const result = await executor.execute({ principal: { id: "principal-1" }, run: { id: "run-1" }, toolId, input }) as unknown as Record<string, unknown>;
  return plain({ status: result["status"], output: result["output"], error: result["error"] });
}

async function bootCapabilityRegistry(activations: PluginActivationRecord[] | InMemoryPluginActivationRepo, extra: Partial<PluginCapabilityToolDeps> = {}) {
  const registry = createToolRegistry({});
  const repo = activations instanceof InMemoryPluginActivationRepo ? activations : new InMemoryPluginActivationRepo({ initialRows: activations });
  const authorizeCalls: unknown[] = [];
  await registerEnabledPluginCapabilityTools(registry, {
    withExtensionApprovalPolicy,
    authorize: async (request) => { authorizeCalls.push(request); return { allowed: true } as never; },
    workspaceId: CAP_WORKSPACE,
    postRead: requiredPostReader({ repo: new InMemoryPostRepo([capPost({ ext: { "word-count": { count: 42, readingTimeMinutes: 0 }, "content-analyzer": { score: 10, report: "{\"v\":1}" } } }), capPost({ id: "post-empty" })]) }),
    discoverPlugins: async () => ALL_CAPABILITY_MANIFESTS.map(discoveryRecord),
    pluginActivationRepo: repo,
    ...extra,
  });
  return { registry, repo, authorizeCalls };
}

/** Item 2: real ids/names/descriptions/schemas/risk/permission/entity scope and call results. */
export async function observeCapabilityTools(): Promise<Json> {
  const allEnabled = ALL_CAPABILITY_MANIFESTS.map((manifest) => capActivation(manifest.id));
  const sources = await loadEnabledPluginCapabilityToolSources({ workspaceId: CAP_WORKSPACE, discoverPlugins: async () => ALL_CAPABILITY_MANIFESTS.map(discoveryRecord), pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: allEnabled }) });
  const registrations = buildPluginCapabilityToolRegistrations({ sources, deps: { authorize: async () => ({ allowed: true }) as never, workspaceId: CAP_WORKSPACE, postRead: requiredPostReader({ repo: new InMemoryPostRepo() }), pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: allEnabled }) }, withExtensionApprovalPolicy });
  const stored = await bootCapabilityRegistry(allEnabled);
  const fresh = await bootCapabilityRegistry(allEnabled, { previewPluginBeforeSave: async (pluginId, entry) => ({ score: 84, summary: `fresh:${pluginId}:${entry.slug}`, report: "{\"v\":1,\"score\":84}" }) });
  const freshFails = await bootCapabilityRegistry(allEnabled, { previewPluginBeforeSave: async () => { throw new Error("worker exploded"); } });
  const denied = await bootCapabilityRegistry(allEnabled, { authorize: async () => ({ allowed: false, reason: "nope" }) as never });
  const revocable = await bootCapabilityRegistry(allEnabled);
  const call = (boot: { registry: ReturnType<typeof createToolRegistry> }, toolId: string, input: unknown) => executeCapability(boot.registry, toolId, input);
  const gate: Record<string, Json> = {};
  await revocable.repo.save(capActivation("word-count", { enabled: false }));
  gate["disabled"] = await call(revocable, "plugin_capability_word_count", { postId: "post-1" });
  await revocable.repo.save(capActivation("word-count", { enabled: false, quarantinedAt: "2026-08-27T00:00:00.000Z", quarantineReason: "fixture quarantine", quarantineFailureCount: 3 } as Partial<PluginActivationRecord>));
  gate["quarantined"] = await call(revocable, "plugin_capability_word_count", { postId: "post-1" });
  await revocable.repo.deleteActivation({ workspaceId: CAP_WORKSPACE, pluginId: "word-count" });
  gate["absent"] = await call(revocable, "plugin_capability_word_count", { postId: "post-1" });
  revocable.repo.getActivation = async () => { throw new Error("activation store offline"); };
  gate["activationReadThrows"] = await call(revocable, "plugin_capability_word_count", { postId: "post-1" });
  const bootSubsets = {
    onlyDisabled: [...(await bootCapabilityRegistry([capActivation("word-count", { enabled: false })])).registry.list()].map((entry) => (entry as { id?: string }).id ?? plain(entry)),
    none: [...(await bootCapabilityRegistry([])).registry.list()].map((entry) => (entry as { id?: string }).id ?? plain(entry)),
  };
  return {
    sources: plain(sources),
    derivedRisk: [...pluginCapabilityToolDerivedRisk(sources)],
    descriptors: registrations.map(descriptorOf),
    bootRegistered: [...stored.registry.list()].map((entry) => (entry as { id?: string }).id ?? plain(entry)),
    bootSubsets,
    calls: {
      storedWordCount: await call(stored, "plugin_capability_word_count", { postId: "post-1" }),
      storedAnalyzerNoPreviewPort: await call(stored, "plugin_capability_content_analyzer", { postId: "post-1" }),
      noDataYet: await call(stored, "plugin_capability_read_time", { postId: "post-empty" }),
      missingPost: await call(stored, "plugin_capability_word_count", { postId: "post-missing" }),
      malformedInputMissingPostId: await call(stored, "plugin_capability_word_count", {}),
      malformedInputExtraKey: await call(stored, "plugin_capability_word_count", { postId: "post-1", extra: 1 }),
      freshAnalyzer: await call(fresh, "plugin_capability_content_analyzer", { postId: "post-1" }),
      freshTier3StillStored: await call(fresh, "plugin_capability_word_count", { postId: "post-1" }),
      freshPreviewFails: await call(freshFails, "plugin_capability_content_analyzer", { postId: "post-1" }),
      permissionDenied: await call(denied, "plugin_capability_word_count", { postId: "post-1" }),
    },
    authorizeCalls: plain(stored.authorizeCalls),
    activationGate: gate,
  };
}

// --- Item 3: declarative enable -------------------------------------------------------------

const DECL_WORKSPACE = "ws-1";
const declClock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") };
const FAQ = { key: "faq", label: "FAQ", fields: [{ name: "question", kind: "text", required: true }, { name: "answer", kind: "text", required: true }] };

function declSource(id: string, extra: Partial<PluginManifest>, imports: string[]): PluginRuntimeSource {
  return {
    source: "built-in",
    entryPath: `built-in:${id}`,
    manifest: { id, name: `Plugin ${id}`, version: "1.0.0", sdkRange: "*", engine: 1, tier: "tier-1", capabilities: [], hooks: [], fields: [], integrity: {}, ...extra },
    importModule: async () => {
      imports.push(id);
      return { default: definePlugin({ setup(sdk) { sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, async () => ({ seen: true })); } }) };
    },
  };
}

type RaceWinner = "none" | "compatible" | "tombstoned" | "incompatible" | "unrelated-error";

/** Real composition + real content-type write path. `race` makes a competing writer create the key
 *  between this enable's plan and its register, exactly the window `judgeLostRace` handles. */
function declHarness(race: RaceWinner = "none") {
  const imports: string[] = [];
  const activationRepo = new InMemoryPluginActivationRepo();
  const contentTypeRepo = new InMemoryContentTypeRepo();
  let next = 0;
  const real = createDeclaredContentTypePorts({ repo: contentTypeRepo, clock: declClock, ids: { newId: () => `id-${++next}` }, outbox: { enqueue: async () => {} } });
  let raced = false;
  const competitor: Json[] = [];
  const declaredContentTypes = race === "none" ? real : {
    findByKey: real.findByKey,
    async register(input: Parameters<typeof real.register>[0]) {
      if (!raced) {
        raced = true;
        if (race === "unrelated-error") return { ok: false as const, error: new Error("content-type store offline") };
        const fields = race === "incompatible" ? [{ name: "question", kind: "json", required: true }] : input.fields;
        competitor.push(plain(await real.register({ workspaceId: input.workspaceId, key: input.key, label: "Winner", fields: fields as never, actorId: "competing-writer" })));
        if (race === "tombstoned") {
          const winner = await contentTypeRepo.findByKey({ workspaceId: input.workspaceId, key: input.key });
          if (winner) await contentTypeRepo.save({ ...winner, status: "tombstone" });
        }
      }
      return real.register(input);
    },
  };
  const runtime = composePluginRuntime({ workspaceId: DECL_WORKSPACE, clock: declClock, activationRepo, sources: [declSource("testimonials-faq", { contentTypes: [FAQ] }, imports), declSource("faq-rival", { contentTypes: [FAQ] }, imports)], declaredContentTypes });
  const setEnabled = async (pluginId: string, enabled: boolean) => setPluginEnabled({
    deps: { clock: declClock, repo: activationRepo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled },
    input: { workspaceId: DECL_WORKSPACE, pluginId, enabled },
  });
  const state = async () => plain({
    imports,
    competitor,
    faq: await contentTypeRepo.findByKey({ workspaceId: DECL_WORKSPACE, key: "faq" }),
    revisions: contentTypeRepo.listRevisions(),
    activations: await Promise.all(["testimonials-faq", "faq-rival"].map((pluginId) => activationRepo.getActivation({ workspaceId: DECL_WORKSPACE, pluginId }))),
  });
  /** An owner-made type registered through the same real write path before the plugin is enabled. */
  const ownerType = async (fields: readonly { name: string; kind: string; required: boolean }[]) =>
    plain(await real.register({ workspaceId: DECL_WORKSPACE, key: "faq", label: "Owner FAQ", fields: fields as never, actorId: "owner" }));
  return { setEnabled, state, ownerType, contentTypeRepo, activationRepo };
}

function invalidIdentity(outcome: Json, run: () => Promise<unknown>): Promise<Json> {
  return run().then(() => ({ outcome, canonicalPluginInvalidError: null }), (error: unknown) => ({ outcome, error: describeError(error), canonicalPluginInvalidError: error instanceof PluginInvalidError }));
}

/** Keep with an owner-made type that holds every declared field plus one of the owner's own. */
async function observeOwnerAddedFieldsKept(): Promise<Json> {
  const h = declHarness();
  const ownerType = await h.ownerType([...FAQ.fields, { name: "rating", kind: "integer", required: false }]);
  const result = await settle(() => h.setEnabled("testimonials-faq", true));
  return { ownerType, result: plain(result), after: await h.state() };
}

/** Item 3: create / keep / conflict / tombstone, and the three lost-race winners. */
export async function observeDeclarativeEnable(): Promise<Json> {
  const create = declHarness();
  const createResult = await settle(() => create.setEnabled("testimonials-faq", true));
  const afterCreate = await create.state();
  const keepResult = await settle(async () => { await create.setEnabled("testimonials-faq", false); return create.setEnabled("testimonials-faq", true); });
  const afterKeep = await create.state();

  const conflict = declHarness();
  const ownerConflicting = await conflict.ownerType([{ name: "question", kind: "json", required: true }]);
  const beforeConflict = await conflict.state();
  const conflictResult = await invalidIdentity("conflict", () => conflict.setEnabled("testimonials-faq", true));
  const afterConflict = await conflict.state();

  const tombstone = declHarness();
  await tombstone.setEnabled("testimonials-faq", true);
  const created = await tombstone.contentTypeRepo.findByKey({ workspaceId: DECL_WORKSPACE, key: "faq" });
  if (created) await tombstone.contentTypeRepo.save({ ...created, status: "tombstone" });
  await tombstone.setEnabled("testimonials-faq", false);
  const tombstoneResult = await settle(() => tombstone.setEnabled("testimonials-faq", true));
  const afterTombstone = await tombstone.state();

  const claimConflict = declHarness();
  await claimConflict.setEnabled("testimonials-faq", true);
  const rivalResult = await settle(() => claimConflict.setEnabled("faq-rival", true));
  const afterRival = await claimConflict.state();

  const races: Record<string, Json> = {};
  for (const winner of ["compatible", "tombstoned", "incompatible", "unrelated-error"] as const) {
    const raced = declHarness(winner);
    const result = await invalidIdentity(winner, () => raced.setEnabled("testimonials-faq", true));
    races[winner] = { result, after: await raced.state() };
  }
  return {
    create: { result: plain(createResult), after: afterCreate },
    keep: { result: plain(keepResult), after: afterKeep },
    conflict: { ownerType: ownerConflicting, before: beforeConflict, result: conflictResult, after: afterConflict },
    keepOwnerAddedFields: await observeOwnerAddedFieldsKept(),
    tombstone: { result: plain(tombstoneResult), after: afterTombstone },
    claimConflict: { result: plain(rivalResult), after: afterRival },
    concurrentCreate: races,
  };
}

// --- Item 5: admin DTO ----------------------------------------------------------------------

/** Item 5: the pure admin DTO for enabled / disabled / quarantined / invalid / conflicting rows. */
export function observeAdminDto(): Json {
  const quarantined = { ...ENABLED_ROW, enabled: false, quarantinedAt: "2026-11-05T00:00:00.000Z", quarantineReason: "hook threw", quarantineFailureCount: 3 } as PluginActivationRecord;
  const invalid = siteRecord({ status: "invalid", manifest: undefined, errors: [{ code: "MANIFEST_INVALID", file: "tovu.plugin.json", message: "bad" }] } as Partial<PluginDiscoveryRecord>);
  const conflict = { kind: "hook", key: "content.entry.beforeSave", heldBy: "other", heldByName: "Other", heldKey: "content.entry.beforeSave" } as const;
  return plain({
    enabled: toAdminPluginResponse(siteRecord(), ENABLED_ROW),
    neverActivated: toAdminPluginResponse(siteRecord(), null),
    quarantined: toAdminPluginResponse(siteRecord(), quarantined),
    invalid: toAdminPluginResponse(invalid, null),
    withConflicts: toAdminPluginResponse(siteRecord(), ENABLED_ROW, { conflicts: [conflict] }),
    withProviderSettings: toAdminPluginResponse(siteRecord({ manifest: { ...siteRecord().manifest, contributes: { providers: [{ contract: "example.provider", id: "p1", contractVersion: 1, settings: [{ name: "apiKey", label: "API key", kind: "secret" }] }] } } as never }), ENABLED_ROW),
    builtInTierFallback: toAdminPluginResponse(siteRecord({ source: "built-in", tier: undefined } as Partial<PluginDiscoveryRecord>), ENABLED_ROW),
  });
}
