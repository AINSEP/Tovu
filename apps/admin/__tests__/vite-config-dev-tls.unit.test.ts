import { expect, test } from "vitest";

import { isDevTlsExplicitlyDisabled } from "../dev-tls-disable-flag";

/**
 * @file Regression coverage for `vite.config.ts`'s `TOVU_DISABLE_DEV_TLS` gate — the admin sibling of
 * `apps/website/src/server/runtime/boot/dev-tls.ts`'s and `development/scripts/dev.mjs`'s own copies
 * of this same parse (see each file's own header for why there are three copies, not one shared
 * module).
 *
 * Targets `dev-tls-disable-flag.ts`, a zero-dependency leaf module split out of `vite.config.ts`
 * itself specifically so this could be tested: `vite.config.ts` imports the `vite` package and calls
 * `defineConfig`, so importing IT from inside this repo's own vitest (itself Vite-powered) test run
 * recursively re-invokes Vite's own esbuild transform pipeline — reproducibly crashed with `Invariant
 * violation: "new TextEncoder().encode("") instanceof Uint8Array" is incorrectly false` (two esbuild
 * service instances colliding) on this machine, twice, while an ordinary admin test passed under the
 * same `vitest run` invocation. See `dev-tls-disable-flag.ts`'s own header for the full account.
 */

test("isDevTlsExplicitlyDisabled: true only for \"1\"/\"true\" (case-insensitive)", () => {
  expect(isDevTlsExplicitlyDisabled("1")).toBe(true);
  expect(isDevTlsExplicitlyDisabled("true")).toBe(true);
  expect(isDevTlsExplicitlyDisabled("TRUE")).toBe(true);
});

test('REGRESSION (2026-09-05 audit finding): "false" and "0" must NOT disable dev TLS', () => {
  // vite.config.ts used to check `Boolean(process.env.TOVU_DISABLE_DEV_TLS)` — a bare truthy check
  // that treated ANY non-empty string as "disable", silently inverting an operator's explicit
  // TOVU_DISABLE_DEV_TLS=false "keep TLS on" intent.
  expect(isDevTlsExplicitlyDisabled("false")).toBe(false);
  expect(isDevTlsExplicitlyDisabled("0")).toBe(false);
});

test("isDevTlsExplicitlyDisabled: undefined (unset) does not disable", () => {
  expect(isDevTlsExplicitlyDisabled(undefined)).toBe(false);
});
