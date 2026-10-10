// Test-only fixture for `worker-sandbox.test.ts`. Exits immediately with a nonzero code WITHOUT
// ever posting a `parentPort` message or throwing, so it exercises `renderInWorkerSandbox`'s
// `worker.once("exit", ...)` branch specifically. Neither real worker (`liquid-worker.ts`,
// `handlebars-worker.ts`) can trigger that branch on its own: both route every failure through a
// try/catch into a `postMessage({ ok: false, ... })` reply, and Node fires `error` before `exit` for
// any uncaught exception — verified empirically 2026-08-20 (see `worker-sandbox.test.ts`'s header
// comment). This fixture is the only way to reach the exit-code path deterministically.
process.exit(7);
