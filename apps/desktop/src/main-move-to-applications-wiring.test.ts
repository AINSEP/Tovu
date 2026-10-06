/**
 * @file Wiring guard for the "Move to Applications" prompt in `../main.ts`. Source text, for the
 * reason `main-mcp-announce-wiring.test.ts` gives: `main.ts` requires `"electron"` at module scope.
 * The rules are covered behaviourally in `move-to-applications.test.ts`; this file catches only that
 * `main.ts` actually runs the prompt, early enough, with Electron's real move and a conflict handler.
 * Owner 2026-10-06: DMG window already shows drag-to-Applications; prompt redundant.
 * Restore: uncomment the imports, helper and call in `main.ts`, then change `test.skip` to `test` below.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Same comment stripping as `main-node-toolchain-wiring.test.ts`. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const source = withoutComments(fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8"));

test.skip("the prompt runs inside whenReady, before the auto-updater starts", () => {
  const ready = source.indexOf(".whenReady()");
  const offer = source.indexOf("await offerMoveToApplications()", ready);
  const updater = source.indexOf("startAutoUpdater()", ready);
  assert.ok(ready !== -1 && offer !== -1 && updater !== -1, "expected whenReady, the prompt call and the updater start");
  assert.ok(offer < updater, "the prompt must run before the updater writes this copy's presence record");
});

test.skip("the prompt call is guarded so a failure never breaks the boot", () => {
  assert.match(source, /await offerMoveToApplications\(\)\.catch\(/);
});

test.skip("Electron's own move is called with the policy's conflict handler", () => {
  assert.match(source, /move: \(conflictHandler\) => app\.moveToApplicationsFolder\(\{ conflictHandler \}\)/);
});

test.skip("the skip check is fed this copy's real launch facts, including the other open copies", () => {
  const call = source.slice(source.indexOf("movePromptSkipReason({"));
  const own = call.slice(0, call.indexOf("});"));
  for (const field of [/isPackaged: app\.isPackaged/, /isMas: process\.mas === true/, /selftest: SELFTEST/, /unattended: isUnattendedSiteLaunch\(\)/, /app\.isInApplicationsFolder\(\)/, /createInstancePresence\(\{ directory: presenceDirPath\(userDataDir\) \}\)\.readLive\(\)\.filter\(\(record\) => record\.pid !== process\.pid\)/]) {
    assert.match(own, field);
  }
});
