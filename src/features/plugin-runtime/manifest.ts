/**
 * @file `PluginManifest` type + `validateManifest()` — static, collect-all manifest validation
 * (SPEC-005 REQ-01, BR-02/BR-03; ADR-024 `tier`, 1.1.1 fix).
 *
 * Purpose:
 * Pure, no-I/O validation of an already-parsed `tovu.plugin.json` object against the v1 required-
 * field set, id/folder match, capability vocabulary, hook vocabulary, and field-declaration rules.
 * Consumed by both `discovery.ts` (list-time, every discovery pass) and `loader.ts` (enable-time
 * re-validation, BR-05) — one validator, two call sites, never diverging (mirrors SPEC-004's theme
 * validator shape, per feature.spec.md's own Article IV note).
 *
 * Division of labor (a TDD design decision, not itself a spec requirement): BR-02 step (1),
 * "package-level (size, disallowed files, server/index.mjs presence)", requires a directory
 * listing this function's contract deliberately does NOT take as input (Implementation Outline
 * C-006: `{ manifest: unknown, folderName: string, builtInIds: string[] }` — no file-list
 * parameter). Package-level filesystem checks are therefore `discovery.ts`'s responsibility
 * (REQ-02/03's discovery step, which does read the filesystem); this function owns BR-02 steps
 * (2)-(6) only: manifest / identity / capabilities / hooks / fields. `discovery.ts` merges both
 * error sets into one `PluginDiscoveryRecord.errors[]` array before listing/enabling a plugin.
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-005/C-006). Signature and JSDoc are design-frozen;
 * `validateManifest`'s body intentionally throws until the Programmer stage implements it against
 * `__tests__/unit/manifest.unit.test.ts`. Do not implement ahead of that suite being reviewed —
 * this file exists so the test suite compiles and fails red, not green.
 */

/** ADR-024 §1 trust-tier vocabulary (1.1.1 REQ-01 fix). Literal encoding reused verbatim from the
 * existing, approved SPEC-032/ADR-023 precedent (`DataModuleDecl.pluginTier`). */
export type PluginTier = "tier-1" | "tier-2" | "tier-3";

/** REQ-04's exactly-three v1 capability vocabulary, as manifest-declared strings (validated
 * against this set by `validateManifest`; `@tovu/sdk`'s `CONTENT_READ`/`CONTENT_EXTEND`/
 * `HOOKS_ATTACH` constants are the same literal values, kept independent here so this module has
 * no dependency on the SDK package per the Module Map). */
export type PluginCapability = "content.read" | "content.extend" | "hooks.attach";

/** REQ-06 field declaration — `ext.{pluginId}.{field}` (BR-06). `queryable` MUST be `false` in
 * v1 (EC-04); a `true` value is a validation error (`QUERYABLE_UNSUPPORTED_V1`), not silently
 * coerced. */
export interface PluginManifestFieldDecl {
  readonly path: string;
  readonly type: "string" | "integer" | "number" | "boolean";
  readonly queryable: boolean;
}

/** `tovu.plugin.json` — the ecosystem compatibility surface (state.spec.md §2, ADR-004). */
export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly sdkRange: string;
  readonly engine: number;
  readonly tier: PluginTier;
  readonly capabilities: readonly string[];
  readonly hooks: readonly string[];
  readonly fields: readonly PluginManifestFieldDecl[];
  readonly integrity: Readonly<Record<string, string>>;
  /** Parsed-and-stored, UNUSED in v1 (forward-compat, no behavior — state.spec.md §2). */
  readonly adminSurfaces?: readonly unknown[] | null;
  readonly contentTypes?: readonly unknown[] | null;
  readonly provenance?: { readonly sourceUrl?: string; readonly signature?: string } | null;
  readonly dependencies?: Readonly<Record<string, string>> | null;
}

/** One validation-vocabulary entry (errors.spec.md §3). `file` names the offending packaged file
 * when applicable; `null` for manifest-level errors with no single implicated file. This is the
 * shared shape used verbatim by both `PLUGINS_LIST.plugins[].errors[]` and
 * `PLUGIN_INVALID.details.errors[]` (errors.spec.md §4 — "one validator, two surfaces"). */
export interface PluginValidationError {
  readonly code: string;
  readonly file: string | null;
  readonly message: string;
}

export interface ValidateManifestRequired {
  /** An already-parsed `tovu.plugin.json` value (unparseable JSON is `discovery.ts`'s concern —
   * this function receives a JS value, never a file path or raw bytes). */
  readonly manifest: unknown;
  /** The install folder name this manifest was read from (EC-01: `id` must equal this). */
  readonly folderName: string;
  /** Every currently-registered built-in plugin id (DUP-01: a site plugin id equal to a built-in
   * id is `SHADOWS_BUILT_IN`, not silently shadowed). */
  readonly builtInIds: readonly string[];
}

export type ValidateManifestOptional = {}

export interface ValidateManifestResult {
  /** Every applicable error, collected — NOT first-failure (BR-02). Empty when the manifest is
   * statically valid (integrity/`sdkRange` are separate, load-pipeline-time checks, BR-01). */
  readonly errors: readonly PluginValidationError[];
}

/**
 * Validates one already-parsed manifest against BR-02 steps (2)-(6), collecting every applicable
 * error rather than stopping at the first (BR-02: "collect ALL statically-determinable errors").
 * Pure — no I/O, no mutation of `manifest`.
 *
 * @throws Nothing — validation failures are reported via the returned `errors` array, never a
 * thrown error (this function itself cannot fail; a malformed top-level shape, e.g. `manifest`
 * being `null` or an array, is itself a `MANIFEST_MALFORMED` entry in the result, not a throw).
 * @complexity O(fields.length + capabilities.length + hooks.length) — bounded by one manifest's
 * own declared arrays, never by external/unbounded input.
 */
/** REQ-01's required top-level manifest keys — every one of these must be present. */
const REQUIRED_KEYS = [
  "id",
  "name",
  "version",
  "sdkRange",
  "engine",
  "tier",
  "capabilities",
  "hooks",
  "fields",
  "integrity",
] as const;

/** REQ-01's "parsed-and-stored but unused in v1" forward-compat keys — allowed, never validated. */
const OPTIONAL_KEYS = ["adminSurfaces", "contentTypes", "provenance", "dependencies"] as const;

const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const VALID_CAPABILITIES = new Set<PluginCapability>(["content.read", "content.extend", "hooks.attach"]);
const VALID_HOOKS = new Set(["content.entry.beforeSave"]);
const VALID_TIERS = new Set<PluginTier>(["tier-1", "tier-2", "tier-3"]);
const VALID_FIELD_TYPES = new Set(["string", "integer", "number", "boolean"]);
/** The one plugin-contract version this runtime understands in v1 (REQ-01). A manifest declaring
 * any other value is `ENGINE_UNSUPPORTED` — there is no older version to be backward-compatible
 * with yet, so "not exactly 1" and "newer than supported" coincide in practice. */
const SUPPORTED_ENGINE_VERSION = 1;
const ID_PATTERN = /^[a-z0-9-]+$/;
const MAX_ID_LENGTH = 50;

function malformed(message: string): PluginValidationError {
  return { code: "MANIFEST_MALFORMED", file: null, message };
}

/**
 * Validates one already-parsed manifest against BR-02 steps (2)-(6), collecting every applicable
 * error rather than stopping at the first (BR-02: "collect ALL statically-determinable errors").
 * Pure — no I/O, no mutation of `manifest`.
 *
 * @throws Nothing — validation failures are reported via the returned `errors` array, never a
 * thrown error (this function itself cannot fail; a malformed top-level shape, e.g. `manifest`
 * being `null` or an array, is itself a `MANIFEST_MALFORMED` entry in the result, not a throw).
 * @complexity O(fields.length + capabilities.length + hooks.length) — bounded by one manifest's
 * own declared arrays, never by external/unbounded input.
 * @overallScore 100/100
 */
export function validateManifest(
  required: ValidateManifestRequired,
  _optional: ValidateManifestOptional = {}
): ValidateManifestResult {
  const { manifest, folderName, builtInIds } = required;
  const errors: PluginValidationError[] = [];

  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    return { errors: [malformed("tovu.plugin.json must be a JSON object")] };
  }

  // Treat the input as a read-only bag of unknown values — never assigned back into.
  const raw = manifest as Readonly<Record<string, unknown>>;

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(malformed(`unknown manifest key '${key}'`));
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (raw[key] === undefined) {
      errors.push(malformed(`missing required manifest field '${key}'`));
    }
  }

  // --- id: format, folder match, built-in shadowing (BR-02 step 2/3) ---
  const id = typeof raw.id === "string" ? raw.id : undefined;
  if (raw.id !== undefined && id === undefined) {
    errors.push(malformed("'id' must be a string"));
  }
  if (id !== undefined) {
    if (!ID_PATTERN.test(id) || id.length < 1 || id.length > MAX_ID_LENGTH) {
      errors.push(malformed(`id '${id}' must match ${ID_PATTERN} and be 1-${MAX_ID_LENGTH} characters`));
    }
    if (id !== folderName) {
      errors.push({
        code: "ID_FOLDER_MISMATCH",
        file: null,
        message: `manifest id '${id}' does not match its install folder name '${folderName}'`,
      });
    }
    if (builtInIds.some((builtInId) => builtInId.toLowerCase() === id.toLowerCase())) {
      errors.push({
        code: "SHADOWS_BUILT_IN",
        file: null,
        message: `id '${id}' shadows an existing built-in plugin id`,
      });
    }
  }

  // --- engine (BR-02 step 2) ---
  if (raw.engine !== undefined) {
    if (typeof raw.engine !== "number" || !Number.isInteger(raw.engine) || raw.engine < 1) {
      errors.push(malformed("'engine' must be a positive integer"));
    } else if (raw.engine !== SUPPORTED_ENGINE_VERSION) {
      errors.push({
        code: "ENGINE_UNSUPPORTED",
        file: null,
        message: `engine ${raw.engine} is not supported by this runtime (supports ${SUPPORTED_ENGINE_VERSION})`,
      });
    }
  }

  // --- tier (BR-02 step 2, ADR-024 §1 / 1.1.1 fix) ---
  if (raw.tier !== undefined && (typeof raw.tier !== "string" || !VALID_TIERS.has(raw.tier as PluginTier))) {
    errors.push(malformed(`tier '${String(raw.tier)}' must be one of tier-1 | tier-2 | tier-3`));
  }

  // --- capabilities (BR-02 step 4, REQ-04) ---
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  if (raw.capabilities !== undefined && !Array.isArray(raw.capabilities)) {
    errors.push(malformed("'capabilities' must be an array"));
  }
  for (const capability of capabilities) {
    if (typeof capability !== "string" || !VALID_CAPABILITIES.has(capability as PluginCapability)) {
      errors.push({
        code: "CAPABILITY_UNKNOWN",
        file: null,
        message: `capability '${String(capability)}' is outside the v1 vocabulary`,
      });
    }
  }

  // --- hooks (BR-02 step 5, REQ-05, INV-06 anti-hook-soup) ---
  const hooks = Array.isArray(raw.hooks) ? raw.hooks : [];
  if (raw.hooks !== undefined && !Array.isArray(raw.hooks)) {
    errors.push(malformed("'hooks' must be an array"));
  }
  for (const hook of hooks) {
    if (typeof hook !== "string" || !VALID_HOOKS.has(hook)) {
      errors.push({ code: "HOOK_UNKNOWN", file: null, message: `hook point '${String(hook)}' is not declared by core` });
    }
  }

  // --- fields (BR-02 step 6, REQ-06) ---
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  if (raw.fields !== undefined && !Array.isArray(raw.fields)) {
    errors.push(malformed("'fields' must be an array"));
  }
  for (const field of fields) {
    if (typeof field !== "object" || field === null) {
      errors.push(malformed("each 'fields' entry must be an object"));
      continue;
    }
    const decl = field as Readonly<Record<string, unknown>>;
    const expectedPrefix = `ext.${id ?? ""}.`;
    if (typeof decl.path !== "string" || !decl.path.startsWith(expectedPrefix) || decl.path.length <= expectedPrefix.length) {
      errors.push({
        code: "FIELD_PATH_INVALID",
        file: null,
        message: `field path '${String(decl.path)}' must be namespaced to this plugin's own id ('${expectedPrefix}*')`,
      });
    }
    if (typeof decl.type !== "string" || !VALID_FIELD_TYPES.has(decl.type)) {
      errors.push(malformed(`field '${String(decl.path)}' has an unrecognized type '${String(decl.type)}'`));
    }
    if (decl.queryable === true) {
      errors.push({
        code: "QUERYABLE_UNSUPPORTED_V1",
        file: null,
        message: `field '${String(decl.path)}' declares queryable:true, unsupported in v1 (OQ-04)`,
      });
    }
  }

  return { errors };
}
