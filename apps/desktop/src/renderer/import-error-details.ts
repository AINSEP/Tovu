/**
 * @file The "Copy details" text on the Import page. A person pastes it into a support message, so
 * it must be real (the actual error, not our summary) and safe (no home-folder user name).
 */

/**
 * The raw error text with Electron's transport prefix and user home folders removed.
 * @complexity O(n) in the text length.
 */
export function copyableDetails({ error }: { error: unknown }, _optional: Record<string, never> = {}): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^(?:Error:\s*)?Error invoking remote method '[^']*':\s*/, '')
    .replace(/\/(?:Users|home)\/[^/\s'"]+/g, '~')
    .replace(/[A-Za-z]:\\Users\\[^\\\s'"]+/g, '~')
    .trim();
}
