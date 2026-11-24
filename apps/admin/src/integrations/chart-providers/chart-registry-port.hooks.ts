/** This host's authenticated metadata read; browser loading remains in @jini-ai/ui/charts/browser. */
import type { AdminChartProviderSnapshot } from "@jini-ai/core/contracts/headless/chart-providers";
export interface ChartRegistryPort {
  readSnapshot(input: Record<string, never>, options?: Record<string, never>): Promise<AdminChartProviderSnapshot>;
}
