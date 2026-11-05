/**
 * @file One teardown hook per test context, shared by every helper that owns a resource.
 *
 * Why: node:test stops running a context's `after` hooks at the first one that throws (runHook
 * rethrows inside its loop), so a failed rmSync or db close in one helper skipped a later helper's
 * server close and the whole file hung (open-bugs 10-31). Helpers queue steps here instead of
 * calling `t.after` directly: every step runs, last-registered first (dependency order), and the
 * failures are rethrown together once all of them have been tried.
 */

export { onTeardown, runTeardownSteps } from "@jini-ai/core";
