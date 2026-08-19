/**
 * @file `registerPluginSdkResolver()` — the boot-time `@tovu/sdk` module-resolution hook
 * (SPEC-005 ADR "SDK Resolution Mechanism"; CIC U-002, `ESCALATE_SECURITY`).
 *
 * Purpose:
 * A plugin's prebuilt `server/index.mjs` does `import { definePlugin } from '@tovu/sdk'`, but
 * that file is dynamically `import()`-ed from `<install-dir>/plugins/<id>/<version>/server/
 * index.mjs` — a directory the runtime binary's own `node_modules` (where `@tovu/sdk` actually
 * lives) is not an ancestor of. Ordinary Node resolution will not find it. This function
 * registers Node's built-in module-customization hook (`node:module`'s `register()`, stable since
 * Node 18.19/20.6) so every `@tovu/sdk`/`@tovu/*` bare-specifier resolution — regardless of the
 * importing file's location on disk — redirects to the runtime's own bundled SDK build,
 * `shortCircuit: true` always winning over any incidental local `node_modules` a plugin might
 * (maliciously or accidentally) plant nearby.
 *
 * **CIC U-002 (Binding, ESCALATE_SECURITY):** this function must be called exactly once,
 * synchronously, during `src/index.ts`'s boot sequence, BEFORE any route is registered and before
 * any code path that could reach `loadPlugin()` is wired into the running process. A plugin
 * `import()` that occurs before this hook exists falls through to ordinary Node resolution, which
 * could resolve `@tovu/sdk` to a plugin-planted local `node_modules/@tovu/sdk` instead of the
 * runtime's real one — defeating ADR-005 rule 1's deep-import blocking by construction (a fake
 * `@tovu/sdk` build could re-export `@tovu/core` internals freely). Any deviation from
 * "registered synchronously, before anything else at boot" requires a recorded
 * `[CIC_DEVIATION_APPROVED]` entry — see
 * `reports/pipeline/005-plugin-system/critical-internal-constraints.md` U-002.
 *
 * Architectural role:
 * TDD-certified implementation (implementation outline C-015, CIC U-002). Signature and JSDoc are
 * design-frozen; `registerPluginSdkResolver()` registers Node's `module.register()` customization
 * hook exactly once per process (throwing `PluginSdkResolverAlreadyRegisteredError` on a second
 * call), redirecting `@tovu/sdk` resolution to the runtime's bundled build. Verified against
 * `__tests__/integration/plugin-sdk-resolver.integration.test.ts`.
 */

import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The hook module's own source, registered via a `data:` URL rather than a separate file on disk.
 * Node's `module.register()` API requires the hooks module to be a real, independently-loadable
 * ESM module (it runs in a dedicated hooks realm, not this file's own CJS scope) — a `data:
 * text/javascript,...` URL is a self-contained module specifier Node's ESM loader resolves
 * directly, so this mechanism needs no extra `.mjs` file to keep in sync with the compiled
 * `dist/` output. `initialize(data)` receives the one thing this hook needs at registration time
 * (the resolved SDK URL); `resolve()` redirects only the exact `@tovu/sdk` specifier — v1 ships no
 * other `@tovu/*` package, so there is nothing else to redirect yet.
 */
const HOOK_MODULE_SOURCE = `
let sdkUrl;
export function initialize(data) { sdkUrl = data.sdkUrl; }
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@tovu/sdk") {
    return { url: sdkUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

let registered = false;

/** The runtime's own bundled `@tovu/sdk` build, used when the caller doesn't override
 * `sdkModulePath` (real boot). Resolved relative to this file's own location so it is correct both
 * under `tsx` (running from `src/`) and the compiled `dist/` output (mirrors `packages/sdk`'s
 * sibling position to `src/` in both layouts). */
function resolveDefaultSdkModulePath(): string {
  return path.join(import.meta.dirname, "../../../packages/sdk/dist/index.js");
}

/** Thrown by a second `registerPluginSdkResolver()` call in the same process — distinguishes the
 * intentional double-registration guard from any other failure (e.g. this stub's own "not
 * implemented" throw), so a test can assert specifically on THIS failure mode. */
export class PluginSdkResolverAlreadyRegisteredError extends Error {
  constructor() {
    super("registerPluginSdkResolver: already registered for this process — a second call is a boot-sequencing bug");
    this.name = "PluginSdkResolverAlreadyRegisteredError";
  }
}

export interface RegisterPluginSdkResolverOptional {
  /** Absolute path (or `file://` URL) to the runtime's own bundled `@tovu/sdk` build. Test seam —
   * a real composition root omits this and gets the runtime's actual built SDK path; the
   * certified test suite supplies a fixture path to prove resolution redirects there instead of
   * to a planted local `node_modules/@tovu/sdk`. */
  readonly sdkModulePath?: string;
}

/**
 * Registers the `module.register()` customization hook exactly once for this process. Calling
 * this a second time is a wiring bug, not a silently-tolerated no-op (CIC U-002's own Contract Map
 * note: "must be idempotent-safe if accidentally called twice (should no-op or throw clearly, not
 * double-register)") — this stub's frozen contract commits to throwing clearly on a second call,
 * so a boot-sequencing bug fails loudly rather than silently double-hooking.
 *
 * @throws If called more than once in the same process.
 */
export function registerPluginSdkResolver(_optional: RegisterPluginSdkResolverOptional = {}): void {
  // CIC U-002-B1: exactly once per process — a second call is a boot-sequencing bug, never a
  // silent no-op or a silent double-hook.
  if (registered) {
    throw new PluginSdkResolverAlreadyRegisteredError();
  }

  const sdkModulePath = _optional.sdkModulePath ?? resolveDefaultSdkModulePath();
  const sdkUrl = pathToFileURL(sdkModulePath).href;
  const hookModuleUrl = `data:text/javascript,${encodeURIComponent(HOOK_MODULE_SOURCE)}`;

  register(hookModuleUrl, { data: { sdkUrl } });
  registered = true;
}
