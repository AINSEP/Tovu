import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadTheme } from "../theme";
import { checkApprovedRoots, checkSourceDirContainment, walkThemePackage } from "./structure";
import { checkDeclaredReferences } from "./references";
import { checkMarkupFile, checkTovuAgentAttributePresence } from "./markup";
import { validateManifestV2 } from "./manifest-v2";
import {
  resolveSeverity,
  type ThemeValidationIssue,
  type ThemeValidationProfile,
  type ThemeValidationSeverity,
} from "./profiles";

export type { ThemeValidationProfile, ThemeValidationIssue, ThemeValidationSeverity } from "./profiles";

/**
 * @file The one public entry point for theme package validation — orchestrates the sibling check
 * modules (`manifest-v2.ts`, `structure.ts`, `references.ts`, `markup.ts`) behind a single call,
 * per-`profile` severity (`profiles.ts`). Callers: `tovu theme validate` (`src/cli/commands/theme/`),
 * `marketplace.ts`'s install path, and (future) a CI sweep over `src/themes/`.
 *
 * ## Schema-version branching — why this exists at all
 *
 * No theme on disk today declares `apiVersion: 2` (no migration has run — see
 * `theme-authoring-guide-v2.md`'s own status banner). Running a v2-strict, `additionalProperties:
 * false` schema against every real theme unconditionally would fail 100% of them on day one. So:
 *
 * - `raw.apiVersion === 2` → the v2-strict path: `validateManifestV2` (schema closure + restructured
 *   fields), `checkApprovedRoots`/`checkSourceDirContainment` (v2's `render/`-nested package shape),
 *   `checkDeclaredReferences` against `partials`/`renderer.pages` (fields nothing else parses yet).
 * - anything else (absent `apiVersion`, i.e. every theme on disk today) → the v1 fallback: this
 *   module does NOT re-derive tier/build/template/slot rules `loadTheme()` already enforces maturely
 *   (`theme.ts`) — it calls `loadTheme()` and surfaces its `errors` directly, the same "keep it where
 *   it is, call it from here" reuse the brief specifies for `checkBuiltThemeConformance`.
 *
 * Markup checks (`data-agent-element`, embed vocabulary) and the package-wide bounds/symlink walk
 * (`structure.ts`'s `walkThemePackage`) run identically for both — those rules do not depend on which
 * manifest shape a package declares.
 *
 * ## Known limitation, disclosed rather than silently skipped
 *
 * A v2-declared COMPILED theme's generated-tree hash-coverage exhaustiveness
 * (`checkBuiltThemeConformance`, `build-conformance.ts`) is NOT run on the v2-strict path. That
 * checker's own file-discovery still scans v1's flat `pages/`/`css/`/`js/` layout — the v2 design's
 * `render/`-nested generated tree (`theme-authoring-guide-v2.md` §4) is `[TARGET]`, not something
 * `build-conformance.ts` understands yet, and updating its own scanning logic for `render/` is outside
 * this validator's scope. No real v2-declared compiled theme exists yet to validate against either
 * way (Milestone 3's migration hasn't run). The v1 fallback path is unaffected: `loadTheme()` already
 * runs the real conformance check internally for a v1 compiled theme, and this module surfaces that.
 */

const MARKUP_EXTENSIONS: ReadonlySet<string> = new Set([".html", ".liquid", ".hbs", ".handlebars"]);

export interface ThemeValidationFinding extends ThemeValidationIssue {
  readonly severity: ThemeValidationSeverity;
}

export interface ValidateThemePackageResult {
  readonly valid: boolean;
  readonly schemaVersion: 1 | 2;
  readonly errors: readonly ThemeValidationFinding[];
  readonly warnings: readonly ThemeValidationFinding[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate one theme package directory. Never throws — every failure mode (missing/malformed
 * manifest, containment violation, unresolved reference) is reported as a finding, matching every
 * sibling check module's contract.
 *
 * @param required.themeDir - The package directory to validate (need not be under any configured
 * themes root — see `structure.ts`'s own doc for why this validator runs its own bounded walk).
 * @param required.id - The expected theme id (its folder name) — `id` in `theme.json` must match.
 * @param required.profile - Which strictness policy to resolve findings against (`profiles.ts`).
 * @complexity O(f + m) — `f` the package's own file count (one bounded walk), `m` total markup bytes
 * across every `.html`/`.liquid`/`.hbs` file (one linear scan each).
 */
export function validateThemePackage(
  required: { themeDir: string; id: string; profile: ThemeValidationProfile },
  _optional: Record<string, never> = {}
): ValidateThemePackageResult {
  const { themeDir, id, profile } = required;
  const rawIssues: ThemeValidationIssue[] = [];

  const manifestPath = join(themeDir, "theme.json");
  let raw: Record<string, unknown> = {};
  if (!existsSync(manifestPath)) {
    rawIssues.push({ ruleId: "manifest-missing", message: "theme.json is missing" });
  } else {
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!isObject(parsed)) {
        rawIssues.push({ ruleId: "manifest-not-object", message: "theme.json is not a JSON object" });
      } else {
        raw = parsed;
      }
    } catch (err) {
      rawIssues.push({ ruleId: "manifest-invalid-json", message: `theme.json is not valid JSON: ${(err as Error).message}` });
    }
  }

  const schemaVersion: 1 | 2 = raw.apiVersion === 2 ? 2 : 1;

  const { issues: walkIssues, files } = walkThemePackage({ themeDir });
  rawIssues.push(...walkIssues);

  if (schemaVersion === 2) {
    rawIssues.push(...checkApprovedRoots({ themeDir }));
    rawIssues.push(...validateManifestV2({ raw }));
    if (typeof raw.id === "string" && raw.id !== id) {
      rawIssues.push({ ruleId: "manifest-id-mismatch", message: `theme.json id '${raw.id}' must equal folder name '${id}'` });
    }
    if (isObject(raw.build)) {
      rawIssues.push(
        ...checkSourceDirContainment({
          build: {
            source: raw.build.source === "compiled" ? "compiled" : "authored",
            sourceDir: typeof raw.build.sourceDir === "string" ? raw.build.sourceDir : undefined,
          },
          schemaVersion,
        })
      );
    }
    rawIssues.push(...checkDeclaredReferences({ themeDir, fieldName: "partials", entries: raw.partials }));
    if (isObject(raw.renderer)) {
      rawIssues.push(...checkDeclaredReferences({ themeDir, fieldName: "renderer.pages", entries: raw.renderer.pages }));
    }

    // Publish-readiness checks — §3's REQUIRED-for-marketplace fields (LICENSE, a preview thumbnail)
    // plus a non-empty description. Always evaluated; `profiles.ts`'s `resolveSeverity` is what makes
    // these advisory outside the `publish` profile — an in-progress `author`-profile theme should not
    // fail validation merely for not having picked a license yet.
    if (raw.license === undefined) {
      rawIssues.push({ ruleId: "license-missing", message: "theme.json has no license field — required before this theme can be published" });
    }
    if (typeof raw.description !== "string" || raw.description.length === 0) {
      rawIssues.push({ ruleId: "description-missing", message: "theme.json has no description — required before this theme can be published" });
    }
    if (!existsSync(join(themeDir, "assets", "previews", "card.webp"))) {
      rawIssues.push({
        ruleId: "preview-thumbnail-missing",
        message: "assets/previews/card.webp is missing — required marketplace thumbnail before this theme can be published",
      });
    }
  } else {
    // v1 fallback — see this file's own header for why this defers to `loadTheme()` rather than
    // re-deriving its rules.
    const discovered = loadTheme({ themeDir, id, source: "site" });
    for (const message of discovered.errors) {
      rawIssues.push({ ruleId: "loadtheme-error", message });
    }
  }

  // Markup checks run over every real markup file the walk found, for both schema versions — see
  // this file's own header on why these rules are schema-version-agnostic.
  for (const file of files) {
    const dot = file.relativePath.lastIndexOf(".");
    const ext = dot === -1 ? "" : file.relativePath.slice(dot).toLowerCase();
    if (!MARKUP_EXTENSIONS.has(ext)) continue;
    let content: string;
    try {
      content = readFileSync(file.absolutePath, "utf8");
    } catch {
      continue;
    }
    rawIssues.push(...checkMarkupFile({ relativePath: file.relativePath, content }));
    rawIssues.push(...checkTovuAgentAttributePresence({ relativePath: file.relativePath, content }));
  }

  const findings: ThemeValidationFinding[] = rawIssues.map((issue) => ({
    ...issue,
    severity: resolveSeverity({ ruleId: issue.ruleId, profile }),
  }));
  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warning");

  return { valid: errors.length === 0, schemaVersion, errors, warnings };
}
