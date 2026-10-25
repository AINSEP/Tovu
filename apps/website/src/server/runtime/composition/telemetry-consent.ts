import { getEffective, type SettingsRepoPort } from "@jini-ai/core/settings";
import type { ProductAnalyticsConsent, ProductAnalyticsConsentRevision } from "@jini-ai/analytics/product";

/**
 * @file The operator's telemetry consent for product analytics: the EXISTING
 * `core.privacy.telemetry.metrics` setting (Jini core `settings/ui-tab-definitions.ts`, default off,
 * human-only), registered with "no adapter to gate" (`features/analytics/config.settings.ts`) until a
 * product-analytics provider existed. Only an explicit `true` allows sending; unset, false, a
 * non-boolean or a read error all mean no. Read per event, so turning it off stops the next event.
 *
 * Revision (obs review #2): the read is async, so an approval can resolve after a revoke. The guard
 * re-checks a synchronous revision right before delivery; this one changes on every settings value
 * write through the composition's settings repo (before AND after the write, so a read that started
 * before or during it is invalidated). Over-invalidation only drops events in flight during an
 * unrelated settings write (fail closed). What it does NOT see: a write from another process or
 * another repo instance — those still stop every event read after them.
 */

export const TELEMETRY_CONSENT = { namespace: "core.privacy", key: "telemetry.metrics" } as const;

const VALUE_WRITES = ["saveGlobalValue", "saveWorkspaceValue", "saveUserValue"] as const;

/**
 * Binds consent to one workspace's setting and instruments the repo's value writes with a revision.
 * @param required The composition's settings repo (its write methods are wrapped in place) and workspace.
 * @returns `{ consent, consentRevision }` for `withProductAnalyticsGuards`.
 * @complexity O(1) per check plus one settings read per event.
 */
export function createTelemetryConsent({ settingsRepo, workspaceId }: { settingsRepo: SettingsRepoPort; workspaceId: string }): { consent: ProductAnalyticsConsent; consentRevision: ProductAnalyticsConsentRevision } {
  let revision = 0;
  for (const method of VALUE_WRITES) {
    const write = settingsRepo[method].bind(settingsRepo);
    settingsRepo[method] = async (record) => {
      revision += 1;
      try { return await write(record); } finally { revision += 1; }
    };
  }
  return {
    consent: async () => (await getEffective({ repo: settingsRepo }, { ...TELEMETRY_CONSENT, scopeContext: { workspaceId } }))?.value === true,
    consentRevision: () => revision,
  };
}
