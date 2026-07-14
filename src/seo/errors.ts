/**
 * @file Typed domain errors for `seo` (SPEC-008 errors.spec.md §2).
 *
 * Purpose:
 * One class per error this module originates, mirroring
 * `features/settings/errors.ts`'s one-class-per-code convention. Route
 * handlers (`src/server/routes/admin/seo/*.ts`) map these 1:1 to the HTTP
 * codes in api.spec.md §6. `FORBIDDEN` reuses `core/commands`'s shared
 * `ForbiddenError` (same authorize-then-throw shape `write-service.ts`'s
 * settings counterpart and every command-gateway route already use) rather
 * than a second, SEO-local class — `UNAUTHENTICATED` is a route/session-
 * middleware concern (`getAuthedPrincipal`), never thrown by this module.
 */
export class SeoFieldValidationError extends Error {}
export class SeoInvalidCanonicalUrlError extends Error {}
export class SeoEntryNotFoundError extends Error {}
export class SeoSettingsValidationError extends Error {}
