import { validateScripts } from "@jini-ai/cookie-consent/policy";
import type { ThemeSlotDescriptor } from "@jini-ai/core/contracts/site/core-theme-slots";
import { type ThemeManifest, type ThemeBuildInfo, type ThemeTier } from "./render-contract.js";
import { join } from "node:path";
import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";
// Layout constants live in @jini-ai/cms/themes/layout so discovery and file I/O do not import each other.
import { GENERATED_THEME_DIRS, isSourceDirGeneratedConflict } from "./theme-file-policy.js";
import { parseTemplateFor } from "@jini-ai/cms/themes/template-applicability";
import { rejectTemplateFor } from "@jini-ai/cms/themes/template-applicability";
import { isObject, parseOptionalStringArray, parseTier, parseOptionalString, parseThemeBuildInfo, resolveThemeScripts, readJson } from "./theme-manifest-fields.js";


/**
 * `raw.honorsCurrentPage` (current) or a legacy `raw.activeAttr` string (pre-2026-08-10 spelling —
 * see {@link ThemeSlotDescriptor.honorsCurrentPage}) — either one opts a slot in. Split out of
 * {@link parseSlots} so that function stays a plain per-key loop, the same shape `parseMarkerConfig`
 * was split out of `scanEmbedMarkers` for (`Jini/packages/cms/src/widgets/markers/marker.ts`).
 */
function parseSlotHonorsCurrentPage(raw: Readonly<Record<string, unknown>>): boolean {
  return raw.honorsCurrentPage === true || typeof raw.activeAttr === "string";
}

/** `raw.variants`, keeping only string-valued entries — `undefined` if there are none worth keeping. */
function parseSlotVariants(raw: Readonly<Record<string, unknown>>): Record<string, string> | undefined {
  if (!isObject(raw.variants)) return undefined;
  const variants = Object.fromEntries(
    Object.entries(raw.variants).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])
  );
  return Object.keys(variants).length > 0 ? variants : undefined;
}

/**
 * Parse `theme.json.slots` into {@link ThemeSlotDescriptor}s, skipping any entry that isn't an object
 * with a string `source`. Returns `undefined` for an absent/unusable field so the caller falls back to
 * {@link DEFAULT_THEME_SLOTS} rather than resolving zero slots — a theme whose `slots` block is
 * malformed still renders its nav and footer under the legacy convention instead of losing both.
 *
 * `honorsCurrentPage` accepts both spellings, additively: the current boolean, or the legacy
 * `activeAttr` string (any non-empty string). An out-of-tree theme.json that never migrates off
 * `activeAttr` must keep wiring `aria-current` exactly as it does today; this normalizes either
 * spelling onto the one field every downstream reader sees.
 */
function parseSlots({ value }: { value: JsonValue | undefined }, _optional = {}): Record<string, ThemeSlotDescriptor> | undefined {
  if (!isObject(value)) return undefined;
  const slots: Record<string, ThemeSlotDescriptor> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isObject(raw) || typeof raw.source !== "string") continue;
    const variants = parseSlotVariants(raw);
    slots[key] = {
      source: raw.source,
      ...(parseSlotHonorsCurrentPage(raw) ? { honorsCurrentPage: true } : {}),
      ...(variants ? { variants } : {}),
    };
  }
  return Object.keys(slots).length > 0 ? slots : undefined;
}

/**
 * Build a {@link ThemeManifest} from `theme.json`'s already-parsed, already-object-checked
 * contents — pure field-by-field shaping, no validation (see {@link validateManifestCrossFields}
 * for the checks that read more than one field at a time, and {@link parseThemeManifest} for the
 * try/catch this sits inside).
 */
function parseRawManifestFields({ raw, id }: { raw: Readonly<JsonObject>; id: string }, _optional = {}): ThemeManifest {
  const resolvedId = String(raw.id ?? id);
  const templates = parseOptionalStringArray({ value: raw.templates });
  return {
    id: resolvedId,
    name: String(raw.name ?? id),
    version: String(raw.version ?? "0.0.0"),
    apiVersion: raw.apiVersion === 2 ? 2 : undefined,
    tier: parseTier({ value: raw.tier }),
    engine: typeof raw.engine === "number" ? raw.engine : 1,
    author: parseOptionalString({ value: raw.author }),
    build: parseThemeBuildInfo({ value: raw.build }),
    description: parseOptionalString({ value: raw.description }),
    fonts: parseOptionalStringArray({ value: raw.fonts }),
    fontStylesheets: parseOptionalStringArray({ value: raw.fontStylesheets }),
    scripts: resolveThemeScripts({ manifest: { id: resolvedId, scripts: validateScripts({ scripts: raw.scripts }).scripts } }),
    regions: parseOptionalStringArray({ value: raw.regions }),
    // Publisher-authored flags must never disable template lint: the allowlist is the boundary
    // between authored templates and the worker. Liquid and Handlebars both enforce it;
    // Handlebars raw output, partials and decorators also expose XSS/compiler-object seams.
    // No `postTemplate`/`pageTemplate` back-compat aliases (2026-08-11 unification, owner's
    // standing rule on this contract: strictness over compat code). A manifest still carrying the
    // retired spelling simply loads with no templates, same as one that never declared any —
    // `check:embed-marker-drift` is what catches a manifest that needed converting, not this parse.
    templates,
    templateFor: parseTemplateFor({ onInvalid: rejectTemplateFor, value: raw.templateFor, templates }),
    publishedPages: parseOptionalStringArray({ value: raw.publishedPages }),
    modes: parseOptionalStringArray({ value: raw.modes }),
    defaultMode: parseOptionalString({ value: raw.defaultMode }),
    slots: parseSlots({ value: raw.slots }),
  };
}

/**
 * The `build.source: "compiled"` cross-field checks — a compiled theme is, at runtime, an
 * ordinary `static` theme, so there is no server-executing tier it maps onto (see
 * {@link ThemeBuildInfo}'s own doc), and its `sourceDir`/`artifactHashes` are REQUIRED once
 * `source` says `compiled` even though {@link parseThemeBuildInfo} treats them as optional shape.
 * Split out of {@link validateManifestCrossFields} so that function's own three top-level checks
 * (id match, `defaultMode`, and "is this a compiled build") stay a flat sequence.
 */
function validateCompiledBuildManifest(build: ThemeBuildInfo, tier: ThemeTier): string[] {
  const errors: string[] = [];
  if (tier !== "static") {
    errors.push("theme.json build.source 'compiled' requires tier 'static'");
  }
  if (!build.sourceDir) {
    errors.push("theme.json build.sourceDir is required when build.source is 'compiled'");
  } else if (isSourceDirGeneratedConflict({ sourceDir: build.sourceDir })) {
    // The deeper fix promised in `explore.ts`'s PUT handler comment (2026-08-13): a manifest is
    // refused HERE, at install time, rather than relying only on each write route's own
    // `isGeneratedThemePath` call-site refusal. That refusal (explore.ts) stays —
    // this is an earlier, independent layer, not a replacement for it. See
    // `isSourceDirGeneratedConflict`'s own doc for the three conflicting shapes (exact, nested
    // inside, or ancestor-of a generated dir) and why `"preview-notes"` is not one of them.
    errors.push(
      `theme.json build.sourceDir '${build.sourceDir}' must not name or contain a generated theme directory (${GENERATED_THEME_DIRS.join(", ")})`
    );
  } else {
    // The source directory has no generated-directory conflict.
  }
  if (!build.artifactHashes || Object.keys(build.artifactHashes).length === 0) {
    errors.push("theme.json build.artifactHashes is required when build.source is 'compiled'");
  }
  return errors;
}

/**
 * Cross-field manifest checks — each reads more than one field, which is why none of these live
 * inside {@link parseRawManifestFields} or a single field's own parser (matching how
 * {@link parseThemeBuildInfo}'s own doc already draws this line for `build`).
 */
function validateManifestCrossFields({ manifest, id }: { manifest: ThemeManifest; id: string }, _optional = {}): string[] {
  const errors: string[] = [];
  if (manifest.id !== id) errors.push(`theme.json id '${manifest.id}' must equal folder name '${id}'`);
  // A `defaultMode` the theme ships no tokens for would silently render the base `:root` block
  // while the manifest claims otherwise — the exact "declared but unreachable" failure wiring
  // these fields was meant to end, so it fails the theme loudly instead of falling back.
  if (manifest.defaultMode !== undefined && !(manifest.modes ?? []).includes(manifest.defaultMode)) {
    errors.push(
      `theme.json defaultMode '${manifest.defaultMode}' is not listed in modes [${(manifest.modes ?? []).join(", ")}]`
    );
  }
  if (manifest.build?.source === "compiled") {
    errors.push(...validateCompiledBuildManifest(manifest.build, manifest.tier));
  }
  return errors;
}

/** A manifest that never parsed at all — {@link parseThemeManifest}'s fallback when `theme.json`
 * is missing, unreadable, or not an object. Every field falls back to what `loadTheme` used
 * before any of these fields existed. */
function emptyThemeManifest({ id }: { id: string }, _optional = {}): ThemeManifest {
  return { id, name: id, version: "0.0.0", tier: "declarative", engine: 1 };
}

/**
 * Read and validate `theme.json`. Never throws — a read/parse failure degrades to
 * {@link emptyThemeManifest} plus one error, matching {@link loadTheme}'s "one bad theme never
 * breaks discovery" contract (SPEC-004 REQ-10 spirit).
 */
export function parseThemeManifest({ themeDir, id }: { themeDir: string; id: string }, _optional = {}): { manifest: ThemeManifest; errors: string[] } {
  try {
    const raw = readJson({ path: join(themeDir, "theme.json") });
    if (!isObject(raw)) throw new Error("theme.json is not an object");
    const manifest = parseRawManifestFields({ raw, id });
    return { manifest, errors: [...validateManifestCrossFields({ manifest, id }), ...validateScripts({ scripts: raw.scripts }).problems] };
  } catch (err) {
    return { manifest: emptyThemeManifest({ id }), errors: [`theme.json: ${(err as Error).message}`] };
  }
}
