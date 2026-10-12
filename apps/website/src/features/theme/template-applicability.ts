/** CMS content kinds a theme template may be offered to. */
export type ThemeTemplateKind = "post" | "page";
export type ThemeTemplateFor = Readonly<Record<string, readonly ThemeTemplateKind[]>>;

/**
 * Parse optional applicability metadata. Malformed declarations throw so both discovery and
 * package validation reject them rather than silently offering the wrong templates.
 */
export function parseTemplateFor(
  required: { value: unknown; templates?: readonly string[] },
  _optional: Record<string, never> = {}
): ThemeTemplateFor | undefined {
  const { value, templates } = required;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("theme.json templateFor must be an object mapping template names to content kinds");
  }
  const declared = new Set(templates ?? []);
  const entries = Object.entries(value).map(([template, kinds]) => {
    if (!declared.has(template)) {
      throw new Error(`theme.json templateFor '${template}' is not listed in templates`);
    }
    if (!Array.isArray(kinds) || kinds.length === 0 ||
        !kinds.every((kind) => kind === "post" || kind === "page") ||
        new Set(kinds).size !== kinds.length) {
      throw new Error(`theme.json templateFor '${template}' must be a non-empty array of unique 'post'/'page' kinds`);
    }
    return [template, kinds as ThemeTemplateKind[]] as const;
  });
  return Object.fromEntries(entries);
}

/**
 * Offer applicable templates in manifest order. Missing metadata applies to both kinds;
 * omitting kind returns the full catalog for callers outside the content editors.
 */
export function applicableThemeTemplates(
  required: { manifest?: { templates?: readonly string[]; templateFor?: ThemeTemplateFor }; kind?: ThemeTemplateKind },
  _optional: Record<string, never> = {}
): string[] {
  const { manifest, kind } = required;
  return (manifest?.templates ?? []).filter((template) => {
    const mapping = manifest?.templateFor;
    const kinds = mapping && Object.hasOwn(mapping, template) ? mapping[template] : undefined;
    return kind === undefined || kinds === undefined || kinds.includes(kind);
  });
}
