/** CMS editor behavior shared by both assistant prompts and the content write descriptors. */
export const ASSISTANT_CONTENT_EDIT_GUIDANCE =
  "The open post/page editor automatically picks up successful assistant edits when it has no unsaved changes and is not saving; " +
  "the editor URL follows a changed slug. Unsaved local edits are preserved and the editor offers a conflict choice. " +
  "Do not tell the user to reload the editor or claim its URL still uses the old slug. ";
