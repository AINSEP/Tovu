/**
 * @file Registers the three optional, workspace-scoped extension-tool families — installed Agent
 * Plugins, installed Agent Skills, and enabled plugin-runtime capability tools (Word Count today) —
 * onto one `ToolRegistry`. Extracted from `agent-daemon-server.ts`'s `start()` (where the three blocks
 * used to live inline, each with its own placement/ordering/fail-open rationale repeated three times)
 * so `byok-tool-surface.ts` can call the IDENTICAL sequence, in the IDENTICAL order, with the
 * IDENTICAL fail-open behavior, rather than growing a second hand-written copy that could drift the
 * way `process-root-parity.test.ts` exists to catch (F4a,
 * `ADS-memory/.local-artifacts/tool-design-audit-2026-09-24.md`) — before this file, BYOK mode could
 * not see an installed Agent Plugin's tool, an installed Agent Skill's tool, or an enabled
 * plugin-capability tool at all, even though the daemon path already could.
 *
 * Each of the three registrars is awaited individually and wrapped in its OWN `try/catch` — not one
 * catch around all three — so one family's unreadable disk tree (a corrupt plugin package, an
 * unparsable `SKILL.md`) does not also withhold the other two, matching the original three
 * independent blocks this file replaces. `log` is the calling process's own console-prefix
 * (`"[agent-daemon]"` / `"[assistant-byok]"`), so the warning text a reader already recognizes from
 * the daemon's boot log is unchanged for that caller.
 *
 * Both real callers need this to run, and be fully applied to the registry, BEFORE they snapshot that
 * registry into a `search_tools` index (`buildToolCatalogQuery` — a one-shot FTS build; a tool
 * registered after it is executable but invisible to search): `agent-daemon-server.ts` awaits this
 * call directly inside `start()`, before its own `buildToolCatalogQuery`; `byok-tool-surface.ts`
 * exposes the same promise as its returned surface's `ready` field, which
 * `modules/assistant-byok.ts`'s turn route awaits once before dispatching a turn.
 */
import type { ToolRegistration, ToolRegistry } from "@jini-ai/core";

import { registerInstalledAgentPluginTools } from "../features/agent-plugins/tool-registrations.js";
import { registerInstalledSkillTools } from "../features/skills/tool-registrations.js";
import {
  registerEnabledPluginCapabilityTools,
  type PluginCapabilityToolDeps,
} from "../features/plugin-runtime/capability-tool-registrations.js";
import type { PluginDiscoveryRecord } from "../features/plugin-runtime/discovery.js";

import { createFederationRuntime, type FederationRuntime } from "./external-mcp-federation-runtime.js";
import type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
import type { McpSessionPort } from "./mcp-federation/ports.js";
import type { FederationReloadResult } from "./mcp-federation/reload.js";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/** Everything {@link registerInstalledExtensionTools} needs from its caller: the plugin-capability
 *  family's own deps (`workspaceId`, `authorize`, `postRepo`, `pluginActivationRepo` —
 *  {@link PluginCapabilityToolDeps}), plus `discoverPlugins`, the one field that family's own
 *  `registerEnabledPluginCapabilityTools` declares as an inline addition rather than part of that
 *  type (see that function's own signature). The agent-plugin and skill registrars need only
 *  `workspaceId`, which this already carries. */
export interface InstalledExtensionToolDeps extends PluginCapabilityToolDeps {
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
}

/** Registers every installed Agent Plugin, installed Agent Skill, and enabled plugin-runtime
 *  capability tool directly onto `registry`, in that fixed order. Never throws or rejects: each of
 *  the three sub-registrations degrades independently, on its own disk read failing open, to a
 *  `console.warn` naming the family and the underlying error, matching this repo's other optional
 *  extension registrars. A workspace with nothing installed in any of the three families is the
 *  common case, and costs three fast, empty reads.
 *  @complexity O(p + s + c) in the installed-plugin, installed-skill, and enabled-capability counts
 *  for this one workspace — each family's own loader is the cost driver, not this function. */
export async function registerInstalledExtensionTools(
  registry: { readonly register: (registration: ToolRegistration) => void },
  deps: InstalledExtensionToolDeps,
  log: string,
): Promise<void> {
  try {
    await registerInstalledAgentPluginTools(registry, { workspaceId: deps.workspaceId });
  } catch (error) {
    console.warn(
      `${log} agent-plugin tools could not be registered, continuing without them — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await registerInstalledSkillTools(registry, { workspaceId: deps.workspaceId });
  } catch (error) {
    console.warn(
      `${log} skill tools could not be registered, continuing without them — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await registerEnabledPluginCapabilityTools(registry, {
      authorize: deps.authorize,
      workspaceId: deps.workspaceId,
      postRepo: deps.postRepo,
      discoverPlugins: deps.discoverPlugins,
      pluginActivationRepo: deps.pluginActivationRepo,
    });
  } catch (error) {
    console.warn(
      `${log} plugin capability tools could not be registered, continuing without them — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

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
}

export interface AssistantToolExtensions {
  /** {@link registerInstalledExtensionTools}'s own promise, unchanged — resolves once installed Agent
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
 * @complexity O(1) beyond what {@link registerInstalledExtensionTools} and
 * {@link createFederationRuntime} themselves cost.
 * @overallScore 100
 */
export function attachAssistantToolExtensions(
  registry: ToolRegistry,
  deps: AttachAssistantToolExtensionsDeps,
  log: string,
): AssistantToolExtensions {
  const installed = registerInstalledExtensionTools(registry, deps, log);
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
