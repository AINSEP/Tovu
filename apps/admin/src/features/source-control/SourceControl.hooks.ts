import { navigate } from "@jini-ai/admin/shell/lib/router";

/** Keep this panel's selected tab in its deep link. */
export function navigateSourceControlTab({ nextTabId }: { nextTabId: string }, _options = {}) {
  navigate({ routePath: `/source-control?tab=${nextTabId}` }, { replace: true });
}
