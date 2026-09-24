import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * @file Site-key plan §A.2 — the cross-process race requirement: "a race test with 2 child
 * processes on the same temp HOME and siteKeyId: exactly 1 file, same fingerprint in both." Two
 * SEPARATE OS processes, not two async calls in one, both call `ensureSiteKey` for the SAME
 * `siteKeyId` under the SAME temp `home` with nothing configured yet — the exact "many instances,
 * no single-instance lock" scenario A.2 describes (a Dock launch racing a terminal launch of the
 * same site). Spawns real `tsx`-run children, same pattern as
 * `agent-plugins/__tests__/integration/activation-cross-process-writes.integration.test.ts`.
 */

const CHILD_FIXTURE = fileURLToPath(new URL("../fixtures/site-key-ensure-child.ts", import.meta.url));

interface ChildOutcome {
  readonly code: number | null;
  readonly stderr: string;
}

function runChild(args: readonly string[]): Promise<ChildOutcome> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", CHILD_FIXTURE, ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve({ code, stderr }));
  });
}

interface SiteKeyEnsureOutcome {
  readonly action: string;
  readonly fingerprint?: string;
}

test("2 concurrent processes minting the same siteKeyId under the same home converge on exactly 1 file, same fingerprint in both", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "tovu-site-key-race-home-"));
  // The realistic scenario (A.2): two LAUNCHES OF THE SAME SITE (a Dock launch racing a terminal
  // launch) — one shared siteDir/content.db, not two different sites that happen to share an id.
  const siteDir = mkdtempSync(path.join(tmpdir(), "tovu-site-key-race-site-"));
  const outputA = path.join(mkdtempSync(path.join(tmpdir(), "tovu-site-key-race-out-")), "a.json");
  const outputB = path.join(mkdtempSync(path.join(tmpdir(), "tovu-site-key-race-out-")), "b.json");

  try {
    const siteKeyId = "race-site";

    const [outcomeA, outcomeB] = await Promise.all([
      runChild([home, siteDir, siteKeyId, outputA]),
      runChild([home, siteDir, siteKeyId, outputB]),
    ]);

    assert.equal(outcomeA.code, 0, `child A must exit 0 — stderr: ${outcomeA.stderr}`);
    assert.equal(outcomeB.code, 0, `child B must exit 0 — stderr: ${outcomeB.stderr}`);

    const resultA = JSON.parse(readFileSync(outputA, "utf8")) as SiteKeyEnsureOutcome;
    const resultB = JSON.parse(readFileSync(outputB, "utf8")) as SiteKeyEnsureOutcome;

    // Both processes started with nothing configured. Exactly one WRITES ("mint", the first to
    // link its temp file onto the final path); the other either loses the link race and reads the
    // winner's bytes back as "mint" too (both temp files existed at once), or — if its own read of
    // the (by-then-already-valid) per-site file happens after the winner's write fully landed —
    // sees a valid file already there and reports "noop" without writing anything itself. Either
    // way both must report the SAME fingerprint (§A.2: "both read back the final file and use its
    // bytes, never their own in-memory candidate").
    assert.ok(["mint", "noop"].includes(resultA.action), `unexpected action from A: ${resultA.action}`);
    assert.ok(["mint", "noop"].includes(resultB.action), `unexpected action from B: ${resultB.action}`);
    assert.equal(resultA.fingerprint, resultB.fingerprint, "both processes must converge on the SAME key");
    assert.ok(resultA.fingerprint, "a fingerprint must be present");

    const siteKeysDir = path.join(home, ".tovu", "site-keys");
    const entries = readdirSync(siteKeysDir);
    assert.deepEqual(entries, [`${siteKeyId}.hex`], "exactly one file must exist — no leftover temp files, no duplicate");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(siteDir, { recursive: true, force: true });
    rmSync(path.dirname(outputA), { recursive: true, force: true });
    rmSync(path.dirname(outputB), { recursive: true, force: true });
  }
});
