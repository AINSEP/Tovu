import { request } from "@/lib/admin-http/request";
import { createCollectionsApi } from "@jini-ai/admin/screens/collections/api/collections-api";
import { createCollectionEntriesPort } from "@jini-ai/admin/screens/collections/hooks/collection-entries-dependencies.hooks";
import { createCollectionEntryEditorPort } from "@jini-ai/admin/screens/collections/hooks/collection-entry-editor-dependencies.hooks";
import { createCollectionsPort } from "@jini-ai/admin/screens/collections/hooks/collections-dependencies.hooks";
import { createEditFieldsDialogPort } from "@jini-ai/admin/screens/collections/hooks/edit-fields-dialog-dependencies.hooks";
import { createNewContentTypeDialogPort } from "@jini-ai/admin/screens/collections/hooks/new-content-type-dialog-dependencies.hooks";

/**
 * @file The admin's collections binding: `@jini-ai/admin`'s collections API client, bound once to
 * this host's authenticated `request`. Every collections caller reads this singleton.
 */

/** The admin API calls of the collections feature, over this host's `request`. */
export const collectionsApi = createCollectionsApi({ request });

/** The live `CollectionEntriesPort` over {@link collectionsApi}. */
export const defaultCollectionEntriesPort = createCollectionEntriesPort({ api: collectionsApi });

/** The live `CollectionEntryEditorPort` over {@link collectionsApi}. */
export const defaultCollectionEntryEditorPort = createCollectionEntryEditorPort({ api: collectionsApi });

/** The live `CollectionsPort` over {@link collectionsApi}. */
export const defaultCollectionsPort = createCollectionsPort({ api: collectionsApi });

/** The live `EditFieldsDialogPort` over {@link collectionsApi}. */
export const defaultEditFieldsDialogPort = createEditFieldsDialogPort({ api: collectionsApi });

/** The live `NewContentTypeDialogPort` over {@link collectionsApi}. */
export const defaultNewContentTypeDialogPort = createNewContentTypeDialogPort({ api: collectionsApi });
