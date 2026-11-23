import { navigate } from "@jini-ai/admin/shell/lib/router";

/** Keep this panel's selected tab in its deep link. */
export function navigateDeploymentTab({ nextTabId }: { nextTabId: string }, _options = {}) {
  navigate({ routePath: `/deployment?tab=${nextTabId}` }, { replace: true });
}
