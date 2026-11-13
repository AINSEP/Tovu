import { navigate } from "../../lib/router";

/** Keep this panel's selected tab in its deep link. */
export function navigateDeploymentTab({ nextTabId }: { nextTabId: string }, _options = {}) {
  navigate(`/deployment?tab=${nextTabId}`, { replace: true });
}
