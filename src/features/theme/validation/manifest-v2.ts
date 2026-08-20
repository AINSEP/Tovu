import type { JsonValue } from "@jini-ai/cms/core";

import { isSourceDirGeneratedConflict } from "../theme-files.js";
import type { ThemeValidationIssue } from "./profiles.js";

/**
 * @file Strict schema check for a `theme.json` declaring `apiVersion: 2` — the settled shape from
 * `development/docs/themes/theme-authoring-guide-v2.md` §5, made `additionalProperties: false` at the
 * top level (§16: "Unknown top-level manifest fields REJECTED (fail-closed)").
 *
 * ONLY invoked when `raw.apiVersion === 2` (see `validate-theme-package.ts`'s orchestrator). As of the
 * 2026-08-18 Milestone 3 migration, all seven built-in static themes (`src/themes/static/*`) declare
 * `apiVersion: 2` and run through THIS module — it is production-critical, not speculative. A theme
 * with no `apiVersion` field (a v1 theme, none of which remain among the built-ins, but a site-authored
 * or marketplace one still can be) is unaffected, validated through `loadTheme()`'s own existing
 * (loose, v1) parsing instead, unchanged.
 *
 * Deliberately does NOT re-implement `loadTheme()`'s own already-enforced rules (tier validity,
 * `build.source: "compiled"`'s three conditional requirements, the `sourceDir`/generated-directory
 * conflict) — those stay the single source of truth there; this module's checks are ADDITIVE:
 * `apiVersion`/`$schema` shape, top-level field closure, and the v2-only restructured fields
 * (`engine` as an object, `tokens` as a nested object, `authors`/`license`/`attributions`) nothing
 * else validates yet.
 *
 * Deliberately LIGHT on shape for `scripts`, `assets`, and `ai`: their target shape is not concretely
 * pinned down enough to enforce strictly without inventing scope beyond what the design doc settled
 * (the doc itself marks `ai` "NOT YET IMPLEMENTED anywhere", §12), so none of the three gets a
 * dedicated `isObject`/field-shape check here — only whatever generic JSON-object closure the
 * top-level schema already implies. They are NOT light on the unimplemented-field policy, though: all
 * three (plus dead `pages`) are unread by the loader (§15's field table; verified below) and get the
 * same `v2-*-unimplemented` treatment as `partials`/`renderer`/`tokens`/`engine`, via the generic sweep
 * described next. Tightening their SHAPE checking is future work once an actual implementation settles
 * it; tightening whether declaring them is safe is this fix.
 *
 * `engine` (object-valued), nested `tokens`, `partials`, and `renderer` get a STRONGER treatment than
 * merely "light" (2026-08-19 architecture audit finding 3): each is still schema-checked when present
 * (an actually malformed one is a hard error at any profile), but ALSO carries its own
 * `v2-*-unimplemented` finding whenever present, valid or not — `loadTheme()` does not read any of
 * these four fields today (see each check's own comment for the exact loader line that proves it), so
 * "schema-valid" must not silently mean "the runtime will honor this." `profiles.ts`'s
 * `resolveSeverity` recognizes any `v2-*-unimplemented` rule id by NAMING CONVENTION (not a manually
 * maintained list — see its own doc) and makes that a `warning` under `author` (drafting ahead of the
 * loader is the design doc's own stated intent for `[TARGET]` fields) and a hard `error` under
 * `install`/`publish` — a package must not actually be installed or listed while claiming a field the
 * runtime will silently ignore. This closes the exact repro the audit found: a marketplace fixture
 * declaring `partials.hero.source` used to pass `validateThemePackage({ profile: "install" })` cleanly
 * and then render with that partial unresolved, because the runtime reads `slots`, never `partials`.
 *
 * RE-AUDIT (2026-08-19, `gpt-5.6-sol` and `gpt-5.6-terra` independently): the four-field list above
 * was itself incomplete — this file's OWN prior header claimed `scripts`, `assets`, and `ai` were
 * "accepted as loosely-typed optional objects," but no code anywhere actually checked or flagged them,
 * and `pages` (confirmed dead — not read by `theme.ts` or anywhere else in `src/`) was allowed with no
 * finding at all. Rather than hand-adding four more one-off checks (the same manual-list pattern that
 * produced the gap), {@link V2_FIELDS_READ_BY_LOADER} and {@link V2_RESERVED_METADATA_FIELDS} below
 * make the unimplemented set SELF-MAINTAINING: `validateManifestV2`'s closing sweep flags every
 * top-level v2 key present in the manifest that isn't on one of those two verified lists, so a future
 * field can no longer silently skip this policy the way these four did. Both lists were built by
 * direct inspection of `theme.ts`'s manifest-parse block (`theme.ts:661-684`) and a repo-wide grep for
 * every other candidate field name — not by trusting this file's own prior comments, which is exactly
 * how the `scripts`/`assets`/`ai` gap happened in the first place.
 *
 * `modes`/`defaultMode`/`slots` are accepted with NO unimplemented finding, for the opposite reason
 * from the previous paragraph: they are REAL, load-bearing v1 fields `loadTheme()` reads flat off the
 * manifest root, completely apiVersion-agnostic (`theme.ts`'s manifest-parse block) — `slots` drives
 * which root partial file satisfies which named slot, `modes`/`defaultMode` drive dark/light token
 * switching. The design doc's own worked example nests `defaultMode`/`modes` under `tokens` instead —
 * that shape is UNIMPLEMENTED (`readLightTokens` hardcodes the filename `tokens.light.json`, it never
 * reads a `tokens.modes` mapping), so migrating a real theme to the doc's nested shape would silently
 * stop `loadTheme()` from finding `modes`/`defaultMode` at all, breaking dark/light mode for every
 * multi-mode theme (this is exactly what the nested-`tokens` `v2-tokens-unimplemented` check above
 * exists to catch). Keeping these flat here matches what the runtime actually does today.
 *
 * `pages` (an array of page ids) is NOT grouped with `modes`/`defaultMode`/`slots` above, despite
 * `theme-authoring-guide-v2.md` §17's worked examples listing it alongside them — `loadTheme()` does
 * not parse it into `ThemeManifest` at all (confirmed dead: no read anywhere in `src/`, verified by
 * repo-wide grep, not by trusting this file's own prior claim that it was "carried the same way" as
 * the three real fields). It gets the generic `v2-pages-unimplemented` sweep finding like `scripts`/
 * `assets`/`ai` above.
 */

/** Top-level keys schema v2 recognizes (`theme-authoring-guide-v2.md` §5). Anything else in a
 * `apiVersion: 2` manifest is an unknown-field rejection. */
const V2_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "$schema",
  "apiVersion",
  "id",
  "name",
  "version",
  "tier",
  "engine",
  "compatibility",
  "description",
  "author",
  "license",
  "authors",
  "attributions",
  "category",
  "tags",
  "tokens",
  "fonts",
  "renderer",
  "partials",
  "regions",
  "scripts",
  "assets",
  "ai",
  "build",
  "modes",
  "defaultMode",
  "pages",
  "slots",
  "templates",
]);

/**
 * Top-level v2 fields `loadTheme()` (`theme.ts`) actually reads into `ThemeManifest` — verified by
 * direct inspection of its manifest-parse block (`theme.ts:661-684`), not by trusting this file's own
 * prior header comments (a 2026-08-19 re-audit found those stale). `engine` is included even though
 * only its NUMBER form is honored — an object-valued `engine` still gets its own dedicated
 * `v2-engine-object-unimplemented` finding below (that check `flaggedUnimplemented.add`s it so the
 * generic sweep doesn't ALSO double-flag it); this set only decides whether the sweep leaves the KEY
 * alone by default, not whether every shape it can hold is honored.
 */
const V2_FIELDS_READ_BY_LOADER: ReadonlySet<string> = new Set([
  "id",
  "name",
  "version",
  "apiVersion",
  "tier",
  "engine",
  "author",
  "build",
  "description",
  "fonts",
  "regions",
  "templates",
  "modes",
  "defaultMode",
  "slots",
]);

/**
 * Top-level v2 fields that are pure descriptive/discovery metadata about the PACKAGE itself (legal
 * credit, marketplace-browse facets) or JSON-Schema tooling plumbing, rather than a claim about
 * runtime rendering behavior. None of these reads as "the theme has configured X" the way
 * `partials`/`renderer`/`scripts`/`assets`/`ai`/`pages` do — declaring a `license` does not imply the
 * runtime enforces or displays it anywhere, so silently not acting on it is not the same defect class
 * as silently ignoring a claimed capability. Deliberately exempt from the unimplemented-field sweep
 * below rather than left to fall through it unnoticed. If any of these gains real runtime behavior
 * later, move it to {@link V2_FIELDS_READ_BY_LOADER} above in the same change that wires it up.
 */
const V2_RESERVED_METADATA_FIELDS: ReadonlySet<string> = new Set([
  "$schema",
  "compatibility",
  "license",
  "authors",
  "attributions",
  "category",
  "tags",
]);

const V2_TIERS: ReadonlySet<string> = new Set(["declarative", "templated", "handlebars", "static", "code"]);
const V2_BUILD_SOURCES: ReadonlySet<string> = new Set(["authored", "compiled"]);
/** Widened from `loadTheme()`'s current closed 3-value union (`theme.ts`'s `parseThemeBuildInfo`) per
 * the design doc §6's "TARGET-widened" framing — descriptive only, matching that field's own real
 * behavior (nothing branches on it). Still fail-closed: an unrecognized string is REJECTED here,
 * where the real v1 parser instead silently drops it — the whole point of the strict v2 schema. */
const V2_BUILD_FRAMEWORKS: ReadonlySet<string> = new Set([
  "react",
  "vue",
  "angular",
  "svelte",
  "astro",
  "solid",
  "qwik",
  "web-components",
]);
/** The two real template engines this codebase has workers for (`liquid-worker.ts`,
 * `handlebars-worker.ts`). Not stated explicitly as a closed list anywhere in the design doc's §5
 * example — inferred from what the runtime can actually execute, and fail-closed on anything else
 * rather than left open, matching this schema's own "fail-closed on unknown ... engine" requirement. */
const V2_ENGINE_NAMES: ReadonlySet<string> = new Set(["liquid", "handlebars"]);

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strictly parse a raw `theme.json` object already known to declare `apiVersion: 2`.
 *
 * @param required.raw - The parsed `theme.json` content.
 * @returns Every schema violation found; empty means the manifest is v2-schema-clean. Does not throw.
 * @complexity O(k) in the manifest's own (small, fixed) key count.
 */
export function validateManifestV2(
  required: { raw: Record<string, unknown> },
  _optional: Record<string, never> = {}
): ThemeValidationIssue[] {
  const { raw } = required;
  const issues: ThemeValidationIssue[] = [];
  const err = (ruleId: string, message: string): void => {
    issues.push({ ruleId, message });
  };
  // Fields the bespoke checks below already gave their own specific `v2-<field>-unimplemented`
  // finding (with a more useful, field-specific message) — the generic sweep at the bottom of this
  // function skips these so a field never gets flagged twice. `engine` needs no entry here: it's
  // excluded from the sweep via `V2_FIELDS_READ_BY_LOADER` instead (see that set's own doc).
  const flaggedUnimplemented = new Set<string>();

  for (const key of Object.keys(raw)) {
    if (!V2_TOP_LEVEL_KEYS.has(key)) {
      err("v2-unknown-field", `theme.json: unrecognized top-level field '${key}' (schema v2 is additionalProperties: false)`);
    }
  }

  if (raw.apiVersion !== 2) {
    err("v2-api-version", `theme.json: apiVersion must be exactly 2, got ${JSON.stringify(raw.apiVersion)}`);
  }
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    err("v2-id", "theme.json: id must be a non-empty string");
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    err("v2-name", "theme.json: name must be a non-empty string");
  }
  if (typeof raw.version !== "string" || !SEMVER_PATTERN.test(raw.version)) {
    err("v2-version-semver", `theme.json: version must be valid semver (X.Y.Z), got ${JSON.stringify(raw.version)}`);
  }
  if (raw.tier !== undefined && (typeof raw.tier !== "string" || !V2_TIERS.has(raw.tier))) {
    err("v2-tier", `theme.json: unrecognized tier ${JSON.stringify(raw.tier)} — expected one of ${[...V2_TIERS].join(", ")}`);
  }

  if (raw.engine !== undefined) {
    if (!isObject(raw.engine)) {
      err("v2-engine-shape", "theme.json: engine must be an object ({ name, version }) in schema v2, not a bare number");
    } else {
      if (typeof raw.engine.name !== "string" || !V2_ENGINE_NAMES.has(raw.engine.name)) {
        err(
          "v2-engine-name",
          `theme.json: unrecognized engine.name ${JSON.stringify(raw.engine.name)} — expected one of ${[...V2_ENGINE_NAMES].join(", ")}`
        );
      }
      if (raw.engine.version !== undefined && typeof raw.engine.version !== "string") {
        err("v2-engine-version", "theme.json: engine.version must be a string when present");
      }
      // 2026-08-19 architecture audit finding 3: `loadTheme()` (`theme.ts`) still parses
      // `engine: typeof raw.engine === "number" ? raw.engine : 1` — an object-valued engine is
      // silently coerced to `1`, discarding whatever `{ name, version }` this manifest declared.
      // "Schema-valid" must not mean "the runtime will actually read this" — see `profiles.ts`'s
      // `UNIMPLEMENTED_V2_FIELD_PATTERN` for the author-warns/install-errors severity split.
      err(
        "v2-engine-object-unimplemented",
        "theme.json: engine as an object is not yet read by the runtime loader (theme.ts still coerces any non-number engine to 1) — this declaration will be silently discarded"
      );
    }
  }
  // `engine` is deliberately NOT added to `flaggedUnimplemented` here — the generic sweep already
  // skips it unconditionally via `V2_FIELDS_READ_BY_LOADER` (the key itself IS read, in its number
  // form; only the object shape above is unimplemented, and that already has its own finding).

  if (raw.tokens !== undefined) {
    if (!isObject(raw.tokens)) {
      err("v2-tokens-shape", "theme.json: tokens must be an object ({ defaultMode, modes }) in schema v2");
    } else {
      const modes = isObject(raw.tokens.modes) ? raw.tokens.modes : undefined;
      if (!modes) {
        err("v2-tokens-modes", "theme.json: tokens.modes must be an object mapping mode name -> file path");
      } else if (
        typeof raw.tokens.defaultMode === "string" &&
        !Object.prototype.hasOwnProperty.call(modes, raw.tokens.defaultMode)
      ) {
        err(
          "v2-tokens-default-mode",
          `theme.json: tokens.defaultMode '${raw.tokens.defaultMode}' is not listed in tokens.modes`
        );
      }
    }
    // 2026-08-19 architecture audit finding 3: `loadTheme()` reads mode/token-file information only
    // from the FLAT `modes`/`defaultMode` top-level fields and hardcodes the light-variant filename
    // `tokens.light.json` — it never reads this nested `tokens` object at all, valid or not. A theme
    // declaring only this (and no flat `modes`/`defaultMode`) renders with no error but the wrong (or
    // no) mode switching.
    err(
      "v2-tokens-unimplemented",
      "theme.json: nested tokens (defaultMode/modes) is not yet read by the runtime loader (theme.ts reads the flat top-level modes/defaultMode fields instead, and hardcodes the tokens.light.json filename) — this declaration will be silently ignored"
    );
    flaggedUnimplemented.add("tokens");
  }

  if (raw.license !== undefined && !isObject(raw.license)) {
    err("v2-license-shape", "theme.json: license must be an object ({ spdx, file }) in schema v2");
  }
  if (raw.authors !== undefined && !Array.isArray(raw.authors)) {
    err("v2-authors-shape", "theme.json: authors must be an array of { name, url? } in schema v2");
  }
  if (raw.attributions !== undefined && !Array.isArray(raw.attributions)) {
    err("v2-attributions-shape", "theme.json: attributions must be an array in schema v2");
  }
  if (raw.partials !== undefined) {
    if (!isObject(raw.partials)) {
      err("v2-partials-shape", "theme.json: partials must be an object keyed by partial id");
    }
    // 2026-08-19 architecture audit finding 3: `partials` is `theme-authoring-guide-v2.md` §10's
    // `[TARGET]` rename of the REAL field `loadTheme()` actually reads — `slots` (`theme.ts`, flat,
    // apiVersion-agnostic). A marketplace theme declaring `partials.hero.source` installs successfully
    // (this field's own `checkDeclaredReferences` pass in `validate-theme-package.ts` only checks that
    // the referenced FILE exists, never that anything resolves it) and then renders with that partial
    // unresolved — the runtime looks up `manifest.slots`, never `manifest.partials`. Declare the SAME
    // mapping under `slots` for it to actually take effect.
    err(
      "v2-partials-unimplemented",
      "theme.json: partials is not yet read by the runtime loader (theme.ts still reads the flat slots field) — declare this mapping under slots instead, or this partial will render unresolved"
    );
    flaggedUnimplemented.add("partials");
  }
  if (raw.regions !== undefined && !Array.isArray(raw.regions)) {
    err("v2-regions-shape", "theme.json: regions must be an array of strings");
  }
  if (raw.renderer !== undefined) {
    // 2026-08-19 architecture audit finding 3: no loader or renderer branch anywhere in this codebase
    // reads `renderer` yet (`theme-authoring-guide-v2.md` §15's own field table: "unread";
    // `code-tier-asset-normalizer.ts` is the closest real code and has zero callers for this field).
    // Declared for forward-authoring only; see `profiles.ts` for why `author` still just warns.
    err(
      "v2-renderer-unimplemented",
      "theme.json: renderer is not yet read by any runtime code path — declaring it has no effect on how this theme actually renders"
    );
    flaggedUnimplemented.add("renderer");
  }

  // `lineage`/`skipLiquidAllowlist` are the two 2026-08-18 schema decisions: neither is a v2 field at
  // all (see `theme-lineage.ts` and `ThemeManifest.skipLiquidAllowlist`'s own doc comments) — the
  // generic unknown-field loop above already rejects either if present; called out explicitly here so
  // a future reader sees WHY, rather than assuming the omission from `V2_TOP_LEVEL_KEYS` is a gap.

  if (raw.build !== undefined) {
    issues.push(...validateBuildV2(raw.build));
  }

  // Self-maintaining unimplemented-field sweep (2026-08-19 re-audit of architecture audit finding 3):
  // every OTHER top-level v2 key actually present in this manifest that the loader does not read
  // (`V2_FIELDS_READ_BY_LOADER`) and that isn't reserved metadata (`V2_RESERVED_METADATA_FIELDS`) gets
  // a generic `v2-<field>-unimplemented` finding automatically. This is what currently fires for
  // `scripts`, `assets`, `ai`, and dead `pages` — none of which had ANY finding before this fix, despite
  // this file's own prior header claiming otherwise for the first three. Because this loop is driven by
  // set membership rather than a hand-maintained list of `err()` calls, a field added to
  // `V2_TOP_LEVEL_KEYS` in the future is flagged by default the moment it's added, unless a change also
  // classifies it into one of the two allow-lists (or gives it its own bespoke check that
  // `flaggedUnimplemented.add`s it, like `partials`/`renderer`/`tokens` above) — the opposite failure
  // mode from before, where a field could be silently allowed until someone remembered to add a check.
  for (const key of Object.keys(raw)) {
    if (!V2_TOP_LEVEL_KEYS.has(key)) continue; // already reported as v2-unknown-field above
    if (V2_FIELDS_READ_BY_LOADER.has(key) || V2_RESERVED_METADATA_FIELDS.has(key)) continue;
    if (flaggedUnimplemented.has(key)) continue; // already reported with its own specific rule id above
    err(
      `v2-${key}-unimplemented`,
      `theme.json: ${key} is not yet read by the runtime loader (theme.ts) — this declaration will be silently ignored`
    );
  }

  return issues;
}

function validateBuildV2(build: unknown): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
  const err = (ruleId: string, message: string): void => {
    issues.push({ ruleId, message });
  };

  if (!isObject(build)) {
    err("v2-build-shape", "theme.json: build must be an object when present");
    return issues;
  }
  if (build.source !== undefined && (typeof build.source !== "string" || !V2_BUILD_SOURCES.has(build.source))) {
    err("v2-build-source", `theme.json: unrecognized build.source ${JSON.stringify(build.source)} — expected 'authored' or 'compiled'`);
  }
  if (build.framework !== undefined && (typeof build.framework !== "string" || !V2_BUILD_FRAMEWORKS.has(build.framework))) {
    err(
      "v2-build-framework",
      `theme.json: unrecognized build.framework ${JSON.stringify(build.framework)} — expected one of ${[...V2_BUILD_FRAMEWORKS].join(", ")}`
    );
  }
  if (build.source === "compiled") {
    if (typeof build.sourceDir !== "string" || build.sourceDir.length === 0) {
      err("v2-build-sourcedir-required", "theme.json: build.sourceDir is required (non-empty) when build.source is 'compiled'");
    } else if (isSourceDirGeneratedConflict(build.sourceDir)) {
      err(
        "v2-build-sourcedir-conflict",
        `theme.json: build.sourceDir '${build.sourceDir}' must not name or contain a reserved generated directory`
      );
    }
    if (
      !isObject(build.artifactHashes) ||
      Object.keys(build.artifactHashes as Record<string, unknown>).length === 0
    ) {
      err("v2-build-artifacthashes-required", "theme.json: build.artifactHashes (non-empty) is required when build.source is 'compiled'");
    }
  }

  return issues;
}
