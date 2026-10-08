import { toolMetadata } from '../../contracts/core/tool-metadata/settings.js';
import { withToolMetadata } from '@jini-ai/core';
import { ASSISTANT_EXECUTION_APPROVAL_SETTINGS } from "../../contracts/headless/assistant-tool-approval-policy.js";
/**
 * @file Settings' agent-tool registrations — adapted from `@jini-ai/core/settings`.
 *
 * The package owns the catalog, validation and writes. This host adapter supplies the shared
 * human card for the six assistant execution escalations and the existing site-title validator.
 * It contributes those tools through the same registration seam used before value writes existed.
 *
 * Converted to the standard `registerToolContributor` pattern 2026-08-17, the last domain to do so —
 * see `assistant/tool-registrations.ts`'s own former `settings` `DOMAIN_SLICES` entry (now removed)
 * for the full trace of why this was a genuinely different shape of blocker than every other
 * conversion in this rollout, not just a later-scheduled one. Short version: `settings` itself had NO
 * edge into `assistant` before this file's `contributeSettingsTools()` below — the blocker was that 3
 * OTHER files inside `assistant/` (`public-assistant-settings.ts`, `custom-instructions.ts`,
 * `execution-mode-settings.ts`) value-imported `features/settings`'s engine functions directly
 * (`getEffective`/`resolveDefinitionRaw`/`registerDefinitions`/`set`/`ensureSettingDefinitions`),
 * which would have closed a 2-node `[assistant, features/settings]` cycle the moment this file added
 * the reverse `features/settings -> assistant` edge below. Those 3 files now take those 5 functions
 * (plus the `SCOPE_BIT`/`INSTRUCTIONS_NAMESPACE` constants, injected for uniformity with the rest of
 * each file's deps surface) as injected deps fields instead of static imports — the same Option-B-style
 * technique `vendor-credentials/store.ts`'s `extractGitHubLogin`, `dual-read.ts`'s legacy-table
 * imports, and `assistant/site/*`'s `listPublishedPosts` already use elsewhere in this rollout —
 * wired to the real `features/settings` implementations at the composition root
 * (`RouteDeps.getEffective`/`.set`/`.instructionsNamespace` in `server/routes/types.ts`, populated
 * once in both `server/app.ts`/`server/deps.ts`; the boot-time `ensure*` registrars' own
 * `resolveDefinitionRaw`/`registerDefinitions`/`scopeBit`/`ensureSettingDefinitions` fields populated
 * at each of their 2+2 call sites in the same 2 files). `check:architecture` confirms 0 module cycles
 * / largest SCC 0 with `settings` wired this way.
 */
import type { ToolContributor } from "#src/assistant/index";
import type { ToolExecutionOptions, ToolExecutionContext, ToolRegistration, RememberedApprovalPort } from "@jini-ai/core";
import { buildSettingsRegistrations as buildCmsSettingsRegistrations, settingsDerivedRisk, type SettingsToolDeps as CoreSettingsToolDeps, type AgentSettingWriteRule } from "@jini-ai/core/settings";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { set } from "./site-title-write.js";

export { settingsDerivedRisk } from "@jini-ai/core/settings";

/** Native grants are bound to the invoking plugin's admitted identity/version/digest, never model input. */
export type SettingsToolDeps = CoreSettingsToolDeps & {
  nativeApprovalMemory?: RememberedApprovalPort;
  approvalIdentityForRun?: (required: { ctx: ToolExecutionContext }) => Promise<{ key: string; label: string; version?: string }>;
};

/** Host-owned assistant configuration: changes are possible only after a human card.
 * Credentials are not settings: core.execution intentionally omits byok.apiKey; provider
 * credentials, OAuth state and external-MCP grants use their own repositories. */
export const TOVU_CONFIRMATION_SETTINGS: readonly AgentSettingWriteRule[] = ASSISTANT_EXECUTION_APPROVAL_SETTINGS;

/** Wires the generic cms tools to the host's authenticated card transport and title validator.
 * Card parameters carry only a decision, never replacement setting coordinates or values.
 * @complexity O(t) registration construction; one bounded card exchange per protected write. */
export function buildSettingsRegistrations(routeDeps: SettingsToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return withToolMetadata({ metadata: toolMetadata, registrations: buildCmsSettingsRegistrations({
    ...routeDeps,
    setValue: set,
    confirmationSettings: TOVU_CONFIRMATION_SETTINGS,
    // `options` carries the transport's emitSurface; without it the card has no way to reach a human.
    // Declared optional so this still type-checks against a @jini-ai/cms whose confirmWrite takes one argument.
    confirmWrite: async ({ ctx, toolId, namespace, key, scope, previous, value, reason }, options?: ToolExecutionOptions) => {
      // Reuse the invoking plugin's canonical enable grant. Escalation consent applies once to
      // that admitted identity/version/digest; it never replaces fresh per-write scope permissions.
      const handler = approvalToolHandler({ surfaces,
        prepare: async ({ ctx: snapshot }) => {
          const identity = await routeDeps.approvalIdentityForRun?.({ ctx: snapshot });
          return { rememberKey: identity?.key, identity };
        },
        describe: ({ prepared }) => ({ toolId, errorCode: "SETTINGS",
          title: toolId === "settings_set_value" ? "Change this assistant setting?" : "Clear this assistant setting override?",
          description: reason + (prepared.identity ? ". This escalation approval is saved for this plugin identity, version and digest. It also covers enabling this plugin and the six assistant execution settings; every action still checks its current permissions." : ""),
          details: [...(prepared.identity ? [{ label: "Plugin", value: prepared.identity.label },
            ...(prepared.identity.version ? [{ label: "Plugin version", value: prepared.identity.version }] : [])] : []), { label: "Setting", value: `${namespace}.${key}` }, { label: "Scope", value: scope },
            { label: "Previous override", value: JSON.stringify(previous) },
            { label: "New value", value: toolId === "settings_clear_value" ? "Fall back to the next layer or default" : JSON.stringify(value ?? null) }],
          confirmLabel: "Confirm change",
        }),
        // The settings owner retains fresh authorization, layer-sequence and definition-version checks.
        run: async ({ ctx: snapshot, prepared }) => {
          const currentKey = (await routeDeps.approvalIdentityForRun?.({ ctx: snapshot }))?.key;
          return { confirmed: !snapshot.signal.aborted && currentKey === prepared.rememberKey };
        },
      }, { remembered: routeDeps.nativeApprovalMemory, rememberKey: ({ prepared }) => prepared.rememberKey,
        declined: () => ({ confirmed: false }),
      });
      // No credentials enter this description; they use the secret-card engine and separate stores.
      const result = await handler(ctx, options) as { confirmed: boolean; key?: string };
      return result.confirmed;
    },
  }) });
}

/**
 * Contributes Settings' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildSettingsRegistrations`/
 * `settingsDerivedRisk` by name, and `server/tool-catalog-manifest.ts` no longer inlines this
 * `registerToolContributor` call itself — this is the seam that replaced both, the same shape every
 * other domain in this rollout uses (see this file's header for why `settings` needed the 3 side-door
 * files fixed first rather than converting directly).
 */
export function contributeSettingsTools(): ToolContributor {
  return { domain: "settings", build: buildSettingsRegistrations, risk: settingsDerivedRisk };
}
