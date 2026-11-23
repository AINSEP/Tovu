/** The only chart bootstrap client binding; retries and session handling stay in the existing API. */
import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "../../lib/admin-http/config";
import type { AdminChartProviderSnapshot } from "@jini-ai/core/contracts/headless/chart-providers";
import type { ChartRegistryPort } from "./chart-registry-port.hooks";

export const defaultChartRegistryPort: ChartRegistryPort = {
  readSnapshot: async () => (await authenticatedAdminRequest<{ data: AdminChartProviderSnapshot }>({
    method: "GET", path: `/workspaces/${encodeURIComponent(WORKSPACE_ID)}/chart-providers`,
  })).data,
};

/** A mutable fixture for boot/configuration-change tests; it performs no I/O.
 * @complexity O(1) construction and reads.
 * @example const port = createFakeChartRegistryPort({ snapshot });
 */
export function createFakeChartRegistryPort(
  { snapshot }: { snapshot: AdminChartProviderSnapshot }, _options: Record<string, never> = {},
): ChartRegistryPort & { snapshot: AdminChartProviderSnapshot } {
  return { snapshot, async readSnapshot() { return this.snapshot; } };
}
