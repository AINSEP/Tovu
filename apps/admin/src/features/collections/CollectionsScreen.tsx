import "../../styles/native-domain-dialogs.css";
import { Collections as CollectionsView } from "@jini-ai/admin/screens/collections/Collections";
import { ServerLabel } from "@/components/status-labels";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";
import { contentTypeMenuItems } from "./collections-host-ports";
import { useWiredCollections } from "./hooks/use-collections.hooks";
import { useWiredEditFieldsDialog } from "./hooks/use-edit-fields-dialog.hooks";
import { useWiredLifecycleConfirmDialog } from "./hooks/use-lifecycle-confirm-dialog.hooks";
import { useWiredNewContentTypeDialog } from "./hooks/use-new-content-type-dialog.hooks";

/**
 * @file The admin's Collections route: `@jini-ai/admin`'s `Collections` screen bound to this host —
 * every hook to its `useWiredX` binding (live port, admin locale, `collectionsHostKit`), this
 * admin's `ServerLabel` for status pills, its "Publish collections" button and the kit-bound
 * row-menu builder. The native-dialog stylesheet is imported here, at the screen mount.
 */

export interface CollectionsProps {
  /** Domain controllers stay injectable while Jini owns every dialog's native lifecycle. */
  dialogHooks?: {
    useNewContentTypeDialogHook?: typeof useWiredNewContentTypeDialog;
    useEditFieldsDialogHook?: typeof useWiredEditFieldsDialog;
    useLifecycleConfirmDialogHook?: typeof useWiredLifecycleConfirmDialog;
  };
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before. See `PostsProps.usePostsHook` for the full rationale.
   */
  useCollectionsHook?: typeof useWiredCollections;
}

export function Collections({ useCollectionsHook = useWiredCollections, dialogHooks }: CollectionsProps = {}) {
  return (
    <CollectionsView
      useCollectionsHook={useCollectionsHook}
      useNewContentTypeDialogHook={dialogHooks?.useNewContentTypeDialogHook ?? useWiredNewContentTypeDialog}
      useEditFieldsDialogHook={dialogHooks?.useEditFieldsDialogHook ?? useWiredEditFieldsDialog}
      useLifecycleConfirmDialogHook={dialogHooks?.useLifecycleConfirmDialogHook ?? useWiredLifecycleConfirmDialog}
      StatusLabel={ServerLabel}
      publishButton={<PublishSectionButton section="collections" />}
      contentTypeMenuItems={contentTypeMenuItems}
    />
  );
}
