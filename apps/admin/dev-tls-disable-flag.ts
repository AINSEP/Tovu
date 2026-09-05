/**
 * @file `TOVU_DISABLE_DEV_TLS` gate parser for `vite.config.ts` — split out into its own
 * zero-dependency leaf module purely so it can be unit-tested without importing `vite.config.ts`
 * itself. `vite.config.ts` imports the `vite` package and calls `defineConfig`, so importing it from
 * inside THIS repo's own vitest (itself Vite-powered) test run recursively re-invokes Vite's own
 * esbuild transform pipeline — reproducibly crashed with `Invariant violation: "new
 * TextEncoder().encode("") instanceof Uint8Array" is incorrectly false` (two esbuild service
 * instances colliding), on this exact machine, twice, while an ordinary admin test passed fine under
 * the same `vitest run` invocation. A plain function with no imports at all sidesteps that recursion
 * entirely.
 *
 * Same parse as `apps/website/src/server/runtime/boot/dev-tls.ts`'s (unexported)
 * `isDevTlsExplicitlyDisabled` and `development/scripts/dev.mjs`'s own copy: trim + lowercase,
 * `"1"`/`"true"` only — NOT a bare truthy check on the raw string, which treated ANY non-empty value,
 * including the literal `"false"` or `"0"`, as "disable", silently inverting an operator who
 * explicitly set `TOVU_DISABLE_DEV_TLS=false` meaning "do not disable TLS" (2026-09-05 audit
 * finding). Three copies rather than one shared module across all three sites: `development/scripts/
 * dev.mjs` runs via bare `node` with no TypeScript transform, so it cannot import a `.ts` module at
 * all; this repo's `tsc` has `allowJs` off, so a `.ts` file here cannot cleanly import back from a
 * plain `.mjs` either. If you change this parse, change the other two copies too.
 */
export function isDevTlsExplicitlyDisabled(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}
