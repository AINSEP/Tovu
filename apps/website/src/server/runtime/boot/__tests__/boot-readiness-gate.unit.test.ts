import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file 2026-09-09 integrations-root-key fix, then durability fix (same day, second pass) —
 * `runProductionReadinessGateOrExit`'s own env-var wiring (`boot-readiness-gate.ts`). No prior test
 * file covered this function at all: it reads real `process.env` and calls `process.exit(1)` on
 * failure, so a genuine end-to-end behavioral test needs a subprocess (as this file's own header
 * describes for a *different*, manually-run verification) — out of proportion for pinning one
 * wiring line. A source-level assertion, same technique
 * `production-readiness-boot.integration.test.ts`'s AC-23/24 test and its own `newsletterKeyring`
 * regression test already use, is the proportionate check here.
 *
 * SUPERSEDED (second pass, same day): the first version of this test pinned
 * `hasMissingIntegrationsRootKey: !process.env.TOVU_INTEGRATIONS_ROOT_KEY` — env-var-only. That
 * made a valid, already-generated key file invisible to this gate, which was the exact
 * chicken-and-egg the admin Site Token tab's Generate action would otherwise hit (boot refuses
 * before the admin UI that could "fix" it in-app is ever reachable). The field now reads
 * `!inspectRootKeyMaterial().active` — the SAME env-first/file-second check `EnvOrFileKeyring`'s
 * own `resolveRootKey()` uses — so a valid key file at the (now durable, in production)
 * `defaultRootKeyFilePath()` also satisfies this gate. This test asserts the NEW wiring; the old
 * assertion is deliberately gone, not left alongside as a second, contradictory check.
 */

const SOURCE = fs.readFileSync(path.join(import.meta.dirname, "..", "boot-readiness-gate.ts"), "utf8");

test("2026-09-09 durability fix: hasMissingIntegrationsRootKey reads !inspectRootKeyMaterial().active, not the env var alone", () => {
  assert.match(
    SOURCE,
    /hasMissingIntegrationsRootKey:\s*!inspectRootKeyMaterial\(\)\.active,/,
    "the boot gate's envSnapshot must accept a valid key file too (via inspectRootKeyMaterial), not only the raw env var — otherwise a generated file is invisible to this gate and boot refuses even when one exists"
  );
});

test("2026-09-09 durability fix: boot-readiness-gate.ts imports inspectRootKeyMaterial from the real keyring module, not a local reimplementation", () => {
  assert.match(
    SOURCE,
    /import\s*\{\s*inspectRootKeyMaterial\s*\}\s*from\s*"#src\/features\/webhooks\/keyring\.env"/,
    "must reuse the SAME env-first/file-second precedence EnvOrFileKeyring itself uses, not a second, driftable implementation of that check"
  );
});
