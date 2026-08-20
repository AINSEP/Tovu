/**
 * @file Shared vocabulary + strictness policy for the theme v2 package validator
 * (`validate-theme-package.ts` and its sibling check modules).
 *
 * `profile` answers "what is this validation FOR", not "which rules run" — every profile runs the
 * same checks (`manifest-v2.ts`/`structure.ts`/`references.ts`/`markup.ts` never branch on profile
 * themselves); only the SEVERITY a given rule ID resolves to differs, via {@link resolveSeverity}.
 * That keeps the check modules profile-agnostic and puts the one place profile-specific judgment
 * calls live in a single, auditable table.
 */

/**
 * - `author` — the loop a theme's own author runs while editing (the `tovu theme validate` CLI, an
 *   in-progress package). Hard invariants (containment, unknown fields, tier violations) still fail;
 *   polish requirements a WIP theme has no reason to carry yet (a license file, a marketplace preview
 *   thumbnail) are advisory only.
 * - `publish` — the gate before a theme is listed for others to install. Everything `author` warns
 *   about here becomes a hard failure — an unlicensed or thumbnail-less theme should never reach a
 *   marketplace listing.
 * - `install` — what `marketplace.ts` runs against a fixture before copying it onto a user's disk.
 *   Trusts nothing about the package's own claims about itself; at least as strict as `author`, since
 *   an install-time refusal is the last chance to reject a broken or malicious package before it
 *   becomes local files Tovu will read, render, and hand an AI agent write access to.
 */
export type ThemeValidationProfile = "author" | "publish" | "install";

export type ThemeValidationSeverity = "error" | "warning";

/** One finding from any check module — a rule id (grep-able, stable across message rewording), a
 * human-readable message, and the package-relative path it concerns, when the finding is
 * file-scoped rather than manifest- or package-wide. */
export interface ThemeValidationIssue {
  readonly ruleId: string;
  readonly message: string;
  readonly path?: string;
}

/**
 * Rule IDs that are advisory (`warning`) outside the `publish` profile, and a hard `error` only when
 * publishing. Every rule ID NOT in this set is an `error` in every profile — the default is strict;
 * this set is the deliberately narrow, named exception list, not the other way around.
 */
const PUBLISH_ONLY_RULES: ReadonlySet<string> = new Set([
  "license-missing",
  "preview-thumbnail-missing",
  "description-missing",
]);

/**
 * Rule IDs for v2 manifest fields the runtime loader does not implement yet — `partials`, `renderer`,
 * nested `tokens`, an object-valued `engine` (`theme-authoring-guide-v2.md`'s own `[TARGET]` fields;
 * `manifest-v2.ts`'s own header names the exact loader gap for each). A `warning` under `author` (a
 * theme author may draft ahead of the loader catching up — the design doc's own stated intent for
 * `[TARGET]` fields, not a defect to block on mid-authoring); a hard `error` under `install`/`publish`
 * — a package that declares a field the loader will silently ignore must never actually be installed
 * or listed, matching `install`'s own doc ("the last chance to reject a broken package before it
 * becomes local files"). A THIRD severity shape from {@link PUBLISH_ONLY_RULES} (which stays a
 * warning under `install`): that set is about POLISH a WIP package has no reason to carry yet; this
 * one is about a manifest claim the runtime will actively get wrong, which install must not admit
 * regardless of publish-readiness. 2026-08-19 architecture audit finding 3.
 */
const UNIMPLEMENTED_V2_FIELD_RULES: ReadonlySet<string> = new Set([
  "v2-partials-unimplemented",
  "v2-renderer-unimplemented",
  "v2-tokens-unimplemented",
  "v2-engine-object-unimplemented",
]);

/**
 * Resolve one rule id's severity for one profile. Pure lookup — see this module's own header for why
 * profile-specific judgment stays centralized here rather than scattered across check modules.
 *
 * @complexity O(1).
 */
export function resolveSeverity(
  required: { ruleId: string; profile: ThemeValidationProfile },
  _optional: Record<string, never> = {}
): ThemeValidationSeverity {
  const { ruleId, profile } = required;
  if (PUBLISH_ONLY_RULES.has(ruleId)) {
    return profile === "publish" ? "error" : "warning";
  }
  if (UNIMPLEMENTED_V2_FIELD_RULES.has(ruleId)) {
    return profile === "author" ? "warning" : "error";
  }
  return "error";
}
