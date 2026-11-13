import { navigate } from "../../lib/router";

/** Keep this panel's selected tab in its deep link. */
export function navigateSourceControlTab({ nextTabId }: { nextTabId: string }, _options = {}) {
  navigate(`/source-control?tab=${nextTabId}`, { replace: true });
}
