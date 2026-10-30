/**
 * @file Thin content-type write adapters binding Tovu's reserved routes to `@jini-ai/cms/content-types`.
 *
 * `src/widgets/`'s deep imports were redirected to `./index.ts` on 2026-08-17 (matching the
 * `features/entries` shim retirement in c3c030a9). The one remaining direct importer is
 * `src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts` (dynamic
 * `await import(...)`), which `.dependency-cruiser.mjs`'s `TOOL_REGISTRATION_TEST_FROM` pattern
 * deliberately, permanently exempts as a tool-registration-seam contract test — not a pending
 * migration, so this is not necessarily temporary. Out of scope for this change (owned by
 * concurrent work in `src/assistant/`); retiring this shim depends on whether that file's own
 * owner redirects it to `./index.ts`, which already exports everything it needs.
 */
export type {
  AuthorizeFn,
  ContentTypeRevisionInput,
  ContentTypeRepoPort,
  IndexProvisionerPort,
  OutboxPort,
  WatermarkPort,
  ContentTypeWriteServiceDeps,
  RegisterContentTypeRequired,
  UpdateContentTypeFieldsRequired,
} from "@jini-ai/cms/content-types";
import {
  registerContentType as registerSharedContentType,
  buildContentTypesRegistrations as buildSharedContentTypesRegistrations,
  type RegisterContentTypeRequired,
  type ContentTypesToolDeps,
} from "@jini-ai/cms/content-types";
import { RESERVED_SEGMENTS } from "#src/platform/routing/index";

export { updateContentTypeFields } from "@jini-ai/cms/content-types";

/** Bind Tovu's route vocabulary to the shared, authorization-first write owner. O(1). */
export function registerContentType(required: RegisterContentTypeRequired, _optional: Record<string, never> = {}) {
  return registerSharedContentType({ ...required, deps: { ...required.deps, reservedKeys: RESERVED_SEGMENTS } });
}

/** Bind the identical route policy for assistant writes. O(t) for the fixed tool catalog. */
export function buildContentTypesRegistrations(required: ContentTypesToolDeps, _optional: Record<string, never> = {}) {
  return buildSharedContentTypesRegistrations({ ...required, reservedContentTypeKeys: RESERVED_SEGMENTS });
}
