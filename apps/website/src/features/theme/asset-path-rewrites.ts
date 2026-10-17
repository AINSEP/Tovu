import type { AssetPathRewriteRule } from "./migration/theme-migration-plan.js";

/**
 * Rewrite a theme's absolute asset references using migration's prefix rules. A file move alone
 * leaves hardcoded references pointing at the old location; duplication also changes the theme id.
 * The slash after the source id keeps similarly named themes (e.g. `foo-other`) untouched.
 *
 * @param required - Text, source theme id, and the old/new paths below that theme's asset root.
 * @param optional.targetThemeId - Destination id; omitted for an in-place layout migration.
 * @returns Rewritten text without changing the input or performing I/O. Never throws for valid inputs.
 * @complexity O(n * r) time and O(n) space for text length n and the small rewrite-rule count r.
 */
export function rewriteThemeAssetPaths(
  required: { content: string; sourceThemeId: string; rules: readonly AssetPathRewriteRule[] },
  optional: { targetThemeId?: string } = {}
): string {
  const { content, sourceThemeId, rules } = required;
  const targetThemeId = optional.targetThemeId ?? sourceThemeId;
  return rules.reduce(
    (text, rule) => text.split(`/theme-assets/${sourceThemeId}/${rule.v1Prefix}`).join(`/theme-assets/${targetThemeId}/${rule.v2Prefix}`),
    content
  );
}
