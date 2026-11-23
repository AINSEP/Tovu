import { navigate } from "@jini-ai/admin/shell/lib/router";

/** Keep this panel's selected tab in its deep link. */
export function navigateSecurityTab({ nextTabId }: { nextTabId: string }, _options = {}) {
  navigate({ routePath: `/access-tokens?tab=${nextTabId}` }, { replace: true });
}
