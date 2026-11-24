import { featuredImageSchema, postIdSchema, type PostSchemaToolNames } from "@jini-ai/cms/posts/post-tool-schemas";

/** The Tovu tool names the model-facing post/page schema copy (owned by `@jini-ai/cms`) points at. */
export const POST_SCHEMA_TOOL_NAMES: PostSchemaToolNames = {
  mediaRead: "content_read.media_asset",
  mediaUpload: "media_upload_asset",
  mediaGenerate: "media_generate_asset",
  mediaImportFromUrl: "media_import_from_url",
  widgetInsertEmbed: "widgets_insert_embed",
  postCreate: "content_post_create",
  postRead: "content_read.content_post",
};

export const FEATURED_IMAGE_SCHEMA = featuredImageSchema({ tools: POST_SCHEMA_TOOL_NAMES });
export const POST_ID_SCHEMA = postIdSchema({ tools: POST_SCHEMA_TOOL_NAMES });
