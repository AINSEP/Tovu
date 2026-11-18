# J2 (Jini): process error guards move into `@jini-ai/diagnostics/observability/node` (~60k, T)

Why: the desktop main installs `installProcessErrorReporting` and `installUnhandledRejectionGuard` from the website (`apps/desktop/src/main/updates/product-telemetry-boot.ts:9`). Both are generic Node process wiring: they name no product (the only product wording in that file is `reportFatalBootFailure`'s "Tovu failed to start", Tovu `process-error-guards.ts:160`, which stays in Tovu). Their dependencies are already diagnostics' own: `redactedError` (`observability/report-error.ts`), `Tracker` (`observability/tracker-types.ts`), and `createConsoleLogger` from `@jini-ai/core/primitives`.

## Census (step 0)
```bash
git -C ../Tovu show 2d82735a:apps/website/src/server/runtime/boot/process-error-guards.ts | sed -n '50,145p'
rg -n "installUnhandledRejectionGuard|installProcessErrorReporting" packages        # expected: no hit
rg -n "^export" packages/diagnostics/src/observability/node.ts                       # expected: 6 export lines, 24-line file
```

## One commit: `feat(diagnostics): installProcessErrorReporting and installUnhandledRejectionGuard (node)`
Files:
- NEW `packages/diagnostics/src/observability/process-guards.ts`: the two functions and `InstallUnhandledRejectionGuardOptions`, copied from Tovu 2d82735a `process-error-guards.ts` (the option interface and both function bodies with their TSDoc), with exactly these changes: (1) `processRole: "server" | "daemon" | "desktop-main"` becomes `processRole: string` (it is only written to the `process` attribute); (2) `installUnhandledRejectionGuard(options = {})` becomes `installUnhandledRejectionGuard(_required: Record<string, never> = {}, options: InstallUnhandledRejectionGuardOptions = {})` (owner args rule; the defaulted first argument keeps every existing `installUnhandledRejectionGuard()` call valid, including the text a Tovu source-anchor test looks for); (3) the file header is a NEUTRAL why: a process-wide `unhandledRejection` listener keeps one request's bug from ending a multi-request server; `uncaughtException` stays fatal with a bounded telemetry drain when a flush port is given, otherwise a monitor leaves Node's listeners intact. No product names, incident dates or Tovu file names (guard R5); the Tovu incident history stays in Tovu's file (T2).
- `packages/diagnostics/src/observability/node.ts`: one line `export { installProcessErrorReporting, installUnhandledRejectionGuard, type InstallUnhandledRejectionGuardOptions } from './process-guards.js';` (the entry already re-exports its sibling modules this way, `:17-20`; this is the package entry, not a forwarding shell for a moved path).
- NEW `packages/diagnostics/src/observability/__tests__/process-guards.test.ts` (vitest): the cases of Tovu `server/runtime/boot/__tests__/process-error-reporting.unit.test.ts` (same test names, assertions re-expressed in vitest `expect`, an `EventEmitter` as `target`, fake `exit`/`flush`), plus the independence characterization from reverted `e17f1a7d` (two guard installs add two listeners; disposing the first leaves one; disposing it twice removes nothing more).
- `api-baseline/jini-ai__diagnostics.json` via `pnpm api:update` (+ changeset if asked).
- If `pnpm check:errors` reports the two `catch { /* ... */ }` blocks of `installProcessErrorReporting` as new findings: add one debt row for the new file with the reported count and the reason "moved from Tovu process-error-guards.ts (Tovu error-gate-debt row catch-reads-error), not new" (T2 shrinks the Tovu row by the same count). Do not rewrite the catches.

Mutation proofs: (1) disposer uses `removeAllListeners` -> the independence test fails; (2) drop the `crashing` guard -> the "second uncaught exception does not double-report" case fails (if Tovu's test file has no such case, use: deadline `Math.min(..., 2_000)` -> `5_000` and the bounded-drain case fails). Restore each.

Gate: COMMON G (Jini), `PKGS="diagnostics"`.
