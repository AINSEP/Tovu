/** The CLI validates after trimming; both forms and IPC must agree before opening a picker. */
export const SITE_NAME_MAX_LENGTH = 200;
export const SITE_NAME_ERROR = 'A name must be 1 to 200 characters, not counting spaces at either end.';
export function siteNameError({ name }: { name: unknown }, _optional = {}): string | null {
  if (typeof name !== 'string') return SITE_NAME_ERROR;
  const length = name.trim().length;
  return length >= 1 && length <= SITE_NAME_MAX_LENGTH ? null : SITE_NAME_ERROR;
}

/** maxlength silently truncates pasted names in Chromium. Keep the full draft so the inline
 * validation explains the refusal instead of saving a different name without telling anyone. */
export function namePasteHandler(
  { setName }: { setName: (name: string) => void }, _optional = {},
): (event: { clipboardData: { getData: (format: string) => string }; currentTarget: {
  value: string; selectionStart: number | null; selectionEnd: number | null;
}; preventDefault: () => void }) => void {
  return (event) => {
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const name = input.value.slice(0, start) + event.clipboardData.getData('text') + input.value.slice(end);
    if (name.length <= SITE_NAME_MAX_LENGTH) return;
    event.preventDefault();
    setName(name);
  };
}
