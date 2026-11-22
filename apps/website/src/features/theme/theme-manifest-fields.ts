import type { DeclaredScript } from "@jini-ai/cookie-consent";
import { type ThemeManifest, type ThemeBuildInfo, type ThemeTier } from "./render-contract.js";
import { readFileSync } from "node:fs";
import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";




const THEME_TIERS: readonly ThemeTier[] = ["declarative", "templated", "handlebars", "static", "code"];

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJson({ path }: { path: string }, _optional = {}): JsonValue {
  return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
}

/** Default an absent/empty `theme.json.tier`; reject a present value this build cannot render. */
export function parseTier({ value }: { value: JsonValue | undefined }, _optional = {}): ThemeTier {
  if (value === undefined || value === "") return "declarative";
  if (typeof value === "string" && (THEME_TIERS as readonly string[]).includes(value)) {
    return value as ThemeTier;
  }
  throw new Error(`unrecognized theme tier '${String(value)}'`);
}

/** `typeof value === "string" ? value : undefined` — the shape every plain optional-string
 * `theme.json` field shares (`author`, `description`, `defaultMode`, `build.builderVersion`,
 * `build.lockfileHash`, …); factored out once rather than repeated at each call site. */
export function parseOptionalString({ value }: { value: JsonValue | undefined }, _optional = {}): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `Array.isArray(value) ? value.map(String) : undefined` — the shape every plain optional
 * string-array `theme.json` field shares (`fonts`, `regions`, `templates`, `modes`). */
export function parseOptionalStringArray({ value }: { value: JsonValue | undefined }, _optional = {}): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}

/**
 * `{ ...obj }` minus every key whose value is falsy. Centralizes the "include this optional field
 * only when it has a real value" rule {@link parseThemeBuildInfo}'s return object used to apply as
 * five separate `...(x ? {x} : {})` spreads — one per optional {@link ThemeBuildInfo} field.
 */
function pickTruthy<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => Boolean(v))) as Partial<T>;
}

/** `build.framework` — one of the three known values, or `undefined` for anything else
 * (including an unrecognized framework string, e.g. a theme built with a tool this doesn't
 * name yet — dropped rather than failing the parse, matching every other optional field here). */
function parseBuildFramework({ value }: { value: JsonValue | undefined }, _optional = {}): ThemeBuildInfo["framework"] {
  return value === "react" || value === "vue" || value === "angular" ? value : undefined;
}

/** `build.sourceDir` — a non-empty string, or `undefined` (absent, wrong type, or `""`). Presence
 * is enforced separately, at {@link loadTheme}'s call site, once {@link ThemeBuildInfo.source} is
 * known to be `"compiled"` — see this field's own doc for why that check lives there. */
function parseBuildSourceDir({ value }: { value: JsonValue | undefined }, _optional = {}): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `build.artifactHashes` — every entry whose value isn't a string is dropped rather than failing
 * the parse (a build tool emitting one malformed hash shouldn't sink the whole manifest); emptiness
 * after filtering is a {@link loadTheme} call-site concern, matching `sourceDir`'s split above. */
function parseBuildArtifactHashes({ value }: { value: JsonValue | undefined }, _optional = {}): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/**
 * Parse `theme.json.build` into {@link ThemeBuildInfo}. Absent or non-object ⇒ `undefined` (this theme
 * is `authored`, unchanged from before this field existed). Malformed or missing OPTIONAL fields
 * degrade to omission rather than throwing — that is a different failure class than {@link parseTier}'s
 * fail-closed contract (see {@link ThemeBuildInfo.source}'s own doc for why). The two fields REQUIRED
 * for a `compiled` build (`sourceDir`, non-empty `artifactHashes`) are not enforced here — this
 * function only shapes what is present; {@link loadTheme}'s own call site pushes the "required when
 * compiled" errors, matching how `defaultMode`'s cross-field check already lives at the call site
 * rather than inside its own field's parser.
 */
export function parseThemeBuildInfo({ value }: { value: JsonValue | undefined }, _optional = {}): ThemeBuildInfo | undefined {
  if (!isObject(value)) return undefined;
  const source = value.source === "compiled" ? "compiled" : "authored";
  const framework = parseBuildFramework({ value: value.framework });
  const sourceDir = parseBuildSourceDir({ value: value.sourceDir });
  const builderVersion = parseOptionalString({ value: value.builderVersion });
  const lockfileHash = parseOptionalString({ value: value.lockfileHash });
  const artifactHashes = parseBuildArtifactHashes({ value: value.artifactHashes });

  return {
    source,
    ...pickTruthy({ framework, sourceDir, builderVersion, lockfileHash, artifactHashes }),
  };
}


/** Resolve authored ./ and ../ asset declarations against the theme's public asset directory.
 * Absolute site and HTTP(S) URLs remain explicit. O(script count + URL bytes); no page/body reads. */
export function resolveThemeScripts({ manifest }: { manifest: Pick<ThemeManifest, 'id' | 'scripts'> }, _optional = {}): DeclaredScript[] {
  const prefix = `/theme-assets/${encodeURIComponent(manifest.id)}/`;
  return (manifest.scripts ?? []).map(script => {
    if (!script.src.startsWith('.')) return script;
    const relative = script.src.replace(/^(?:\.\.?\/)+/, '');
    const url = new URL(prefix + relative, 'https://theme.invalid');
    if (!url.pathname.startsWith(prefix)) throw new Error('Theme script must stay inside its asset directory.');
    return { ...script, src: url.pathname + url.search + url.hash };
  });
}
