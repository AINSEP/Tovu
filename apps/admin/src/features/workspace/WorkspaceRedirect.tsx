import { useWorkspaceRedirect } from "./hooks/use-workspace-redirect.hooks";

/**
 * @file The retired `/admin/workspace` index route's own screen — markup only (there is none):
 * this component's entire job is to redirect, via {@link useWorkspaceRedirect}. See `panels.tsx`'s
 * own comment on the `workspace` panel for why this exists instead of the panel simply losing its
 * `render` branch, and why the panel's id/route stay even though its nav row does not.
 */
export function WorkspaceRedirect() {
  useWorkspaceRedirect();
  return null;
}
