import type { TrashAdapter } from "@jini-ai/cms/trash";
import { PLUGIN_ENTITY_TYPE, COMMENT_ENTITY_TYPE, MEDIA_ENTITY_TYPE, POST_ENTITY_TYPE, REDIRECT_ENTITY_TYPE } from "#src/features/trash/index";
import { memoryCommentTrashAdapter, memoryMediaTrashAdapter, memoryPostTrashAdapter, memoryRedirectTrashAdapter } from "./trash-adapters-content.js";
import { memoryFormSubmissionTrashAdapter, memoryFormTrashAdapter, memoryMenuTrashAdapter, memoryWidgetTrashAdapter } from "./trash-adapters-forms-widgets.js";
import { memoryTaxonomyTrashAdapter, memoryTermTrashAdapter, type MemoryTaxonomyTrashInput } from "./trash-adapters-taxonomy.js";

type Content = Parameters<typeof memoryPostTrashAdapter>[0] & Parameters<typeof memoryRedirectTrashAdapter>[0]
  & Parameters<typeof memoryCommentTrashAdapter>[0] & Parameters<typeof memoryMediaTrashAdapter>[0];
type FormsWidgets = Parameters<typeof memoryFormTrashAdapter>[0] & Parameters<typeof memoryFormSubmissionTrashAdapter>[0]
  & Parameters<typeof memoryWidgetTrashAdapter>[0] & Parameters<typeof memoryMenuTrashAdapter>[0];

export type MemoryTrashAdaptersInput = Content & FormsWidgets & {
  pluginTrashAdapter: TrashAdapter;
  term: MemoryTaxonomyTrashInput;
  taxonomy: MemoryTaxonomyTrashInput;
};

/**
 * The hermetic root's Trash adapter Map. A plain Map resolved at CALL time, never a module-level
 * registry. The `theme` adapter joins it later in the root (it needs the theme list), and the form
 * attachment-purge hooks wrap `form` / `form_submission` after this returns.
 */
export function composeMemoryTrashAdapters(required: MemoryTrashAdaptersInput, _optional = {}): Map<string, TrashAdapter> {
  return new Map<string, TrashAdapter>([
    [PLUGIN_ENTITY_TYPE, required.pluginTrashAdapter],
    [POST_ENTITY_TYPE, memoryPostTrashAdapter(required)],
    [REDIRECT_ENTITY_TYPE, memoryRedirectTrashAdapter(required)],
    [COMMENT_ENTITY_TYPE, memoryCommentTrashAdapter(required)],
    [MEDIA_ENTITY_TYPE, memoryMediaTrashAdapter(required)],
    ["form", memoryFormTrashAdapter(required)],
    ["form_submission", memoryFormSubmissionTrashAdapter(required)],
    ["widget", memoryWidgetTrashAdapter(required)],
    ["menu", memoryMenuTrashAdapter(required)],
    ["term", memoryTermTrashAdapter(required.term)],
    ["taxonomy", memoryTaxonomyTrashAdapter(required.taxonomy)],
  ]);
}
