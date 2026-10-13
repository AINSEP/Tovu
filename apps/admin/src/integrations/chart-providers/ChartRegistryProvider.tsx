/** Bootstrap one chart snapshot for the authenticated shell, before either card branch consumes it. */
import type { ReactNode } from "react";
import { AdminChartRegistryContext } from "./chart-registry-context";
import { useWiredAdminChartRegistry } from "./use-chart-registry.hooks";

/** Props-only composition; Jini's query cache owns request settlement and the hook owns refresh.
 * @example <ChartRegistryProvider principalId={user.id}>{children}</ChartRegistryProvider>
 */
export function ChartRegistryProvider({ principalId, children }: { principalId: string; children: ReactNode }) {
  const snapshot = useWiredAdminChartRegistry({ principalId });
  return <AdminChartRegistryContext.Provider value={snapshot}>{children}</AdminChartRegistryContext.Provider>;
}
