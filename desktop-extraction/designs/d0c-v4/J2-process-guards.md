# J2 (Jini): process error guards in `@jini-ai/diagnostics/observability/node` (one repo: Jini; Codex-ready)

Why: the desktop main installs `installProcessErrorReporting` and `installUnhandledRejectionGuard` from the website (`apps/desktop/src/main/updates/product-telemetry-boot.ts:9`). Both are generic Node process wiring; the only product wording in that Tovu file is `reportFatalBootFailure`, which stays in Tovu (T2). Their dependencies are already diagnostics' own (`redactedError`, `Tracker`) plus `createConsoleLogger` from `@jini-ai/core/primitives`. This sheet carries the source it copies (below), so the executor reads no Tovu checkout.
Jini for verification: this sheet's commit. Named packages: `diagnostics`.

## Files to change (one commit: `feat(diagnostics): installProcessErrorReporting and installUnhandledRejectionGuard (node)`)
NEW `packages/diagnostics/src/observability/process-guards.ts`, exactly:
```ts
/**
 * @file Process-level error wiring for a long-lived Node host.
 *
 * An unhandled promise rejection ends a Node process when no `unhandledRejection` listener is
 * registered. In a server that answers many callers, one request's missing `catch` would then end
 * every other caller's work too, so the rejection guard logs and keeps the process up: the failed
 * request is the only casualty. A synchronous `uncaughtException` is different: resuming after it
 * is unsafe, so reporting keeps it fatal and, when the host supplies a flush port, drains telemetry
 * within a bounded deadline before exiting. Without a flush port it only observes
 * (`uncaughtExceptionMonitor`), leaving Node's own fatal behaviour intact.
 */
import { createConsoleLogger } from '@jini-ai/core/primitives';
import type { Tracker } from './tracker-types.js';
import { redactedError } from './report-error.js';

const consoleLogger = createConsoleLogger({ prefix: '' });

export interface InstallUnhandledRejectionGuardOptions {
  /** Test seam: defaults to the console error logger. Every rejection is logged; a caught rejection
   *  must still read as a bug in the process log, never a silent drop. */
  readonly log?: (message: string, reason: unknown) => void;
}

/**
 * Registers a process-wide `unhandledRejection` listener that logs and keeps the process running.
 * Node terminates on an unhandled rejection only when no listener exists, so registering one is the
 * whole fix. Repeated calls add independent listeners; Node invokes each, and a duplicate log line
 * is harmless, so no once-only guard is needed.
 * @returns A disposer that removes exactly this call's listener. A host usually keeps the guard for
 *   the process lifetime; tests dispose it so listeners do not leak across cases.
 * @complexity O(1): one listener registration.
 */
export function installUnhandledRejectionGuard(_required: Record<string, never> = {}, options: InstallUnhandledRejectionGuardOptions = {}): () => void {
  <body = Tovu lines 76-85 below, verbatim>
}

/**
 * Forwards process-level failures to an observability tracker: an unhandled rejection (still logged
 * and survived by {@link installUnhandledRejectionGuard}) and an uncaught exception (report, drain,
 * exit). Install it beside the rejection guard once the tracker exists: a rejection listener on its
 * own would also suppress Node's default crash. A fatal exception never resumes service; the
 * deadline forces exit even when a provider hangs.
 * @param required The tracker and the process role, sent as the `process` attribute.
 * @param optional Event source and optional fatal flush; without flush the monitor only reports.
 * @returns A disposer removing exactly these two listeners.
 * @complexity O(1) to install; O(n) per report in the error's text length.
 */
export function installProcessErrorReporting(
  required: { tracker: Tracker; processRole: string },
  optional: <the optional type, Tovu lines 103-104, verbatim> = {},
): () => void {
  <body = Tovu lines 106-141 below, verbatim, inline comments included>
}
```
Source to copy (Tovu `2d82735a6:apps/website/src/server/runtime/boot/process-error-guards.ts`; only the lines named above are used; `processRole`'s union becomes `string` because it is only written to an attribute):
```ts
76  const log =
77    options.log ??
78    ((message: string, reason: unknown) => {
79      consoleLogger.error({ message }, { error: reason });
80    });
81  const handler = (reason: unknown): void => {
82    log("[unhandledRejection] an async operation rejected with no catch anywhere in its chain — logged, not fatal:", reason);
83  };
84  process.on("unhandledRejection", handler);
85  return () => process.off("unhandledRejection", handler);
103  optional: { target?: Pick<NodeJS.EventEmitter, "on" | "off">; flush?: () => Promise<void>;
104    exit?: (code: number) => void; timeoutMs?: number; log?: (message: string, error: Error) => void } = {},
106  const { tracker, processRole } = required;
107  const target = optional.target ?? process;
108  const exit = optional.exit ?? ((code: number) => process.exit(code));
109  let crashing = false;
110  const onRejection = (reason: unknown): void => {
111    tracker.error({ error: reason instanceof Error ? reason : redactedError({ error: reason }) }, { context: { operation: "process.unhandled_rejection", attributes: { process: processRole } } });
112  };
113  const onUncaught = (error: unknown): void => {
114    if (crashing) return;
115    crashing = true;
116    let exited = false;
117    const finish = (): void => {
118      if (exited) return;
119      exited = true;
120      clearTimeout(deadline);
121      exit(1);
122    };
123    const deadline = setTimeout(finish, Math.min(optional.timeoutMs ?? 2_000, 2_000));
124    try {
125      (optional.log ?? ((_message, failure) => console.error(failure)))("[uncaughtException] fatal; exiting after telemetry flush:", error instanceof Error ? error : redactedError({ error }));
126    } catch { /* A broken stderr must not skip the report, fatal drain and exit. */ }
127    try {
128      tracker.error({ error: error instanceof Error ? error : redactedError({ error }) }, { context: { operation: "process.uncaught_exception", attributes: { process: processRole } } });
129    } catch { /* A broken diagnostic sink must not skip the fatal drain and exit. */ } finally {
130      // Fatal shutdown still exits if the already-reported crash prevents telemetry flushing.
131      void Promise.resolve().then(() => optional.flush?.()).catch(() => {}).finally(finish);
132    }
133  };
134  const onMonitor = (error: unknown): void => {
135    tracker.error({ error: error instanceof Error ? error : redactedError({ error }) }, { context: { operation: "process.uncaught_exception", attributes: { process: processRole } } });
136  };
137  const fatalEvent = optional.flush ? 'uncaughtException' : 'uncaughtExceptionMonitor';
138  const fatalHandler = optional.flush ? onUncaught : onMonitor;
139  target.on("unhandledRejection", onRejection);
140  target.on(fatalEvent, fatalHandler);
141  return () => { target.off("unhandledRejection", onRejection); target.off(fatalEvent, fatalHandler); };
```
(Strings keep their double quotes or are converted to the Jini file's single quotes; no other change. The `Tracker` import path is `./tracker-types.js`; if that file does not export `Tracker`, use the path `observability/index.ts` re-exports it from: STOP if none.)
- `packages/diagnostics/src/observability/node.ts`: add after the `report-error.js` re-export line (`:18`) the line `export { installProcessErrorReporting, installUnhandledRejectionGuard, type InstallUnhandledRejectionGuardOptions } from './process-guards.js';` (the entry already re-exports its sibling modules this way).
- `scripts/error-gate-debt.json`: add `{ "file": "packages/diagnostics/src/observability/process-guards.ts", "rule": "catch-reads-error", "value": 3 }` in path order (the three catches at Tovu `:126`, `:129`, `:131` move unchanged; Tovu's row for them is deleted in T2). If the verifier's `pnpm check:errors` reports another count for this file, the verifier sets the row to the reported count (never above 3).
- `api-baseline/jini-ai__diagnostics.json` (regenerated by the verifier, COMMON 1); NEW `.changeset/diagnostics-process-guards.md`: `"@jini-ai/diagnostics": minor` / "Add `installUnhandledRejectionGuard` and `installProcessErrorReporting` to `@jini-ai/diagnostics/observability/node`."

## Characterization tests to add
NEW `packages/diagnostics/src/observability/__tests__/process-guards.test.ts` (vitest; an `EventEmitter` as `target`, fake `exit`/`flush`/`log`, `vi.useFakeTimers()` for the deadline):
1. rejection guard: one call adds one `unhandledRejection` listener on `process`, and its log port receives the fixed message and the reason; the disposer removes only it (install twice, dispose the first: one listener of the two remains; dispose it again: no change).
2. reporting without `flush`: listens on `unhandledRejection` and `uncaughtExceptionMonitor` (not `uncaughtException`); a rejection reaches `tracker.error` with operation `process.unhandled_rejection` and attribute `process: <role>`; a non-Error reason is redacted (`redactedError`).
3. reporting with `flush`: an uncaught exception logs, reports `process.uncaught_exception`, awaits flush, then calls `exit(1)` once; a second exception while crashing reports nothing more.
4. bounded drain: `flush` never settles and `timeoutMs: 10_000` -> `exit(1)` after 2 000 ms (fake timers), not later.
5. a throwing `log` and a throwing `tracker.error` still reach `exit(1)`.
6. disposer of the reporting install removes exactly its two listeners.
Red checks: (1) disposer uses `process.removeAllListeners("unhandledRejection")` -> case 1 fails; (2) delete `if (crashing) return;` -> case 3 fails; (3) `Math.min(..., 2_000)` -> `Math.min(..., 5_000)` -> case 4 fails.

## STOP conditions
- `rg -n "installUnhandledRejectionGuard|installProcessErrorReporting" packages` prints any hit before the edit.
- `node.ts` does not have exactly 24 lines, or its `:18` is not the `report-error.js` re-export line.
- The new file would exceed 150 lines (the copy is ~95).
