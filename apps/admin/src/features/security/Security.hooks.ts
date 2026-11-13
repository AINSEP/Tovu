import { navigate } from "../../lib/router";

/** Keep this panel's selected tab in its deep link. */
export function navigateSecurityTab({ nextTabId }: { nextTabId: string }, _options = {}) {
  navigate(`/access-tokens?tab=${nextTabId}`, { replace: true });
}
