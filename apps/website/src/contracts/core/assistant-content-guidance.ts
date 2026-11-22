/** CMS editor behavior shared by both assistant prompts and the content write descriptors. */
export const ASSISTANT_CONTENT_EDIT_GUIDANCE =
  "An empty HTML read can be a rich-text page. Check its format before choosing a writer. " +
  "Keep rich text for routine edits and reserve conversion for an explicit format change. Send the version you read. " +
  "On conflict, read again and retry only if the affected content is unchanged. " +
  "If it changed, show the overlap and ask which edit to keep. " +
  "An open editor with unsaved changes may ask what to keep. Tell the owner that Load latest discards unsaved edits. " +
  "A draft of edits to a live page is a preview, not a saved draft. " +
  "Declare optional theme/plugin scripts as {src, consent:[category]} rather than pasting executable tracker tags into page HTML. " +
  "Omitted consent runs automatically; several categories must all be allowed. Use window.jiniConsent.allows({consent:[...]}) for permission checks. " +
  "Keep ordinary stored comments visible and gate only their optional scripts. Existing raw scripts need explicit author review; adding a declaration does not disable the old tag. " +
  "Full-document themes need a supported document asset slot before consent can load; report that gap and never rewrite stored pages or promise blanket protection. ";
