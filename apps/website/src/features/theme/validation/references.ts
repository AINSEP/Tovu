import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ThemeValidationIssue } from "./profiles.js";

/**
 * @file Manifest-to-file consistency: every file path a manifest DECLARES must resolve to a real file
 * inside the package, and two different logical ids must not silently point at the same source file
 * (a copy-paste manifest bug that would make one edit invisibly affect both).
 *
 * Scoped to the fields nothing else already checks. `slots`/`templates` (v1's real fields) are
 * already verified by `loadTheme()` itself (`loadStaticTierAssets`, `validateTemplateDeclarations`,
 * `theme.ts`) — `validate-theme-package.ts`'s orchestrator surfaces those errors directly from
 * `loadTheme()`'s own result for the v1 fallback path rather than this module re-deriving them (the
 * "keep `checkBuiltThemeConformance` exactly where it is" reasoning applied to `loadTheme()` itself).
 * `partials`/`renderer.pages` (v2's TARGET fields, §5/§10/§11 of `theme-authoring-guide-v2.md`) are
 * NOT parsed by anything else yet — this module is their only reference check today. Compiled-theme
 * hash-coverage exhaustiveness is `checkBuiltThemeConformance`'s job, not duplicated here either.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `source`-shaped string this raw value carries, one level deep — covers a `partials` entry's
 * own `source` plus its `variants` map (`{ minimal: "render/partials/footer-minimal.html" }`), and a
 * `renderer.pages` entry's `source`, without assuming a shape neither field's target design pins down
 * more precisely than "a source is a relative file path" (see this file's header). */
function collectDeclaredSources(entry: unknown): string[] {
  if (!isObject(entry)) return [];
  const sources: string[] = [];
  if (typeof entry.source === "string") sources.push(entry.source);
  if (isObject(entry.variants)) {
    for (const value of Object.values(entry.variants)) {
      if (typeof value === "string") sources.push(value);
    }
  }
  return sources;
}

/**
 * Check every declared source path in a `partials` (or `renderer.pages`) map against real files on
 * disk, and flag any two different logical ids that declare the identical source path.
 *
 * @param required.fieldName - Only used to name the field in issue messages (`"partials"` or
 * `"renderer.pages"`) — this function's logic is identical for both, so it is not duplicated per field.
 * @complexity O(e) in the map's own (small, bounded) entry count.
 */
export function checkDeclaredReferences(
  required: { themeDir: string; fieldName: string; entries: unknown },
  _optional: Record<string, never> = {}
): ThemeValidationIssue[] {
  const { themeDir, fieldName, entries } = required;
  if (!isObject(entries)) return [];

  const issues: ThemeValidationIssue[] = [];
  const sourceOwners = new Map<string, string[]>();

  for (const [id, entry] of Object.entries(entries)) {
    for (const source of collectDeclaredSources(entry)) {
      if (!existsSync(join(themeDir, source))) {
        issues.push({
          ruleId: "references-missing-file",
          message: `${fieldName}.${id} references '${source}', which does not exist in this theme package`,
          path: source,
        });
      }
      sourceOwners.set(source, [...(sourceOwners.get(source) ?? []), id]);
    }
  }

  for (const [source, owners] of sourceOwners) {
    if (owners.length > 1) {
      issues.push({
        ruleId: "references-duplicate-source",
        message: `${fieldName} entries [${owners.join(", ")}] all reference the same file '${source}' — each logical id should have its own source, or this is a copy-paste error`,
        path: source,
      });
    }
  }

  return issues;
}
