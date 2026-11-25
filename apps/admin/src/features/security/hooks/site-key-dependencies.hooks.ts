import { useCallback } from "react";
import { useFetchQuery, useFetchMutation, useCachedLoader } from "@jini-ai/ui/fetch-query";
import { useSiteKey, type SiteKeyController } from "@jini-ai/integrations/react/site-key/hooks/use-site-key.hooks";
import { useSiteKeyRecovery, type SiteKeyRecoveryController } from "@jini-ai/integrations/react/site-key/hooks/use-site-key-recovery.hooks";
import { ApiError, describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { tSecurity as defaultT } from "@/lib/i18n-common";
import { siteKeyLoadErrorMessage, siteKeyRevealErrorMessage } from "@jini-ai/admin/security/security-i18n";
import { sitesApi } from "@/features/sites/api/sites-api";
import type { SiteKeyPort } from "@jini-ai/core/contracts/site/site-key";

/** The live implementation, as a module-level singleton — matches
 *  `defaultAccessTokensPort`'s own convention. Every method is a thin bind onto an existing
 *  `api.*` call. */
export const defaultSiteKeyPort: SiteKeyPort = {
  status: () => sitesApi.getSiteKeyStatus(),
  reveal: () => sitesApi.revealSiteKey(),
  generate: () => sitesApi.generateSiteKey(),
  importSiteKey: ({ siteKey }, _optional = {}) => sitesApi.importSiteKey({ siteKey }),
  previewStartFresh: () => sitesApi.previewSiteKeyStartFresh(),
  startFresh: ({ confirm }, _optional = {}) => sitesApi.startFreshSiteKey({ confirm }),
};

export function readApiRefusal({ error }: { error: unknown }, _optional: Record<string, never> = {}) {
  if (!(error instanceof ApiError)) return null;
  return { code: error.code, message: error.message, detail: typeof error.body?.detail === "string" ? error.body.detail : undefined };
}

/**
 * Binds the real port, and a `t` bound to the real resolved locale — the zero-argument
 * `useX(dependencies)` / `useWiredX()` pair, same shape `useWiredOtherCredentials` documents.
 */
export function useWiredSiteKey(): SiteKeyController {
  const locale = useAdminLocale();
  const boundT = useCallback((key: string): string => defaultT({ locale: locale, key: key }), [locale]);
  return useSiteKey({ port: defaultSiteKeyPort, t: boundT, locale, queryHooks: { useFetchQuery, useFetchMutation, useCachedLoader }, describeApiError, readApiRefusal, copy: { siteKeyLoadErrorMessage, siteKeyRevealErrorMessage, unknownError: "unknown error" } });
}

/** Binds the real port and the resolved locale — same `useWired*` shape as `useWiredSiteKey`. */
export function useWiredSiteKeyRecovery({ onRecovered }: { onRecovered: (() => Promise<void> | void) | undefined }, _optional: Record<string, never> = {}): SiteKeyRecoveryController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => defaultT({ locale: locale, key: key });
  return useSiteKeyRecovery({ port: defaultSiteKeyPort, t: boundT, onRecovered, describeApiError, readApiRefusal, copy: { unknownError: "unknown error" } });
}
