import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file 2026-09-09 integrations-root-key fix — `runProductionReadinessGateOrExit`'s own env-var
 * wiring (`boot-readiness-gate.ts`). No prior test file covered this function at all: it reads real
 * `process.env` and calls `process.exit(1)` on failure, so a genuine end-to-end behavioral test
 * needs a subprocess (as this file's own header describes for a *different*, manually-run
 * verification) — out of proportion for pinning one wiring line. A source-level assertion, same
 * technique `production-readiness-boot.integration.test.ts`'s AC-23/24 test and its own
 * `newsletterKeyring` regression test already use, is the proportionate check here: it proves the
 * new `EnvSnapshot` field is actually wired to the right env var, not just declared on the type.
 */

const SOURCE = fs.readFileSync(path.join(import.meta.dirname, "..", "boot-readiness-gate.ts"), "utf8");

test("2026-09-09 fix: hasMissingIntegrationsRootKey reads !process.env.TOVU_INTEGRATIONS_ROOT_KEY, not some other var or a hardcoded value", () => {
  assert.match(
    SOURCE,
    /hasMissingIntegrationsRootKey:\s*!process\.env\.TOVU_INTEGRATIONS_ROOT_KEY,/,
    "the boot gate's envSnapshot must compute this field from the real env var — a stale or hardcoded value here would silently disable the boot-time check"
  );
});
