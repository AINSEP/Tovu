/**
 * @file Thin content-type write adapters binding Tovu's reserved routes to `@jini-ai/cms/content-types`.
 *
 * Host composition only: it injects `RESERVED_SEGMENTS` (Tovu's route vocabulary) into the shared,
 * authorization-first write owner. Everything else about content types is imported straight from
 * `@jini-ai/cms/content-types`; the old `./index.ts` barrel and this file's type re-exports were
 * removed 2026-11-24, so this file is the one owner of these two bindings.
 */
import {
  registerContentType as registerSharedContentType,
  buildContentTypesRegistrations as buildSharedContentTypesRegistrations,
  type RegisterContentTypeRequired,
  type ContentTypesToolDeps,
} from "@jini-ai/cms/content-types";
import { RESERVED_SEGMENTS } from "#src/platform/routing/index";

/** Bind Tovu's route vocabulary to the shared, authorization-first write owner. O(1). */
export function registerContentType(required: RegisterContentTypeRequired, _optional: Record<string, never> = {}) {
  return registerSharedContentType({ ...required, deps: { ...required.deps, reservedKeys: RESERVED_SEGMENTS } });
}

/** Bind the identical route policy for assistant writes. O(t) for the fixed tool catalog. */
export function buildContentTypesRegistrations(required: ContentTypesToolDeps, _optional: Record<string, never> = {}) {
  return buildSharedContentTypesRegistrations({ ...required, reservedContentTypeKeys: RESERVED_SEGMENTS });
}
