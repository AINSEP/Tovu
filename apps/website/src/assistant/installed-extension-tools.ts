/**
 * @file Attaches the assistant's optional extension tools — installed-extension tools (Agent
 * Plugins, Agent Skills, enabled plugin-capability tools), then MCP federation — onto one
 * `ToolRegistry`, in that fixed order, for both real processes (`agent-daemon-server.ts` and
 * `byok-tool-surface.ts`).
 *
 * The installed-extension registrar itself is INJECTED ({@link InstalledExtensionRegistrar}), not
 * imported: its three families are feature code, and `assistant/` importing them by value closed
 * the `assistant <-> features/agent-plugins` / `assistant <-> features/plugins` module cycles
 * `check:architecture` refuses. The real one is
 * `server/runtime/composition/installed-extension-tools.ts`'s `registerInstalledExtensionTools`,
 * passed by both composition roots.
 *
 * Both real callers need the installed pass to run, and be fully applied to the registry, BEFORE
 * they snapshot that registry into a `search_tools` index (`buildToolCatalogQuery` — a one-shot FTS
 * build; a tool registered after it is executable but invisible to search): `agent-daemon-server.ts`
 * awaits `installed` directly inside `start()`, before its own `buildToolCatalogQuery`;
 * `byok-tool-surface.ts` exposes the same promise as its returned surface's `ready` field, which
 * `modules/assistant-byok.ts`'s turn route awaits once before dispatching a turn.
 */
import type { ToolRegistration, ToolRegistry } from "@jini-ai/core";

import type { PluginCapabilityToolDeps } from "../features/plugin-runtime/capability-tool-registrations.js";
import type { PluginDiscoveryRecord } from "../features/plugin-runtime/discovery.js";

import { createFederationRuntime, type FederationRuntime } from "./external-mcp-federation-runtime.js";
import type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
import type { McpSessionPort } from "./mcp-federation/ports.js";
import type { FederationReloadResult } from "./mcp-federation/reload.js";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/** Everything an {@link InstalledExtensionRegistrar} needs from its caller: the plugin-capability
 *  family's own deps (`workspaceId`, `authorize`, `postRepo`, `pluginActivationRepo` —
 *  {@link PluginCapabilityToolDeps}), plus `discoverPlugins`, the one field that family's own
 *  `registerEnabledPluginCapabilityTools` declares as an inline addition rather than part of that
 *  type (see that function's own signature). The agent-plugin and skill registrars need only
 *  `workspaceId`, which this already carries. */
export interface InstalledExtensionToolDeps extends PluginCapabilityToolDeps {
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
}

/** Registers every installed Agent Plugin, installed Agent Skill, and enabled plugin-runtime
 *  capability tool onto `registry`. Must never reject — each family degrades to a `console.warn`
 *  prefixed with `log`. See `server/runtime/composition/installed-extension-tools.ts` for the real
 *  one. */
export type InstalledExtensionRegistrar = (
  registry: { readonly register: (registration: ToolRegistration) => void },
  deps: InstalledExtensionToolDeps,
  log: string,
) => Promise<void>;

/** The federation half of {@link attachAssistantToolExtensions}'s deps — everything
 *  `createFederationRuntime` needs beyond the registry and the log prefix it already receives from
 *  its caller. See `external-mcp-federation-runtime.ts` for what each field does. */
export interface AttachAssistantToolExtensionsFederationDeps {
  readonly deps: FederationDeps;
  readonly resolveConnections: () => Promise<readonly ResolvedFederatedConnection[]>;
  readonly onAdmitted?: (result: FederationReloadResult) => void;
  readonly connect?: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
}

export interface AttachAssistantToolExtensionsDeps extends InstalledExtensionToolDeps {
  readonly federation: AttachAssistantToolExtensionsFederationDeps;
  /** The installed-extension pass — injected by the composition root; see this file's header. */
  readonly registerInstalled: InstalledExtensionRegistrar;
}

export interface AssistantToolExtensions {
  /** The injected `registerInstalled`'s own promise, unchanged — resolves once installed Agent
   *  Plugins, Agent Skills and enabled plugin-capability tools have all been attempted. */
  readonly installed: Promise<void>;
  /** Not started here — see this function's own doc for why. */
  readonly federation: FederationRuntime;
}

/**
 * THE ONE REGISTRAR both processes call: installed-extension tools, then (once that settles) the
 * federation runtime, in that fixed order. Before this function, `agent-daemon-server.ts` attached
 * federation BEFORE installed extensions (`:1295` ran ahead of `:1392`); this reverses that order on
 * purpose, everywhere — see
 * `ADS-memory/.local-artifacts/design-byok-external-mcp-2026-09-24.md` §2.1 item 3 for why the new
 * order is the safer direction (a federated/extension id collision now drops only the federated
 * connection, not the whole extension family) and why it is safe to disclose as behavior-preserving
 * in practice (federated ids are always `mcp__`-prefixed, so no id collides today).
 *
 * `federation` is built, not started: {@link createFederationRuntime} performs no I/O until its
 * `start()`/`reload()` is called, so returning it un-started here costs nothing and lets each caller
 * (the daemon starts it eagerly in `start()`; BYOK starts it lazily, on the first API-mode turn)
 * decide its own timing without this function knowing either policy.
 *
 * @complexity O(1) beyond what the injected `registerInstalled` and
 * {@link createFederationRuntime} themselves cost.
 * @overallScore 100
 */
export function attachAssistantToolExtensions(
  registry: ToolRegistry,
  deps: AttachAssistantToolExtensionsDeps,
  log: string,
): AssistantToolExtensions {
  const installed = deps.registerInstalled(registry, deps, log);
  const federation = createFederationRuntime({
    registry,
    deps: deps.federation.deps,
    resolveConnections: deps.federation.resolveConnections,
    after: installed,
    log,
    ...(deps.federation.onAdmitted ? { onAdmitted: deps.federation.onAdmitted } : {}),
    ...(deps.federation.connect ? { connect: deps.federation.connect } : {}),
  });
  return { installed, federation };
}
