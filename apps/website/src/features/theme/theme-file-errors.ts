import { ToolInputError } from '@jini-ai/core';

/** The one sentence for a theme file that changed after the tool read it. It says what to do (read again, retry) and that
 * nothing was written; it is its own error type so it is shown as written, never with a "fix the input" note, because
 * a different input would not help. */
export const THEME_FILE_CHANGED_MESSAGE = 'This theme file changed after it was read. Read it again and retry; this change was not applied.';

export class ThemeFileChangedError extends ToolInputError {
  constructor(_required: Record<string, never> = {}) {
    super({ message: THEME_FILE_CHANGED_MESSAGE });
    this.name = 'ThemeFileChangedError';
  }
}

/** {@link hasThemeOriginalLayoutMismatch}'s refusal: a stable `code` for a client to translate, and a fixed
 *  English `message` with nothing interpolated into it. */
export type ThemeOriginalResetRefusal = { readonly code: "ORIGINAL_LAYOUT_MISMATCH"; readonly message: string };

export const ORIGINAL_LAYOUT_MISMATCH_REFUSAL: ThemeOriginalResetRefusal = Object.freeze({
  code: "ORIGINAL_LAYOUT_MISMATCH",
  message: "this theme's saved original does not match its current layout, so its files cannot be reset",
});
