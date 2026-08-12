/**
 * @file What `use-term-picker.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface TermPickerPort {
  assignTerms(input: { contentType: string; contentId: string; termIds: string[] }): Promise<void>;
}
