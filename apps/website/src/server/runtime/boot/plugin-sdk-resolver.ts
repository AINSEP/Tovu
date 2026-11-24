import { createRequire } from "node:module";
import { LEGACY_PLUGIN_SDK_SPECIFIER, PLUGIN_SDK_SPECIFIERS } from "@jini-ai/plugins/host";
import { registerPluginSdkResolver as registerResolver } from "@jini-ai/plugins/runtime/sdk-resolver";

/** Used only by `resolveDefaultSdkModulePath()` below to reach real Node package resolution for
 * the `@tovu/sdk` bare specifier — same idiom as `admin-static.ts`, `composition/deps.ts`,
 * `OpenTelemetry package resolution`, and `worker-sandbox.ts` elsewhere in this codebase. */
const require = createRequire(import.meta.url);

/** The runtime's own bundled `@tovu/sdk` build, used when the caller doesn't override
 * `sdkModulePath` (real boot). Resolved via real Node package resolution for the bare specifier
 * `"@tovu/sdk"` — the same `node_modules/@tovu/sdk` npm-workspace symlink to `packages/sdk` that
 * ordinary `import`/`require` resolution reaches — rather than a hand-computed relative path from
 * this file's own location. Layout-invariant by construction: it does not encode this file's
 * directory depth, so it can't be silently invalidated by a future directory rename the way the
 * previous `path.join(import.meta.dirname, "../../../...")` arithmetic was (twice: `f9b42698`,
 * `708e81b2`) — see `ADS-memory/reports/2026-09-05-plugin-sdk-path-verdict.md`. Exported so a test
 * can assert on the real default return value directly, since every other test in this module
 * exercises the `sdkModulePath` override instead. Jini's resolver cannot do this itself: a package
 * name resolved from Jini's dist would reach the wrong `node_modules`. */
export function resolveDefaultSdkModulePath(): string {
  return require.resolve(LEGACY_PLUGIN_SDK_SPECIFIER); // legacy alias: the bundled backing package keeps its workspace name.
}

export interface RegisterPluginSdkResolverOptional {
  /** Absolute path (or `file://` URL) to the runtime's own bundled `@tovu/sdk` build. Test seam —
   * a real composition root omits this and gets the runtime's actual built SDK path; the
   * certified test suite supplies a fixture path to prove resolution redirects there instead of
   * to a planted local `node_modules/@tovu/sdk`. */
  readonly sdkModulePath?: string;
}

/** CIC U-002 (Binding, ESCALATE_SECURITY): registers Jini's SDK resolution hook exactly once per
 * process, pointing it at the `@tovu/sdk` build this host resolves. Call synchronously during boot,
 * BEFORE any route is registered and before any code path that could reach `loadPlugin()`.
 * See `reports/pipeline/005-plugin-system/critical-internal-constraints.md` U-002.
 * @throws PluginSdkResolverAlreadyRegisteredError (Jini) if called twice in one process. */
export function registerPluginSdkResolver(optional: RegisterPluginSdkResolverOptional = {}): void {
  registerResolver({ sdkModulePath: optional.sdkModulePath ?? resolveDefaultSdkModulePath(), sdkSpecifiers: PLUGIN_SDK_SPECIFIERS });
}
