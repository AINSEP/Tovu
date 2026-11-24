import { CollectionEntries as CollectionEntriesView } from "@jini-ai/admin/screens/collections/CollectionEntries";
import { ServerLabel } from "@/components/status-labels";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";
import { useWiredCollectionEntries } from "./hooks/use-collection-entries.hooks";

/**
 * @file The admin's Collections entries route: `@jini-ai/admin`'s `CollectionEntries` screen bound
 * to this host — the entries hook to its `useWiredCollectionEntries` binding, this admin's
 * `ServerLabel` for status pills and its "Publish collections" button.
 */

export interface CollectionEntriesProps {
  contentTypeKey: string;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  only `contentTypeKey` and behave exactly as before. */
  useCollectionEntriesHook?: typeof useWiredCollectionEntries;
}

export function CollectionEntries({ contentTypeKey, useCollectionEntriesHook = useWiredCollectionEntries }: CollectionEntriesProps) {
  return (
    <CollectionEntriesView
      contentTypeKey={contentTypeKey}
      useCollectionEntriesHook={useCollectionEntriesHook}
      StatusLabel={ServerLabel}
      publishButton={<PublishSectionButton section="collections" />}
    />
  );
}
