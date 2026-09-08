import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Closes the "correct primitive, unwired call site" gap for `pinServedSiteDirIntoEnv`
 * (2026-09-07 audit, claim #5 — see `serve.ts`'s own header on that function).
 *
 * `pinServedSiteDirIntoEnv` itself is fully proven by
 * `serve-site-dir-pin.unit.test.ts` (calls it directly, asserts the env mutation and every
 * downstream resolver that reads `TOVU_SITE_DIR`). What NONE of those tests prove is that
 * `runServeCommand` — the only production call site — actually calls it. Delete
 * `serve.ts`'s `pinServedSiteDirIntoEnv(target);` line and every one of those tests still passes,
 * because they invoke the primitive directly; the API/daemon `TOVU_SITE_DIR` split-brain the audit
 * fixed comes back silently.
 *
 * The only suite that exercises `runServeCommand` itself is the
 * `serve-command*.integration.test.ts` family, which is a real-process-spawn, real-port-bind
 * integration tier currently BANNED from running (it hangs indefinitely and orphans live `tovu
 * serve` children). So this gap has no other net right now.
 *
 * Why this is a source-text check, not a behavioral one: `runServeCommand` takes no injectable
 * deps or env (`RunServeCommandInput` is just `{ dir, port?, workspaceId?, emitBootToken? }`), and
 * `pinServedSiteDirIntoEnv(target)` is called with no env argument, so it always mutates the real
 * `process.env`. Every step around it in `runServeCommand` (`bootSiteDir`, `runBootLifecycle`,
 * `app.listen(port)`) does real filesystem/DB/network work ending in an actual bound TCP listener
 * — precisely the boot-and-bind sequence this dispatch prohibits exercising here. A behavioral test
 * of the real call site would have to be the banned integration suite; there is no lighter seam.
 * Reading `runServeCommand`'s own source for the literal call is the only way left to prove it is
 * still wired, and it genuinely fails the moment that call is deleted, commented out, or moved
 * outside the function.
 */

const SERVE_TS_PATH = path.resolve(import.meta.dirname, "../../commands/serve.ts");
const RUN_SERVE_COMMAND_SIGNATURE = "export async function runServeCommand(";
const PIN_CALL = "pinServedSiteDirIntoEnv(target)";

/**
 * `runServeCommand` is declared last in `serve.ts`, so everything from its signature to end of
 * file IS its body — no matching-brace parser needed, and no risk of accidentally reading into a
 * sibling function's body instead.
 */
function readRunServeCommandBody(source: string): string {
  const start = source.indexOf(RUN_SERVE_COMMAND_SIGNATURE);
  assert.notEqual(
    start,
    -1,
    `could not find "${RUN_SERVE_COMMAND_SIGNATURE}" in serve.ts -- has runServeCommand been renamed, ` +
      "moved, or had its export changed? Update RUN_SERVE_COMMAND_SIGNATURE above if so."
  );
  return source.slice(start);
}

test("runServeCommand's body actually CALLS pinServedSiteDirIntoEnv(target), not just imports/defines it", () => {
  const source = fs.readFileSync(SERVE_TS_PATH, "utf8");
  const body = readRunServeCommandBody(source);

  const callLine = body.split("\n").find((line) => line.includes(PIN_CALL));
  assert.ok(
    callLine,
    `runServeCommand no longer contains the literal call "${PIN_CALL}". Deleting or renaming that ` +
      "call site silently reintroduces the TOVU_SITE_DIR split-brain between this process and the " +
      "agent daemon it spawns (chat.db, the ops journal, skills/agent-plugin roots, and the chat-" +
      "attachment staging directory all diverge again) -- see serve.ts's own header on " +
      "pinServedSiteDirIntoEnv for the full incident. serve-site-dir-pin.unit.test.ts alone cannot " +
      "catch this: it calls the primitive directly and never goes through runServeCommand."
  );
  assert.doesNotMatch(
    callLine!.trim(),
    /^\/\//,
    `found "${PIN_CALL}" in runServeCommand's body, but the line is commented out -- it must ` +
      "actually execute, not merely be present as text."
  );
});

test("sanity: the exact call-site text is not also the primitive's own declaration line (a regex that matched both would prove nothing)", () => {
  const source = fs.readFileSync(SERVE_TS_PATH, "utf8");
  const occurrences = source.split(PIN_CALL).length - 1;
  assert.equal(
    occurrences,
    1,
    `expected "${PIN_CALL}" to appear exactly once in serve.ts (the call site); found ${occurrences}. ` +
      "The primitive's own declaration is `export function pinServedSiteDirIntoEnv(target: string, ...)` " +
      "-- note the `: string` after `target`, which is why it does not also match this literal string."
  );
});
