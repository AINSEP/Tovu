import { installUnhandledRejectionGuard } from "../../process-error-guards";

/**
 * @file Standalone child-process fixture for `process-error-guards.unit.test.ts` — deliberately NOT
 * run in-process under `node --test`. Node's own test runner installs its own `unhandledRejection`
 * tracking to catch async work escaping a test, and that tracking intercepts (and auto-fails the
 * test on) a genuinely unhandled rejection regardless of any OTHER listener also handling it —
 * confirmed directly: firing a real unhandled rejection inside a `node:test` test body fails that
 * test with the rejection's own message, even when this exact guard's handler also ran and logged
 * it correctly. That makes the parent test harness itself an unsuitable place to prove "the PROCESS
 * survives" — the only way to observe Node's real, unmodified default behavior (terminate on no
 * listener) is a separate process the test harness has no hook into.
 *
 * Run with `--with-guard` to install {@link installUnhandledRejectionGuard} before rejecting, or
 * `--without-guard` to reject with nothing installed at all — the negative control proving this
 * fixture really would otherwise crash (Node's default `--unhandled-rejections=throw`: terminate
 * with a non-zero exit code before any deferred work runs), not just asserting a status code that
 * could pass for an unrelated reason.
 */
const mode = process.argv[2];
if (mode !== "--with-guard" && mode !== "--without-guard") {
  throw new Error(`usage: unhandled-rejection-child.ts --with-guard|--without-guard (got ${String(mode)})`);
}

if (mode === "--with-guard") {
  installUnhandledRejectionGuard();
}

// The exact shape Express 4 produces from an async route handler that throws with no surrounding
// try/catch: a promise rejects and nothing ever awaits or `.catch()`s it.
Promise.reject(new Error("simulated: no root key"));

// If the process is still alive after Node would have delivered the unhandledRejection event, this
// fires and prints proof of survival. Under `--without-guard`, Node's default behavior ends the
// process before this timer ever gets a chance to run.
setTimeout(() => {
  // eslint-disable-next-line no-console
  console.log("STILL_ALIVE");
  process.exit(0);
}, 50);
