/** Helper module imported by `plugin.ts` with a `.js` specifier: proves the worker resolves a
 * TypeScript plugin's relative imports (tsx ESM hooks registered inside the worker). */
export function titleLength(title: string): number {
  return title.length;
}
