/**
 * @file Entries' domain errors — re-exported from `@jini-ai/cms/entries`.
 *
 * Only `src/widgets/` still imports this path directly, and that module is being ported by
 * separate work in flight, so its imports must not be touched here. When that lands, this shim
 * retires and widgets reaches the domain through `./index.ts` like every other consumer.
 *
 * Re-exported as **values**: callers catch them with `instanceof`, and re-exporting rather than
 * redeclaring keeps exactly one class object per error across the host and the package.
 */
export {
  ForbiddenError,
  EntryNotFoundError,
  ContentTypeNotFoundError,
  ContentTypeNotActiveError,
  EntrySlugConflictError,
  VersionConflictError,
  EntryFieldValidationError,
} from "@jini-ai/cms/entries";
