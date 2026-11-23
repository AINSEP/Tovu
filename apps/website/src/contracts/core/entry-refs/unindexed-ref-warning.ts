/**
 * @file Tovu warning sink for `extractHtmlEntryRefs` (`@jini-ai/cms/widgets`): an UNINDEXED-reference
 * warning goes to the server console, where operators look for it. Html pages are written through
 * `features/pages/html-document-store.sqlite.ts`'s `PagesHtmlDocumentStore` (ADR-056 CIC-3), which passes
 * this as the extractor's `report`; so does `development/scripts/migrate-page-embed-markers.ts`.
 * Forms definitions: safe-delete follows page -> widget -> form definition; see
 * `development/docs/architecture/embed-type-inventory.md`.
 */
import type { EntryRefsReport } from "@jini-ai/cms/widgets";

/** A rejected marker is warned on the console with its source entry id. */
export const warnUnindexedEntryRef: EntryRefsReport = ({ message, sourceEntryId }) => console.warn(message, { sourceEntryId });
