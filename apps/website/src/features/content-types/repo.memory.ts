/**
 * @file Content-types' in-memory repository — re-exported from `@jini-ai/cms/content-types`.
 *
 * `src/widgets/`'s deep imports were redirected to `./index.ts` on 2026-08-17 (matching the
 * `features/entries` shim retirement in c3c030a9). The one remaining direct importer is
 * `src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts` (dynamic
 * `await import(...)`), which `.dependency-cruiser.cjs`'s `TOOL_REGISTRATION_TEST_FROM` pattern
 * deliberately, permanently exempts as a tool-registration-seam contract test — not a pending
 * migration, so this is not necessarily temporary. Out of scope for this change (owned by
 * concurrent work in `src/assistant/`); retiring this shim depends on whether that file's own
 * owner redirects it to `./index.ts`, which already exports everything it needs.
 */
export {
  InMemoryContentTypeRepo,
  NoopContentTypeIndexProvisioner,
  toContentTypeOutbox,
} from "@jini-ai/cms/content-types";
