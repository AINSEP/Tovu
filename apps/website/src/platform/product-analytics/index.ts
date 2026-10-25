import { createRequire } from "node:module";

import { createNoopProductAnalytics, withProductAnalyticsGuards, type ProductAnalyticsConsent, type ProductAnalyticsPort } from "@jini-ai/analytics/product";
import { getEffective, type SettingsRepoPort } from "@jini-ai/core/settings";

export { createNoopProductAnalytics, isNoopProductAnalytics, type ProductAnalyticsPort } from "@jini-ai/analytics/product";

/**
 * @file Product analytics selection for Tovu: how owners use Tovu (not site-visitor analytics, which
 * is `features/analytics`). Same shape as `platform/observability/index.ts`: core keeps only the
 * vendor-neutral port (`@jini-ai/analytics/product`), the noop and selection by config; the PostHog
 * adapter is a Jini provider subpath (`@jini-ai/analytics/product/posthog`) required lazily, only when
 * `POSTHOG_API_KEY` is set, so an install without it never loads `posthog-node`.
 *
 * CONSENT (the existing system, not a new one): `core.privacy.telemetry.metrics`, the operator's
 * "share anonymous usage data" decision (Jini core `settings/ui-tab-definitions.ts`, default OFF; a
 * human-only setting the agent cannot write, `agent-writable-preferences.ts`). It was registered with
 * "no adapter to gate" (`features/analytics/config.settings.ts`); this is that adapter. Read per event,
 * so turning it off stops the next event. A key alone sends nothing until a human opts in.
 */

const require = createRequire(import.meta.url);

export type PostHogConfig = { enabled: false } | { enabled: true; apiKey: string; host: string };

/** PostHog's US cloud ingestion host; EU or self-hosted operators set `POSTHOG_HOST`. */
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Resolves the optional PostHog product-analytics provider from an explicit environment snapshot:
 * PostHog's own documented names (`POSTHOG_API_KEY`, `POSTHOG_HOST`), the key's presence is the opt-in.
 * @param required Operator environment; composition owns the process.env read.
 * @returns Disabled config, or the project key and ingestion host.
 * @complexity O(1).
 */
export function resolvePostHogConfig({ env }: { env: NodeJS.ProcessEnv }): PostHogConfig {
  const apiKey = env.POSTHOG_API_KEY?.trim();
  if (!apiKey) return { enabled: false };
  return { enabled: true, apiKey, host: env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST };
}

/** The settings namespace/key of the operator's telemetry consent (Jini core ui-tab definitions). */
export const TELEMETRY_CONSENT = { namespace: "core.privacy", key: "telemetry.metrics" } as const;

/**
 * The consent check over this workspace's `core.privacy.telemetry.metrics`: only an explicit `true`
 * allows sending; unset, false, a non-boolean or a read error all mean no.
 * @param required The settings repo and the workspace whose operator decided.
 * @returns A consent function for `withProductAnalyticsGuards`.
 */
export function createTelemetryConsent({ settingsRepo, workspaceId }: { settingsRepo: SettingsRepoPort; workspaceId: string }): ProductAnalyticsConsent {
  return async () => (await getEffective({ repo: settingsRepo }, { ...TELEMETRY_CONSENT, scopeContext: { workspaceId } }))?.value === true;
}

/**
 * Selects the product-analytics port: the shared noop, or the guarded PostHog provider.
 * @param required Resolved PostHog config and the consent check.
 * @param optional `onDispose` receives the provider's teardown (the site store's `onClose`).
 * @returns A port features call; never throws at call time.
 * @complexity O(1); the disabled branch never touches the module resolver.
 */
export function createProductAnalytics({ config, consent }: { config: PostHogConfig; consent: ProductAnalyticsConsent }, { onDispose }: { onDispose?: (dispose: () => Promise<void>) => void } = {}): ProductAnalyticsPort {
  if (!config.enabled) return createNoopProductAnalytics({});
  const { createPostHogProductAnalyticsAdapter }: typeof import("@jini-ai/analytics/product/posthog") = require("@jini-ai/analytics/product/posthog");
  const { port, dispose } = createPostHogProductAnalyticsAdapter({ config });
  onDispose?.(dispose);
  return withProductAnalyticsGuards({ inner: port, consent });
}
