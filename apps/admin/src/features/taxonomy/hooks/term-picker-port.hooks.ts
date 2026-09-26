import type { AdminTaxonomyWithTerms } from "@/lib/api";
import type { NewTermFormPort } from "./new-term-form-port.hooks";

/**
 * @file What `use-term-picker.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 *
 * `createTerm` is the Categories & Tags screen's own create-term port (`NewTermFormPort`), extended
 * rather than re-declared, so the box's "type a name to add it" reaches the same route.
 */
export interface TermPickerPort extends NewTermFormPort {
  /** Narrowed to the one field the box reads — whether it may offer "add a term". */
  me(): Promise<{ effectivePermissions?: string[] }>;
  listTaxonomies(): Promise<{ items: AdminTaxonomyWithTerms[] }>;
  assignedTerms(input: { contentType: string; contentId: string }): Promise<{ termIds: string[] }>;
  assignTerms(input: { contentType: string; contentId: string; termIds: string[] }): Promise<void>;
  unassignTerms(input: { contentType: string; contentId: string; termIds: string[] }): Promise<void>;
}
