import { ASSISTANT_CONTENT_EDIT_GUIDANCE } from "@tovu/contracts/assistant-content-guidance";
import { createPostAgentToolCatalog } from "@jini-ai/cms/posts/agent-tools";
import { FEATURED_IMAGE_SCHEMA, POST_ID_SCHEMA } from "./post-schema-binding.js";
import { TIPTAP_DOC_SCHEMA } from "./tiptap-doc-schema.js";

export const postAgentToolCatalog = createPostAgentToolCatalog({
  editGuidance: ASSISTANT_CONTENT_EDIT_GUIDANCE,
  featuredImageSchema: FEATURED_IMAGE_SCHEMA,
  postIdSchema: POST_ID_SCHEMA,
  tiptapDocSchema: TIPTAP_DOC_SCHEMA,
  copy: { contentPostRead: "content_read.content_post", navigate: "page.navigate", menuRead: "content_read.menu", updateMenuTree: "menus_update_menu_tree", fetchPublishedPage: "fetch_published_page", postPreview: "content_post_preview", trashRestoreItem: "trash_restore_item" },
});
