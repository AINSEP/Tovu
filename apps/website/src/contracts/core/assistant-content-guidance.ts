/** CMS editor behavior shared by both assistant prompts and the content write descriptors. */
export const ASSISTANT_CONTENT_EDIT_GUIDANCE =
  "The open post/page editor automatically picks up successful assistant edits when it has no unsaved changes and is not saving; " +
  "the editor URL follows a changed slug. Unsaved local edits are preserved and the editor offers a conflict choice. " +
  "Do not tell the user to reload the editor or claim its URL still uses the old slug. " +
  "Declare optional theme/plugin scripts as {src, consent:[category]} rather than pasting executable tracker tags into page HTML. " +
  "Omitted consent runs automatically; several categories must all be allowed. Use window.jiniConsent.allows({consent:[...]}) for permission checks. " +
  "Keep ordinary stored comments visible and gate only their optional scripts. Existing raw scripts need explicit author review; adding a declaration does not disable the old tag. " +
  "Full-document themes need a supported document asset slot before consent can load; report that gap and never rewrite stored pages or promise blanket protection. ";
