/**
 * SPEC-022 REQ-12 — capability-inventory staleness check (report-only; no CI pipeline exists
 * in this repo yet to wire this into as a blocking step, per implementation-outline.md's
 * "Scope Adjustment Disclosed" — a runnable local script that produces the same report REQ-12
 * specifies, for whoever stands up CI later to wire in as-is).
 *
 * Flags a `deps.ts`/`app.ts` route/worker with no matching capability-inventory entry
 * (CAPABILITY_INVENTORY_STALE, errors.spec.md). This is the SAME check
 * `production-readiness-boot.integration.test.ts`'s AC-23/24 test runs, exposed here as a
 * standalone, non-test-runner-dependent script (`npm run check:inventory`).
 *
 * Usage: npx tsx development/scripts/check-capability-inventory.ts
 */
import fs from "node:fs";
import path from "node:path";

import { CAPABILITY_INVENTORY } from "../../apps/website/src/server/runtime/configuration/capability-inventory.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "..", "..", "apps", "website", "src", "server", "runtime", "composition");
const DEPS_SOURCE = fs.readFileSync(path.join(SERVER_DIR, "deps.ts"), "utf8");
const APP_SOURCE = fs.readFileSync(path.join(SERVER_DIR, "app.ts"), "utf8");

function main(): void {
  const stale: { name: string; file: string }[] = [];

  for (const capability of CAPABILITY_INVENTORY) {
    const mentioned =
      DEPS_SOURCE.includes(capability.name) ||
      APP_SOURCE.includes(capability.name) ||
      (capability.sourceHints ?? []).some((hint) => DEPS_SOURCE.includes(hint) || APP_SOURCE.includes(hint));

    if (!mentioned) {
      stale.push({ name: capability.name, file: "deps.ts|app.ts" });
    }
  }

  if (stale.length === 0) {
    console.log(`check:inventory — OK: all ${CAPABILITY_INVENTORY.length} capability-inventory entries correspond to real deps.ts/app.ts source.`);
    return;
  }

  console.warn(`check:inventory — ${stale.length} CAPABILITY_INVENTORY_STALE finding(s):`);
  for (const entry of stale) {
    console.warn(`  - "${entry.name}": no matching reference found in ${entry.file} (or its sourceHints)`);
  }
  // Report-only per REQ-12's Phase-0 scope (no CI exists yet to make this blocking) — exit 0
  // deliberately, same posture as check:boundaries.
}

main();
