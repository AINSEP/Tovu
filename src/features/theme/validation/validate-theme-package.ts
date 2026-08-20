import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadTheme } from "../theme.js";
import { checkApprovedRoots, checkSourceDirContainment, walkThemePackage, type PackageWalkEntry } from "./structure.js";
import { checkDeclaredReferences } from "./references.js";
import { checkMarkupFile, checkTovuAgentAttributePresence } from "./markup.js";
import { validateManifestV2 } from "./manifest-v2.js";
import {
  resolveSeverity,
  type ThemeValidationIssue,
  type ThemeValidationProfile,
  type ThemeValidationSeverity,
} from "./profiles.js";

export type { ThemeValidationProfile, ThemeValidationIssue, ThemeValidationSeverity } from "./profiles.js";

/**
 * @file The one public entry point for theme package validation — orchestrates the sibling check
 * modules (`manifest-v2.ts`, `structure.ts`, `references.ts`, `markup.ts`) behind a single call,
 * per-`profile` severity (`profiles.ts`). Callers: `tovu theme validate` (`src/cli/commands/theme/`),
 * `marketplace.ts`'s install path, and (future) a CI sweep over `src/themes/`.
 *
 * ## Schema-version branching — why this exists at all
 *
 * Written when no theme on disk yet declared `apiVersion: 2` — that status changed with the
 * 2026-08-18 Milestone 3 migration: all seven built-in static themes (`src/themes/static/*`) now
 * declare it and run through the v2-strict path below in normal operation, not just in tests. A v1
 * theme (absent `apiVersion`) is still fully supported — a site-authored or marketplace theme can be
 * either — which is why this module still branches rather than assuming v2 unconditionally:
 *
 * - `raw.apiVersion === 2` → the v2-strict path: `validateManifestV2` (schema closure + restructured
 *   fields), `checkApprovedRoots`/`checkSourceDirContainment` (v2's `render/`-nested package shape),
 *   `checkDeclaredReferences` against `partials`/`renderer.pages` (fields nothing else parses yet —
 *   see `manifest-v2.ts`'s own header on the `v2-*-unimplemented` findings this now also produces).
 * - anything else (absent `apiVersion`) → the v1 fallback: this module does NOT re-derive tier/build/
 *   template/slot rules `loadTheme()` already enforces maturely (`theme.ts`) — it calls `loadTheme()`
 *   and surfaces its `errors` directly, the same "keep it where it is, call it from here" reuse the
 *   brief specifies for `checkBuiltThemeConformance`.
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
 * this validator's scope. No real theme declares `build.source: "compiled"` at all today (none of the
 * seven migrated static themes are built releases), so there is nothing to validate against either
 * way yet — but that is a separate fact from Milestone 3's own migration, which HAS run (see this
 * file's own header above). The v1 fallback path is unaffected: `loadTheme()` already runs the real
 * conformance check internally for a v1 compiled theme, and this module surfaces that.
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
 * Read and parse `theme.json`. Never throws — a missing file, non-object JSON, or invalid JSON are
 * all reported as issues, matching every other check module's contract. `raw` defaults to `{}` on any
 * failure so every downstream check can keep treating it as a plain (if empty) manifest object.
 */
function loadRawManifest(themeDir: string): { raw: Record<string, unknown>; issues: ThemeValidationIssue[] } {
  const issues: ThemeValidationIssue[] = [];
  const manifestPath = join(themeDir, "theme.json");
  let raw: Record<string, unknown> = {};
  if (!existsSync(manifestPath)) {
    issues.push({ ruleId: "manifest-missing", message: "theme.json is missing" });
    return { raw, issues };
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!isObject(parsed)) {
      issues.push({ ruleId: "manifest-not-object", message: "theme.json is not a JSON object" });
    } else {
      raw = parsed;
    }
  } catch (err) {
    issues.push({ ruleId: "manifest-invalid-json", message: `theme.json is not valid JSON: ${(err as Error).message}` });
  }
  return { raw, issues };
}

function checkV2ManifestIdMatch(raw: Record<string, unknown>, id: string): ThemeValidationIssue[] {
  if (typeof raw.id !== "string" || raw.id === id) return [];
  return [{ ruleId: "manifest-id-mismatch", message: `theme.json id '${raw.id}' must equal folder name '${id}'` }];
}

/** `build.source: "compiled"`'s `sourceDir` containment rule (`structure.ts`'s
 * `checkSourceDirContainment`) — a no-op when `build` isn't declared at all. `schemaVersion` is
 * hardcoded to `2` here rather than threaded through: this function is only ever called from the
 * v2-strict path, where it can never be anything else. */
function checkV2BuildContainment(raw: Record<string, unknown>): ThemeValidationIssue[] {
  if (!isObject(raw.build)) return [];
  return checkSourceDirContainment({
    build: {
      source: raw.build.source === "compiled" ? "compiled" : "authored",
      sourceDir: typeof raw.build.sourceDir === "string" ? raw.build.sourceDir : undefined,
    },
    schemaVersion: 2,
  });
}

function checkV2References(raw: Record<string, unknown>, themeDir: string): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [...checkDeclaredReferences({ themeDir, fieldName: "partials", entries: raw.partials })];
  if (isObject(raw.renderer)) {
    issues.push(...checkDeclaredReferences({ themeDir, fieldName: "renderer.pages", entries: raw.renderer.pages }));
  }
  return issues;
}

/**
 * Publish-readiness checks — §3's REQUIRED-for-marketplace fields (LICENSE, a preview thumbnail) plus
 * a non-empty description. Always evaluated; `profiles.ts`'s `resolveSeverity` is what makes these
 * advisory outside the `publish` profile — an in-progress `author`-profile theme should not fail
 * validation merely for not having picked a license yet.
 */
function checkV2PublishReadiness(raw: Record<string, unknown>, themeDir: string): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
  if (raw.license === undefined) {
    issues.push({ ruleId: "license-missing", message: "theme.json has no license field — required before this theme can be published" });
  }
  if (typeof raw.description !== "string" || raw.description.length === 0) {
    issues.push({ ruleId: "description-missing", message: "theme.json has no description — required before this theme can be published" });
  }
  if (!existsSync(join(themeDir, "assets", "previews", "card.webp"))) {
    issues.push({
      ruleId: "preview-thumbnail-missing",
      message: "assets/previews/card.webp is missing — required marketplace thumbnail before this theme can be published",
    });
  }
  return issues;
}

/**
 * The v2-strict path: `validateManifestV2` (schema closure + restructured fields),
 * `checkApprovedRoots`/`checkSourceDirContainment` (v2's `render/`-nested package shape),
 * `checkDeclaredReferences` against `partials`/`renderer.pages` — see this file's own header for the
 * full rationale.
 */
function runV2StrictChecks(raw: Record<string, unknown>, id: string, themeDir: string): ThemeValidationIssue[] {
  return [
    ...checkApprovedRoots({ themeDir }),
    ...validateManifestV2({ raw }),
    ...checkV2ManifestIdMatch(raw, id),
    ...checkV2BuildContainment(raw),
    ...checkV2References(raw, themeDir),
    ...checkV2PublishReadiness(raw, themeDir),
  ];
}

/** v1 fallback — see this file's own header for why this defers to `loadTheme()` rather than
 * re-deriving its rules. */
function runV1FallbackCheck(themeDir: string, id: string): ThemeValidationIssue[] {
  const discovered = loadTheme({ themeDir, id, source: "site" });
  return discovered.errors.map((message) => ({ ruleId: "loadtheme-error", message }));
}

/** Markup checks run over every real markup file the walk found, for both schema versions — see this
 * file's own header on why these rules are schema-version-agnostic. A file that disappears (or turns
 * unreadable) between the walk and this read is skipped rather than thrown — the walk and this loop
 * are not atomic against concurrent filesystem changes. */
function checkMarkupFiles(files: readonly PackageWalkEntry[]): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
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
    issues.push(...checkMarkupFile({ relativePath: file.relativePath, content }));
    issues.push(...checkTovuAgentAttributePresence({ relativePath: file.relativePath, content }));
  }
  return issues;
}

function resolveFindings(
  rawIssues: readonly ThemeValidationIssue[],
  profile: ThemeValidationProfile
): { errors: ThemeValidationFinding[]; warnings: ThemeValidationFinding[] } {
  const findings: ThemeValidationFinding[] = rawIssues.map((issue) => ({
    ...issue,
    severity: resolveSeverity({ ruleId: issue.ruleId, profile }),
  }));
  return {
    errors: findings.filter((finding) => finding.severity === "error"),
    warnings: findings.filter((finding) => finding.severity === "warning"),
  };
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

  const { raw, issues: manifestIssues } = loadRawManifest(themeDir);
  rawIssues.push(...manifestIssues);

  const schemaVersion: 1 | 2 = raw.apiVersion === 2 ? 2 : 1;

  const { issues: walkIssues, files } = walkThemePackage({ themeDir });
  rawIssues.push(...walkIssues);

  rawIssues.push(...(schemaVersion === 2 ? runV2StrictChecks(raw, id, themeDir) : runV1FallbackCheck(themeDir, id)));

  rawIssues.push(...checkMarkupFiles(files));

  const { errors, warnings } = resolveFindings(rawIssues, profile);
  return { valid: errors.length === 0, schemaVersion, errors, warnings };
}
