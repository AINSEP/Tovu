import { ForbiddenError, type AuthorizeFn } from "@jini-ai/cms/core";
import type { PostRepoPort } from "../features/post/index.js";
import {
  SeoEntryNotFoundError,
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
} from "./errors.js";
import type { SeoExtFields } from "./types.js";

/**
 * @file `setEntrySeoOverrides` — THE per-entry SEO write chokepoint
 * (ADR-PIPE-008 Decision §4, C-004; REQ-01/02/03). `authorize("admin.seo.manage")`
 * -> validate (registered-key-only, length/URL-scheme) -> merge into the
 * existing (or empty) `posts.seo_ext_json` -> `postRepo.save` -> conditional
 * direct sitemap-cache invalidation on a noindex/canonical-affecting write.
 *
 * No new port: reuses the existing `PostRepoPort` (`findById`/`save`).
 * `invalidateSitemapCache` is injected (not imported from `sitemap.ts`
 * directly) so this file stays independently testable in Phase 2, ahead of
 * Phase 6's `sitemap.ts` existing — the real composition root (Phase 7, T047)
 * wires the real function in.
 */

// Exported (unchanged values) so `agent-tools.ts`'s published JSON Schema can reuse the exact
// same bounds/vocabulary this chokepoint validates against, rather than restating them — the same
// discipline `newsletter/agent-tools.ts` uses for `campaign-write-service.ts`'s `SUBJECT_MAX`/etc.
export const STRING_FIELD_MAX_LENGTH = 500;
export const URL_FIELD_MAX_LENGTH = 2048;

/** Fields whose value is a plain string, length-bounded at 500 chars (behavior.spec.md §4). */
export const STRING_FIELDS: ReadonlyArray<keyof SeoExtFields> = [
  "title",
  "description",
  "schemaType",
  "ogTitle",
  "ogDescription",
  "twitterTitle",
  "twitterDescription",
];

/** Fields whose value is a URL/media-ref, length-bounded at 2048 chars (behavior.spec.md §4). */
export const URL_FIELDS: ReadonlyArray<keyof SeoExtFields> = ["canonical", "ogImage", "twitterImage"];

export const BOOLEAN_FIELDS: ReadonlyArray<keyof SeoExtFields> = ["noindex", "nofollow"];

export const OG_TYPE_VALUES = ["website", "article", "profile"] as const;
export const TWITTER_CARD_VALUES = ["summary", "summary_large_image"] as const;

/** Every registered `SeoExtFields` key — an unregistered patch key is rejected outright (INV-01). */
export const REGISTERED_KEYS: ReadonlySet<string> = new Set([
  ...STRING_FIELDS,
  ...URL_FIELDS,
  ...BOOLEAN_FIELDS,
  "ogType",
  "twitterCard",
]);

/** `javascript:`/`data:` (and other script-capable schemes) are never a safe canonical override. */
const UNSAFE_URL_SCHEME_PATTERN = /^\s*(javascript|data|vbscript|file):/i;

/**
 * Pure validation over a raw patch object. Never mutates; throws the first
 * violation found. Kept separate from the chokepoint so Code Review/tests can
 * exercise it directly if needed, though `setEntrySeoOverrides` is the only
 * caller.
 */
/** Every patch key must be a known `SeoExtFields` key (INV-01) — checked before any per-field rule. */
function validateRegisteredKeys(patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) {
    if (!REGISTERED_KEYS.has(key)) {
      throw new SeoFieldValidationError(`'${key}' is not a registered SEO field`);
    }
  }
}

/** Shared shape for both STRING_FIELDS and URL_FIELDS: optional string, bounded by `maxLength`. */
function validateStringLikeFields(
  patch: Record<string, unknown>,
  fields: ReadonlyArray<keyof SeoExtFields>,
  maxLength: number
): void {
  for (const key of fields) {
    const value = patch[key];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new SeoFieldValidationError(`'${key}' must be a string`);
    }
    if (value.length > maxLength) {
      throw new SeoFieldValidationError(`'${key}' must be at most ${maxLength} characters`);
    }
  }
}

// Canonical's unsafe-scheme check is its own typed error (SEO_INVALID_CANONICAL_URL),
// distinct from the generic length/type SEO_FIELD_VALIDATION_ERROR the other field checks throw.
function validateCanonicalScheme(patch: Record<string, unknown>): void {
  const canonical = patch.canonical;
  if (typeof canonical === "string" && UNSAFE_URL_SCHEME_PATTERN.test(canonical)) {
    throw new SeoInvalidCanonicalUrlError(`'canonical' uses an unsafe URL scheme`);
  }
}

function validateBooleanFields(patch: Record<string, unknown>): void {
  for (const key of BOOLEAN_FIELDS) {
    const value = patch[key];
    if (value !== undefined && typeof value !== "boolean") {
      throw new SeoFieldValidationError(`'${key}' must be a boolean`);
    }
  }
}

function validateEnumFields(patch: Record<string, unknown>): void {
  if (patch.ogType !== undefined && !(OG_TYPE_VALUES as readonly unknown[]).includes(patch.ogType)) {
    throw new SeoFieldValidationError(`'ogType' must be one of ${OG_TYPE_VALUES.join(", ")}`);
  }
  if (patch.twitterCard !== undefined && !(TWITTER_CARD_VALUES as readonly unknown[]).includes(patch.twitterCard)) {
    throw new SeoFieldValidationError(`'twitterCard' must be one of ${TWITTER_CARD_VALUES.join(", ")}`);
  }
}

function validateSeoExtFieldsPatch(patch: Record<string, unknown>): void {
  validateRegisteredKeys(patch);
  validateStringLikeFields(patch, STRING_FIELDS, STRING_FIELD_MAX_LENGTH);
  validateStringLikeFields(patch, URL_FIELDS, URL_FIELD_MAX_LENGTH);
  validateCanonicalScheme(patch);
  validateBooleanFields(patch);
  validateEnumFields(patch);
}

/** Fields whose change can flip sitemap eligibility (INV-04/INV-05) — a direct, non-outbox cache-invalidation trigger. */
const SITEMAP_ELIGIBILITY_FIELDS: ReadonlySet<string> = new Set(["noindex", "canonical"]);

function touchesSitemapEligibility(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => SITEMAP_ELIGIBILITY_FIELDS.has(key));
}

export interface SetEntrySeoOverridesDeps {
  postRepo: PostRepoPort;
  authorize: AuthorizeFn;
  /** Injected so this chokepoint stays testable ahead of Phase 6's `sitemap.ts` (see file header). */
  invalidateSitemapCache: (input: { workspaceId: string }) => void;
}

export interface SetEntrySeoOverridesInput {
  workspaceId: string;
  entryId: string;
  patch: Partial<SeoExtFields>;
  callerPrincipalId: string;
}

export interface SetEntrySeoOverridesRequired {
  deps: SetEntrySeoOverridesDeps;
  input: SetEntrySeoOverridesInput;
}

/** REQ-01/02/03 chokepoint write: authorize -> validate -> merge -> save -> conditional cache invalidation. */
export async function setEntrySeoOverrides(
  required: SetEntrySeoOverridesRequired
): Promise<{ overrides: SeoExtFields }> {
  const { deps, input } = required;

  const authResult = await deps.authorize({
    principalId: input.callerPrincipalId,
    permission: "admin.seo.manage",
    workspaceId: input.workspaceId,
    entityType: "seo-entry",
    entityId: input.entryId,
  });
  if (!authResult.allowed) {
    throw new ForbiddenError(
      `principal '${input.callerPrincipalId}' is not authorized for 'admin.seo.manage' (${authResult.reason})`,
      "admin.seo.manage",
      authResult.reason
    );
  }

  validateSeoExtFieldsPatch(input.patch as Record<string, unknown>);

  const existing = await deps.postRepo.findById({ workspaceId: input.workspaceId, id: input.entryId });
  if (!existing) {
    throw new SeoEntryNotFoundError(`entry '${input.entryId}' was not found`);
  }

  const currentOverrides: SeoExtFields = existing.seoExtJson ? JSON.parse(existing.seoExtJson) : {};
  const mergedOverrides: SeoExtFields = { ...currentOverrides, ...input.patch };

  await deps.postRepo.save({
    ...existing,
    seoExtJson: JSON.stringify(mergedOverrides),
    version: existing.version + 1,
  });

  if (touchesSitemapEligibility(input.patch as Record<string, unknown>)) {
    deps.invalidateSitemapCache({ workspaceId: input.workspaceId });
  }

  return { overrides: mergedOverrides };
}
