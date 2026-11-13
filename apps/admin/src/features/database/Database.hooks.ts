import { navigate } from "../../lib/router";

/** Keep this panel's selected tab in its deep link. */
export function navigateDatabaseTab({ nextTabId }: { nextTabId: string }, _options = {}) {
  navigate(`/database?tab=${nextTabId}`, { replace: true });
}
