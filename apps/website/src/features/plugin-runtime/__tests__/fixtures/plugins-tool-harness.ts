import assert from "node:assert/strict";

import type { SurfaceEmission, SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { InstalledAgentPlugin } from "@jini-ai/agent-plugins/lifecycle";
import { InMemoryPluginActivationRepo, type PluginActivationRecord, type PluginConflict, type PluginSourcePolicyPort, type RemovePluginFn } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord, PluginSourcePort } from "@jini-ai/plugins/host/node";
import { InMemoryExternalMcpServerRepo } from "#src/assistant/index";

import { InMemoryChangeSetRepo } from "../../../../contracts/core/commands/index.js";
import { InMemoryOutbox } from "../../../../contracts/core/events/memory-bus.js";
import type { AgentPluginHostCapability, AgentPluginLayout, PluginHostPort } from "../../../../contracts/headless/index.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { buildPluginsRegistrations, type PluginsToolDeps } from "../../tool-registrations.js";

/** Typed fakes for the Plugins tool handlers (`tool-registrations.ts`): every port the handlers read,
 * recording each observable call into one ordered log. The approval transport, `executeCommand` and
 * `setPluginEnabled` stay real. */
export const WORKSPACE_ID = "66666666-6666-4666-8666-666666666666";
export const PRINCIPAL_ID = "owner-under-test";
export const PLUGIN_ID = "site-rules";
export const CAPABILITIES = ["capability:hooks.attach", "hook:content.entry.beforeSave", "tier:tier-3"] as const;
export const MANIFEST = { id: PLUGIN_ID, name: "Site rules", version: "1.0.0", sdkRange: "^1.0.0", engine: 1, tier: "tier-3", capabilities: ["hooks.attach"], hooks: ["content.entry.beforeSave"], fields: [], integrity: {} } as const;
export const ABANDONED_NOTE = "The confirmation dialog was closed because the run ended. Nothing was changed.";

export function siteRecord(overrides: Partial<PluginDiscoveryRecord> = {}): PluginDiscoveryRecord {
  return { id: PLUGIN_ID, name: "Site rules", version: "1.0.0", source: "site", tier: "tier-3", status: "valid", errors: [], manifest: MANIFEST, ...overrides };
}

const FAKE_LAYOUT: AgentPluginLayout = {
  root: "/fake/agent-plugins",
  workspacesDir: "/fake/agent-plugins/ws",
  forWorkspace: () => assert.fail("the Agent Plugin layout is never read when the host capability is bound"),
};

export function installedAgentPlugin(overrides: Partial<InstalledAgentPlugin> = {}): InstalledAgentPlugin {
  return { pluginId: "higgsfield", version: "1.0.0", archiveDigest: "a".repeat(64), packageRoot: "/fake/pkg", files: [], skills: [], ...overrides };
}

export interface HarnessOptions {
  readonly discovery?: () => readonly PluginDiscoveryRecord[];
  readonly source?: Partial<Pick<PluginSourcePort, "isSealedHere" | "readApproval" | "recordApproval">> | false;
  readonly confirmEnable?: PluginSourcePolicyPort["confirmEnable"] | false;
  readonly authorize?: (call: number) => boolean;
  readonly agentHost?: Partial<AgentPluginHostCapability>;
  readonly initialRows?: PluginActivationRecord[];
  readonly changeSets?: InMemoryChangeSetRepo;
  readonly onPluginDisabled?: () => void;
  readonly listPluginConflicts?: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
  readonly removePlugin?: RemovePluginFn;
  /** The lifecycle owners a composition root may inject in place of the host capability. */
  readonly injected?: Pick<PluginsToolDeps, "assertAgentPluginActivationsWritable" | "setAgentPluginEnabled" | "listInstalledAgentPlugins">;
  readonly layout?: AgentPluginLayout;
}

/** Records every observable port call into one ordered log so tests can pin ORDER, not just occurrence. */
export function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const policyCalls: Array<{ sealedHere: boolean; added: readonly string[] }> = [];
  const authorizeCalls: Array<{ permission: string; entityType?: string | undefined; entityId?: string | undefined }> = [];
  class LoggingActivationRepo extends InMemoryPluginActivationRepo {
    override async save(record: PluginActivationRecord): Promise<void> { events.push(`save:${record.enabled}`); await super.save(record); }
    override async deleteActivation(required: { workspaceId: string; pluginId: string }): Promise<void> { events.push("deleteActivation"); await super.deleteActivation(required); }
  }
  const activationRepo = new LoggingActivationRepo({ initialRows: options.initialRows ?? [] });
  const notUsed = (name: string) => () => assert.fail(`${name} is not part of the enable path`);
  const sourceOptions = options.source === false ? undefined : options.source;
  const pluginSource: PluginSourcePort | undefined = options.source === false ? undefined : {
    create: notUsed("create"), open: notUsed("open"), list: notUsed("list"), read: notUsed("read"), write: notUsed("write"),
    edit: notUsed("edit"), delete: notUsed("delete"), seal: notUsed("seal"), rollback: notUsed("rollback"),
    isSealedHere: async (input, opts) => { events.push(`isSealedHere:${input.id}@${input.version}`); return (await sourceOptions?.isSealedHere?.(input, opts)) ?? true; },
    readApproval: async (input, opts) => { events.push(`readApproval:${input.id}`); return sourceOptions?.readApproval?.(input, opts); },
    recordApproval: async (input, opts) => { events.push(`recordApproval:${input.capabilities.join("|")}`); await sourceOptions?.recordApproval?.(input, opts); },
  };
  const confirmEnable = options.confirmEnable;
  const pluginSourcePolicy: PluginSourcePolicyPort | undefined = confirmEnable === false || confirmEnable === undefined ? undefined : {
    localInstallEnabled: () => true,
    confirmEnable: (required, opts) => { policyCalls.push({ sealedHere: required.sealedHere, added: [...required.added] }); return confirmEnable(required, opts); },
  };
  const agentHost: AgentPluginHostCapability = {
    listInstalled: async () => { events.push("listInstalled"); return (await options.agentHost?.listInstalled?.({}, {})) ?? [installedAgentPlugin()]; },
    assertWritable: async () => { events.push("assertWritable"); await options.agentHost?.assertWritable?.({}, {}); },
    setEnabled: async (input) => { events.push(`setEnabled:${input.enabled}`); return (await options.agentHost?.setEnabled?.(input, {})) ?? { pluginId: input.pluginId, enabled: input.enabled }; },
    provisionMcp: async (input) => { events.push(`provisionMcp:${input.pluginId}`); },
    uninstall: notUsed("uninstall"),
  };
  const pluginHost: PluginHostPort = {
    getPlugin: notUsed("getPlugin"), findProviders: notUsed("findProviders"), withInstallIdentity: notUsed("withInstallIdentity"),
    getHostCapability: () => agentHost,
  };
  let authorizeCount = 0;
  const keyring = new InMemoryKeyring();
  const deps: PluginsToolDeps = {
    agentPluginLayout: options.layout ?? FAKE_LAYOUT,
    ...options.injected,
    pluginHost,
    ...(pluginSource ? { pluginSource } : {}),
    ...(pluginSourcePolicy ? { pluginSourcePolicy } : {}),
    authorize: async (params) => {
      authorizeCalls.push({ permission: params.permission, entityType: params.entityType, entityId: params.entityId });
      const allowed = options.authorize?.(++authorizeCount) ?? true;
      return allowed ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse("2026-10-20T00:00:00.000Z") },
    idGen: { newId: () => `id-${events.length}-${Math.random()}` },
    changeSets: options.changeSets ?? new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    pluginActivationRepo: activationRepo,
    discoverPlugins: async () => { events.push("discover"); return options.discovery?.() ?? [siteRecord()]; },
    onPluginEnabled: async (pluginId) => { events.push(`onEnabled:${pluginId}`); },
    onPluginDisabled: (pluginId) => { events.push(`onDisabled:${pluginId}`); options.onPluginDisabled?.(); },
    removePlugin: options.removePlugin ?? notUsed("removePlugin"),
    ...(options.listPluginConflicts ? { listPluginConflicts: options.listPluginConflicts } : {}),
    externalMcpServerRepo: new InMemoryExternalMcpServerRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tool = (id: string): ToolRegistration => {
    const found = buildPluginsRegistrations(deps, { surfaceExchanges }).find((registration) => registration.descriptor.id === id);
    assert.ok(found, `expected '${id}' to be wired`);
    return found;
  };
  return { deps, events, policyCalls, authorizeCalls, activationRepo, surfaceExchanges, tool };
}

export function context(input: unknown, signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, signal, input };
}

export const noDialog: SurfaceEmitter = async () => assert.fail("this enable must not raise a confirmation card");

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** The HTML of an emitted MCP-UI card, read the way the rendered iframe would. */
function cardHtml(surface: SurfaceEmission): string {
  const resource = surface.payload["resource"];
  const inner = isRecord(resource) ? resource["resource"] : undefined;
  const text = isRecord(inner) ? inner["text"] : undefined;
  assert.ok(typeof text === "string", "the card must be an MCP-UI resource carrying HTML text");
  return text;
}

/** Raises the card, answers it the way the MCP-UI callback route does, and returns the card's HTML
 *  plus the parked call's settled outcome. */
export async function answerCard(
  { tool, surfaceExchanges, input, decision, signal }: { tool: ToolRegistration; surfaceExchanges: SurfaceExchangeStore; input: unknown; decision: "confirm" | "cancel"; signal?: AbortSignal },
): Promise<{ html: string; outcome: Promise<unknown> }> {
  let raised: (html: string) => void = () => undefined;
  const card = new Promise<string>((resolve) => { raised = resolve; });
  const outcome = Promise.resolve(tool.handler(context(input, signal), {
    emitSurface: async (surface) => { raised(cardHtml(surface)); },
  }));
  outcome.catch(() => undefined);
  const html = await card;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))?.[1];
  assert.ok(exchangeId, "the card must carry its exchange id");
  const delivery = surfaceExchanges.deliver({ exchangeId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision }, principalId: PRINCIPAL_ID }, { toolId: tool.descriptor.id });
  assert.equal(delivery.ok, true, JSON.stringify(delivery));
  return { html, outcome };
}
