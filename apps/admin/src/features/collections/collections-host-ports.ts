import { ApiError, describeApiError, request } from "@/lib/admin-http/request";
import { isVersionConflict } from "@/lib/version-conflict";
import type { CollectionsHostKit } from "@jini-ai/admin/screens/collections/collections-host-kit";
import { bindCollectionsRules, createDraftRowIdCounter } from "@jini-ai/admin/screens/collections/rules";
import { embedMarkerSnippet } from "@jini-ai/cms/widgets/markers";
import { t as translate } from "./collections-i18n";
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

/** The collections rules' host kit: this host's collections dictionary, admin request error class
 *  (with its base-case copy), version-conflict test, the CMS embed-marker builder, and the ONE draft
 *  row-id counter both field-list dialogs share (`@jini-ai/admin/screens/collections/collections-host-kit`). */
export const collectionsHostKit: CollectionsHostKit = {
  translate,
  isApiError: (e): e is ApiError => e instanceof ApiError,
  describeApiError,
  isVersionConflict,
  embedMarkerSnippet,
  nextDraftRowId: createDraftRowIdCounter(),
};

/** `@jini-ai/admin`'s kit-reading collections rules, bound once to {@link collectionsHostKit}. */
export const {
  collectionEmbedSnippet,
  emptyField,
  draftFieldsFromContentType,
  addDraftField,
  visibleEntryEditorError,
  validateKey,
  validateFieldName,
  firstDraftFieldError,
  validateNewContentTypeDraft,
  validateEditFieldsDraft,
  describeEditFieldsError,
  lifecycleCopy,
  contentTypeMenuItems,
} = bindCollectionsRules({ kit: collectionsHostKit });
