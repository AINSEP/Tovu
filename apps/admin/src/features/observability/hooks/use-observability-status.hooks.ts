import { useCallback as useQueryFetchCallback, useState } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";

import { describeApiError, type AdminObservabilityStatus, type AdminTelemetryTestResult } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translateObservability } from "../observability-i18n";
import { defaultObservabilityStatusPort } from "./observability-status-dependencies.hooks";
import type { ObservabilityStatusPort } from "./observability-status-port.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";

/**
 * @file State for the Observability screen's Overview tab, so `Observability.tsx` is only markup —
 * same split as `features/plugins/hooks/use-agent-plugins.hooks.ts` (`AgentPlugins.tsx`'s hook).
 *
 * `t`/`locale` are resolved here, not read directly by `Observability.tsx` — same standing i18n
 * rule that hook's own header documents (2026-08-11).
 */

export interface ObservabilityStatusDependencies {
  port: ObservabilityStatusPort;
  locale: string;
  t: Translate;
}

export interface ObservabilityStatusController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  status: AdminObservabilityStatus | null;
  error: string | null;
  /** Bound translator — `Observability.tsx`'s only source of UI copy. */
  t: Translate;
  /** The raw resolved locale — exposed only because `Observability.tsx` passes it straight
   *  through to `I18nProvider`'s own `initialLocale`, not because anything here needs it beyond
   *  `t`. Same reasoning as `AgentPluginsController.locale`. */
  locale: string;
  sendTestError?: () => Promise<void>;
  sendingTestError?: boolean;
  testResult?: AdminTelemetryTestResult | null;
  testError?: string | null;
  refresh?: () => void;
}

/**
 * Loads provider configuration and delivery evidence on mount and explicit refresh. The diagnostic
 * action uses the same authorized endpoint as the assistant tool and never submits error text.
 *
 * @complexity One GET on mount.
 */
export function useObservabilityStatus({ port, locale, t }: ObservabilityStatusDependencies): ObservabilityStatusController {
  const queryFetch = useQueryFetchCallback(async () => {
    try { return await port.getObservabilityStatus(); }
    catch (error) { throw new Error(describeApiError(error, translateObservability({ locale, key: "failed to load observability status" }))); }
  }, [port, locale]);
  const query = useFetchQuery({ key: ["observability", "status"], fetch: queryFetch }, { staleTime: 0 });
  const status = query.data ?? null;
  const error = query.error?.message ?? null;
  const [sendingTestError, setSendingTestError] = useState(false);
  const [testResult, setTestResult] = useState<AdminTelemetryTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const sendTestError = async (): Promise<void> => {
    if (sendingTestError || !port.sendTestError) return;
    setSendingTestError(true); setTestResult(null); setTestError(null);
    try { setTestResult(await port.sendTestError()); query.refetch(); }
    catch (failure) { setTestError(describeApiError(failure, t("Failed to send test error"))); }
    finally { setSendingTestError(false); }
  };
  return { status, error, t, locale, sendingTestError, testResult, testError, sendTestError, refresh: query.refetch };
}

/**
 * Binds the real `/api/.../system/observability-status` client and the real `useAdminLocale()` —
 * see `observability-status-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Observability.tsx` composes this and a test composes {@link useObservabilityStatus} with
 * `createFakeObservabilityStatusPort`.
 */
export function useWiredObservabilityStatus(): ObservabilityStatusController {
  const locale = useAdminLocale();
  const t = (key: string): string => translateObservability({ locale: locale, key: key });
  return useObservabilityStatus({ port: defaultObservabilityStatusPort, locale, t });
}
