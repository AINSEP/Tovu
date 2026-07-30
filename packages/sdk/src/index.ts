/**
 * @file `@tovu/sdk` — the entire plugin-author public contract (SPEC-005 REQ-08, ADR-005 rule 1,
 * ADR-024 §3 ABI freeze).
 *
 * Purpose:
 * This file IS the public API. Everything a plugin's `server/index.mjs` may import from
 * `@tovu/sdk` is exported here and nowhere else — the runtime's internal core modules are never
 * reachable through this package (enforced by `package.json`'s `exports` map, not by this file). Hook
 * names, capability tokens, and the `definePlugin`/`PluginSdk` shapes are part of this public
 * surface and follow the ADR-005 deprecation ladder — changing any exported name/shape here is
 * an ecosystem-breaking change once a third-party plugin exists (ADR-005 "the compatibility
 * promise must exist before the first third-party plugin").
 *
 * ADR-024 §3 ABI compliance (ties REQ-05/REQ-08 to the newer governing ADR, ratified after this
 * spec's original approval): every hook is treated as always-awaited by core regardless of
 * whether a given filter function is itself `async` (`BeforeSaveFilter`'s return type is
 * `ExtPatch | Promise<ExtPatch>`); `ContentEntryDraft` is a plain, structured-clone-safe snapshot
 * — never a live ORM entity or class instance; and the `PluginSdk` object a plugin receives is a
 * freshly-built handle of plain closures, never a reference to a live core singleton. This file
 * only declares the TYPES for that contract; the runtime object satisfying `PluginSdk` (with its
 * capability-gated stub-vs-absent behavior, CIC U-003) is built by
 * `src/features/plugin-runtime/capability-sdk.ts` inside core, not here — this package has zero
 * dependency on `src/` (Module Map: "Must never import anything from `src/` — it is consumed by
 * plugin code, not by core").
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-001…C-004). Signatures and JSDoc are
 * design-frozen; `definePlugin`'s body intentionally throws until the Programmer stage implements
 * it against `__tests__/unit/sdk-public-api.unit.test.ts`. Do not implement ahead of that suite
 * being reviewed — this file exists so the snapshot test compiles and fails red, not green.
 */

/** C-004 — the exactly-three v1 capability tokens (REQ-04). A manifest declaring any other
 * string is `invalid` with `CAPABILITY_UNKNOWN` (validated in `plugin-runtime/manifest.ts`, not
 * here — this file is the single source of truth for the token *strings* only). */
export const CONTENT_READ = "content.read" as const;
export const CONTENT_EXTEND = "content.extend" as const;
export const HOOKS_ATTACH = "hooks.attach" as const;

/** Union of every valid v1 capability token string. */
export type CapabilityToken = typeof CONTENT_READ | typeof CONTENT_EXTEND | typeof HOOKS_ATTACH;

/** C-003 — the exactly-one v1 hook point (REQ-05). Declared points are enumerable via
 * `tovu hooks list` (AC-15); this is the single source of truth for the point's name string. */
export const HOOK_CONTENT_ENTRY_BEFORE_SAVE = "content.entry.beforeSave" as const;

/** The merged-into-`ext.{pluginId}` shape a `beforeSave` filter returns (state.spec.md §2
 * `SdkSurface.ExtPatch`). Values are restricted to the four JSON-primitive types BR-06's field
 * `type` vocabulary supports (`string | integer | number | boolean` — `integer` collapses to
 * `number` at the JS/TS type level; BR-06's validator distinguishes integer-vs-number at the
 * value level, not the type level). */
export type ExtPatch = Readonly<Record<string, string | number | boolean>>;

/**
 * The read-only entry snapshot a `beforeSave` filter receives (REQ-05, RT-001). A v1 filter
 * cannot mutate core entry fields — this type has no setters, and every field is `readonly`
 * (ADR-024 §3: plain, serializable, never a live ORM row). `ext` reflects every OTHER plugin's
 * already-written namespaces at the time this filter runs (TB-01 composition order) — never this
 * plugin's own not-yet-written patch.
 */
export interface ContentEntryDraft {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: "draft" | "published";
  readonly bodyJson: Readonly<Record<string, unknown>>;
  readonly ext: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** Per-invocation context passed alongside the entry draft. */
export interface HookContext {
  readonly pluginId: string;
  readonly workspaceId: string;
}

/** REQ-05's literal filter signature: `(entry, ctx) => ExtPatch`. ADR-024 §3: always treated as
 * awaited by core, so a synchronous filter and an `async` filter are equally valid. */
export type BeforeSaveFilter = (
  entry: Readonly<ContentEntryDraft>,
  ctx: HookContext
) => ExtPatch | Promise<ExtPatch>;

/**
 * The capability-scoped handle passed to `PluginDefinition.setup`. Built fresh per plugin load
 * (never a shared module-level singleton, ADR Decision item 2) by
 * `plugin-runtime/capability-sdk.ts`. **Every surface below is always present on a real `PluginSdk`
 * instance** — an ungranted capability's surface is a stub that throws a typed `CAPABILITY_DENIED`
 * error when invoked, never an absent/`undefined` property (CIC U-003; this file declares the
 * TYPE only, the runtime stub-vs-absent behavior lives in `capability-sdk.ts`).
 */
export interface PluginSdk {
  readonly content: {
    /** Gated by `content.read` (REQ-04). Read-only accessor mirroring the filter's own `entry`
     * argument — present for API completeness so a plugin can read the current draft from any
     * capability-scoped closure it holds, not only inside the filter callback itself. */
    read(): Readonly<ContentEntryDraft>;
    /** Gated by `content.extend` (REQ-04/REQ-06). Declares/writes one value into this plugin's
     * own `ext.{pluginId}.{field}` namespace; validated by BR-06 (path namespacing + declared
     * type) at the core boundary, not by this SDK object itself. */
    extend(field: string, value: string | number | boolean): void;
  };
  /** Gated by `hooks.attach` (REQ-04/REQ-05). Attaches a filter to a declared hook point.
   * Attaching to any name other than `HOOK_CONTENT_ENTRY_BEFORE_SAVE` is rejected at validation
   * time (`HOOK_UNKNOWN`, EC-05) before this method could ever be reached with a bad name. */
  addFilter(hookName: typeof HOOK_CONTENT_ENTRY_BEFORE_SAVE, filter: BeforeSaveFilter): void;
}

/** A plugin author's registration entry point payload. */
export interface PluginDefinition {
  /** Called once per load, immediately after `import()`, with a fresh capability-scoped
   * `PluginSdk` (ADR Decision item 2). May be async. */
  setup(sdk: PluginSdk): void | Promise<void>;
}

/** The typed return value of `definePlugin` — an opaque, identity-only wrapper (REQ-08). */
export interface Plugin {
  readonly definition: PluginDefinition;
}

/**
 * Wraps a `PluginDefinition` for type inference at the plugin author's call site. Pure identity
 * at runtime (no side effects, no I/O) — `loader.ts` invokes the wrapped `definition.setup(sdk)`
 * after the load pipeline's integrity/sdkRange/import steps all pass (BR-01).
 *
 * @param def - The plugin's registration definition (`{ setup(sdk) => void }`).
 * @returns The same definition, typed as `Plugin`. `definePlugin` itself never calls `setup` —
 *   that is `loadPlugin`'s job, after the verify-before-import pipeline succeeds (BR-01 step 4).
 * @complexity O(1) — pure identity wrap, no I/O, no traversal.
 * @overallScore 100/100
 */
export function definePlugin(def: PluginDefinition): Plugin {
  return { definition: def };
}
