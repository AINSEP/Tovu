import { Workspace as WorkspaceScreen } from "@jini-ai/admin/screens/workspace/Workspace";

import { useWiredWorkspace } from "./hooks/use-workspace.hooks";
import "./workspace.css";

/**
 * @file The host binding for the Workspace admin screen (SPEC-044): the screen's markup now lives in
 * `@jini-ai/admin/screens/workspace/Workspace`; this wrapper injects the wired workspace hook and
 * this install's delete-notice copy (keys into `workspace-i18n.ts`, resolved by the hook's bound
 * `t`) and loads the `jini-*` styles the screen's own classes need.
 *
 * The "Delete workspace" control is REQ-07's deliberate choice: present, not hidden, but always
 * disabled with an explanatory notice — `DELETE_WORKSPACE` always refuses in v1 (INV-03, a real
 * guard, not a stub). The explanation is product copy, so it stays here.
 */
const DELETION = {
  lead: "Every Tovu install must always have at least one workspace, so deleting your only workspace is not available. This becomes available once this install supports more than one workspace.",
  unavailableTitle: "Not available — this install has only one workspace",
};

export interface WorkspaceProps {
  /** Test seam — defaulted to the real wired hook, so production callers pass nothing. */
  useWorkspaceHook?: typeof useWiredWorkspace;
  /** `false` when mounted as the settings screen's `"workspace"` tab (its shell shows the title). */
  showPageHeader?: boolean;
}

/** Renders the shared workspace screen with this host's hook and copy. @complexity O(1). */
export function Workspace({ useWorkspaceHook = useWiredWorkspace, showPageHeader = true }: WorkspaceProps = {}) {
  return <WorkspaceScreen useWorkspaceHook={useWorkspaceHook} deletion={DELETION} showPageHeader={showPageHeader} />;
}
