import { createFederatedMcpPresetRegistry, createFederationRuntime as createJiniFederationRuntime, type FederationRuntime } from "@jini-ai/mcp/federation";
import { tovuFederationMessages } from "./mcp-federation/presets.js";
import type { ToolRegistry } from "@jini-ai/core";

import { attachFederatedMcpTools, createFederationConsoleLogger, resolveRegisteredPresets } from "./mcp-federation/bootstrap.js";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
import type { McpSessionPort } from "@jini-ai/mcp/federation";
import { createFederationReloadCoordinator } from "./mcp-federation/reload-adapter.js";
import type { FederationReloadResult } from "@jini-ai/mcp/federation";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/**
 * @file Tovu binds its registry, approval deps, preset registry, refusal copy and reload adapter to
 * Jini's per-process federation runtime (`@jini-ai/mcp/federation` `createFederationRuntime`), shared
 * by daemon and BYOK composition. The boot/reload accounting and its rationale live at the Jini owner.
 */

/** Everything one process needs to build its own federation runtime. */
export interface CreateFederationRuntimeParams {
  readonly presetRegistry?: import("@jini-ai/mcp/federation").FederatedMcpPresetRegistry;
  readonly registry: ToolRegistry;
  readonly deps: FederationDeps;
  /** Reads the operator-editable roster fresh — today, `readEnabledExternalMcpConfigs` wrapped by
   *  `external-mcp-connection-source.ts`'s `createStoredExternalMcpConnectionSource`. Called once at
   *  boot and once per actual reload pass, never once per `reload()` caller — see
   *  `Jini packages/mcp/src/federation/reload.ts`'s own coalescing doc. */
  readonly resolveConnections: () => Promise<readonly ResolvedFederatedConnection[]>;
  /**
   * Resolved before `start()`'s own boot pass ever calls `attach` — today, the installed-extension
   * tools' registration promise, so a federated id can never win a registration race against an
   * installed-extension id for the same slot (`installed-extension-tools.ts`'s
   * `attachAssistantToolExtensions` is what wires this in). Defaults to an already-resolved promise
   * for a caller with nothing to wait on.
   */
  readonly after?: Promise<void>;
  /** Called once per reload pass that actually admitted something new — never for a no-op reload.
   *  The daemon rebinds its live tool catalog here; BYOK rebuilds its search index. */
  readonly onAdmitted?: (result: FederationReloadResult) => void;
  /** Refresh installed guidance on the same operator-triggered path; true invalidates discovery. */
  readonly beforeReload?: () => Promise<boolean>;
  /** The calling process's own console prefix — `"[agent-daemon]"` or `"[assistant-byok]"` — so both
   *  processes' boot logs stay byte-identical to what they printed before this runtime existed. */
  readonly log: string;
  /** Test seam — defaults to the real {@link attachFederatedMcpTools}. Shared by the boot pass and
   *  the reload coordinator, so a test double replaces every attach attempt this runtime ever makes. */
  readonly attach?: typeof attachFederatedMcpTools;
  /** Test seam — the session factory for the boot pass only, matching
   *  `AttachFederatedMcpToolsParams.connect`'s own scope: a reload pass never overrides `connect` (see
   *  `Jini packages/mcp/src/federation/reload.ts`'s `runOnePass`), so this has nothing to thread through there. */
  readonly connect?: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
}

/**
 * Builds one process's federation runtime. Nothing here performs I/O until `start()` or `reload()` is
 * called — constructing this is free, which is what lets a caller (`installed-extension-tools.ts`)
 * build it unconditionally and leave starting it to whichever root decides when.
 *
 * @complexity O(1) to construct; `start()`/`reload()` inherit their cost from `attachFederatedMcpTools`
 * and `createFederationReloadCoordinator`.
 * @overallScore 100
 */
export function createFederationRuntime(params: CreateFederationRuntimeParams): FederationRuntime {
  const presetRegistry = params.presetRegistry ?? createFederatedMcpPresetRegistry({});
  const attach = params.attach ?? attachFederatedMcpTools;
  const connect = params.connect ? { connect: params.connect } : {};
  return createJiniFederationRuntime({
    logger: createFederationConsoleLogger({ prefix: params.log }), messages: tovuFederationMessages, resolveConnections: params.resolveConnections,
    boot: ({ extraConnections, logger }) => attach({ presetRegistry, registry: params.registry, deps: params.deps, extraConnections, logger, ...connect }),
    resolvePresetConnections: ({ logger }) => resolveRegisteredPresets({ env: process.env, logger, registry: presetRegistry }),
    createReloadCoordinator: ({ resolveConnections, logger, initiallyAdmitted, initiallyAwaitingGrants }) => createFederationReloadCoordinator({
      coordDeps: { registry: params.registry, deps: params.deps, resolveConnections, attach, logger, ...connect }, initiallyAdmitted,
    }, { initiallyAwaitingGrants }),
  }, {
    ...(params.after ? { after: params.after } : {}),
    ...(params.onAdmitted ? { onAdmitted: params.onAdmitted } : {}),
    ...(params.beforeReload ? { beforeReload: params.beforeReload } : {}),
  });
}
