import { FolderDropConfirmation } from "./FolderDropConfirmation";
import { FolderDropError } from "./FolderDropError";
import type { FolderDropNotice as FolderDropNoticeState } from "../../features/fs-files/hooks/use-folder-drop.hooks";

/**
 * @file Picks between `FolderDropConfirmation` and `FolderDropError` (or neither) from
 * `useFolderDrop`'s single `notice` slot — `ui.spec.md` §4's "at most one of
 * `FolderDropConfirmation` or `FolderDropError` is visible at a time" is true by construction here
 * (one `useState` slot in `use-folder-drop.hooks.ts` can only ever hold one shape), not by any
 * mutual-exclusion logic this component adds.
 *
 * Mounted in `AssistantDock.tsx`'s `leadingAccessory`, alongside `SelectedAgentPluginTray` — the same
 * "above the composer's textarea" slot `FsFolderIndicator` used to occupy (see that unpin's own
 * comment in `AssistantDock.tsx`) — never inside the message list, per `ui.spec.md` §6.
 */
export interface FolderDropNoticeProps {
  readonly notice: FolderDropNoticeState | null;
  readonly onDismiss: () => void;
  readonly onRetry: () => void;
}

export function FolderDropNotice({ notice, onDismiss, onRetry }: FolderDropNoticeProps) {
  if (notice === null) return null;
  if (notice.kind === "confirmation") {
    return (
      <FolderDropConfirmation
        path={notice.path}
        replacedPreviousPath={notice.replacedPreviousPath}
        onDismiss={onDismiss}
      />
    );
  }
  return <FolderDropError path={notice.path} reason={notice.reason} onRetry={onRetry} onDismiss={onDismiss} />;
}
