import { useEffect, useMemo } from "react";

import { adminTelemetry, toAdminRouteTemplate, type BrowserTelemetry } from "../lib/browser-telemetry";

/**
 * Feeds the admin's telemetry its session state and current route TEMPLATE; a route change sends
 * one debounced page view (`lib/browser-telemetry.ts`). Signing in on the same screen counts as
 * arriving there, so the effect also re-runs on `signedIn`.
 * @complexity O(s·p) per route change (template build), O(1) otherwise.
 */
export function useAdminTelemetry(
  { signedIn, routePath, params }: { signedIn: boolean; routePath: string; params: Readonly<Record<string, string>> },
  { telemetry = adminTelemetry }: { telemetry?: Pick<BrowserTelemetry, "setSignedIn" | "setRoute"> } = {},
): void {
  const route = useMemo(() => toAdminRouteTemplate({ routePath, params }), [routePath, params]);
  useEffect(() => {
    telemetry.setSignedIn(signedIn);
    telemetry.setRoute(route);
  }, [telemetry, signedIn, route]);
}
