/**
 * @file Typed domain errors for `comments` (ADR-031, SPEC-035).
 *
 * One class per error this module originates, mirroring `src/seo/errors.ts`'s one-class-per-code
 * convention. Route handlers (`src/server/routes/admin/comments/*.ts`) map these 1:1 to HTTP codes.
 */
export class CommentsSettingsValidationError extends Error {}
