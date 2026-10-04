import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fingerprintRootKeyHex } from "../../keyring.env.js";
import { setTimeout as delay } from "node:timers/promises";
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
    const deadline = setTimeout(() => { stderr += "child timed out"; child.kill("SIGKILL"); }, 30_000);
    child.on("error", (error) => { clearTimeout(deadline); resolve({ code: null, stderr: error.message }); });
    child.on("close", (code) => { clearTimeout(deadline); resolve({ code, stderr }); });
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

    const release = path.join(home, "release");
    const children = [
      runChild([home, siteDir, siteKeyId, outputA, release]),
      runChild([home, siteDir, siteKeyId, outputB, release]),
    ];
    let outcomes: ChildOutcome[];
    try {
      const deadline = Date.now() + 20_000;
      while (!existsSync(`${outputA}.ready`) || !existsSync(`${outputB}.ready`)) {
        assert.ok(Date.now() < deadline, "both children must observe absence and reach the barrier");
        await delay(10);
      }
      assert.equal(existsSync(path.join(home, ".tovu/site-keys", `${siteKeyId}.hex`)), false,
        "neither process may publish before both are ready");
    } finally {
      writeFileSync(release, "go");
      outcomes = await Promise.all(children);
    }
    const [outcomeA, outcomeB] = outcomes;

    assert.equal(outcomeA.code, 0, `child A must exit 0 — stderr: ${outcomeA.stderr}`);
    assert.equal(outcomeB.code, 0, `child B must exit 0 — stderr: ${outcomeB.stderr}`);

    const resultA = JSON.parse(readFileSync(outputA, "utf8")) as SiteKeyEnsureOutcome;
    const resultB = JSON.parse(readFileSync(outputB, "utf8")) as SiteKeyEnsureOutcome;

    // Both crossed the absence check before release, so both must take the mint path.
    assert.equal(resultA.action, "mint");
    assert.equal(resultB.action, "mint");
    assert.equal(resultA.fingerprint, resultB.fingerprint, "both processes must converge on the SAME key");
    assert.ok(resultA.fingerprint, "a fingerprint must be present");

    const siteKeysDir = path.join(home, ".tovu", "site-keys");
    const finalHex = readFileSync(path.join(siteKeysDir, `${siteKeyId}.hex`), "utf8").trim();
    assert.match(finalHex, /^[0-9a-f]{64}$/);
    assert.equal(resultA.fingerprint, fingerprintRootKeyHex(finalHex), "both results must name the key actually on disk");
    assert.equal(resultB.fingerprint, fingerprintRootKeyHex(finalHex));
    const entries = readdirSync(siteKeysDir);
    assert.deepEqual(entries, [`${siteKeyId}.hex`], "exactly one file must exist — no leftover temp files, no duplicate");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(siteDir, { recursive: true, force: true });
    rmSync(path.dirname(outputA), { recursive: true, force: true });
    rmSync(path.dirname(outputB), { recursive: true, force: true });
  }
});
