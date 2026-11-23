/**
 * @file The serial boot chain that registers Tovu's settings definitions. Moved verbatim out of `app.ts`;
 * both composition roots (`app.ts`'s in-memory root, `deps.ts`'s SQLite root) call it.
 */

import { ensureCommentsProviderDefinition } from '#src/features/comments/provider-selection';
import { ensureSeoSettingDefinitions, type EnsureSeoSettingDefinitionsDeps } from "#src/features/seo/index";
import { ensurePublicAssistantSettingDefinitions, ensureExecutionSettingDefinitions } from "../../../assistant/index.js";
import { ensureSettingDefinitions, type EnsureSettingDefinitionsDeps } from "#src/features/settings/index";
import { ensureSettingsUiTabDefinitions } from "@jini-ai/cms/webmcp/settings";
import { ensureCommentsSettingDefinitions } from "#src/features/comments/index";
import { ensureAnalyticsSettingDefinitions } from "#src/features/analytics/config.settings";

/** Tovu's shared boot order; feature modules retain ownership of their definitions.
 * Both roots expose the intermediate promises while keeping their later registrations separate.
 * Rejections propagate through the same serial chain; callers observe its tail.
 * @complexity O(1) registrations and readiness promises; no parallel settings writers.
 */
export function startSettingsRegistration(required: {
  deps: EnsureSeoSettingDefinitionsDeps & EnsureSettingDefinitionsDeps;
  settingsReady: Promise<void>;
  workspaceId: string;
  systemPrincipalId: string;
}, _options = {}) {
  const { deps, settingsReady, workspaceId, systemPrincipalId } = required;
  // SPEC-008 (ADR-PIPE-008 Decision §3, T050) — idempotently registers the 8 `site.seo.*`
  // definitions at boot, mirroring `settingsReady`'s fire-and-forget shape. Chained AFTER
  // `settingsReady` resolves, not fired in parallel with it — both are SQLite writers on the
  // SAME single better-sqlite3 connection, and `SettingsWriteService`'s chokepoint opens a real
  // `BEGIN IMMEDIATE` transaction; two independent async chains racing to BEGIN on one connection
  // throws "cannot start a transaction within a transaction" (caught directly, not theoretical).
  const seoReady = settingsReady.then(() =>
    ensureSeoSettingDefinitions(deps, { workspaceId, systemPrincipalId }).then(() => undefined)
  );

  // SPEC-035 (ADR-028 Settings Layered Ledger wiring for Comments) — idempotently registers the 6
  // `comments.*` definitions at boot, mirroring `seoReady`'s exact fire-and-forget shape. Chained
  // AFTER `seoReady` resolves, not fired in parallel — same single-SQLite-connection transaction
  // hazard `seoReady`'s own comment documents immediately above.
  const commentsSettingsReady = seoReady.then(() =>
    ensureCommentsSettingDefinitions(deps, { workspaceId, systemPrincipalId })
      .then(() => ensureCommentsProviderDefinition({ deps, systemPrincipalId }))
  );

  // The visitor-facing assistant's master switch (`assistant/public-assistant-settings.ts`).
  // Chained after `commentsSettingsReady`, not fired in parallel, for the same
  // single-SQLite-connection transaction hazard `seoReady`'s comment above documents. Registering
  // the definition does NOT enable anything: its default is `false`.
  const assistantSettingsReady = commentsSettingsReady.then(() =>
    ensurePublicAssistantSettingDefinitions(
      { ...deps, ensureSettingDefinitions },
      { workspaceId, systemPrincipalId }
    ).then(() => undefined)
  );

  // The admin "Execution mode" tab's `core.execution.*` definitions
  // (`assistant/execution-mode-settings.ts`). Chained after `assistantSettingsReady` rather than
  // fired in parallel, for the identical single-SQLite-connection-transaction reason `seoReady`'s
  // own comment above documents. `ownerKind: "core"` (not "site"), so unlike the three bindings
  // above this one does not pass a `workspaceId` into the registration call — see that file's
  // header for the namespace-fence reasoning.
  const executionSettingsReady = assistantSettingsReady.then(() =>
    ensureExecutionSettingDefinitions(
      { ...deps, ensureSettingDefinitions },
      { systemPrincipalId }
    ).then(() => undefined)
  );

  // The remaining ledger-only settings-dialog tabs (Instructions, Notifications, Privacy).
  // Chained after `executionSettingsReady` rather than fired alongside it for the same
  // single-SQLite-connection-transaction reason every registration above documents.
  const settingsUiTabsReady = executionSettingsReady.then(() =>
    ensureSettingsUiTabDefinitions(deps, { systemPrincipalId }).then(() => undefined)
  );

  // The public analytics beacon's `core.analytics.*` definitions (`analytics/config.settings.ts`).
  // Chained after `settingsUiTabsReady` rather than fired alongside it, for the identical
  // single-SQLite-connection-transaction reason every registration above documents.
  const analyticsSettingsReady = settingsUiTabsReady.then(() =>
    ensureAnalyticsSettingDefinitions(deps, { systemPrincipalId }).then(() => undefined)
  );

  return { seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady };
}
