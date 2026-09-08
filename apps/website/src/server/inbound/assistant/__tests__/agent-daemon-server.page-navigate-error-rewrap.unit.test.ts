import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

/**
 * @file Proves `agent-daemon-server.ts` actually applies `withPageNavigateErrorRewrap` to
 * `frontendControl.toolRegistrations` before registering them — the wiring half of the
 * misleading-`page.navigate`-error fix (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §4). A
 * correct, well-tested `rewrapPageNavigateError`/`withPageNavigateErrorRewrap` pair
 * (`rewrap-page-navigate-error.test.ts`) is worthless if the real registration loop never calls it —
 * this repo's own dominant defect shape (a correct primitive, an unwired call site).
 *
 * Read `agent-daemon-server.ts`'s SOURCE rather than importing it, same reason
 * `agent-daemon-server.attachment-kind-filter.unit.test.ts` and
 * `agent-daemon-server.session-resume-wiring.unit.test.ts` (both next to this file) give: that
 * module is a flat top-level script that opens a real SQLite connection and binds a real port as a
 * side effect of being loaded.
 */

const DAEMON_ENTRY_SOURCE = fs.readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

test("imports withPageNavigateErrorRewrap from the Tovu-side rewrap module", () => {
  assert.match(
    DAEMON_ENTRY_SOURCE,
    /import\s*\{\s*withPageNavigateErrorRewrap\s*\}\s*from\s*["']#src\/assistant\/rewrap-page-navigate-error["']/,
    "expected a top-level import of withPageNavigateErrorRewrap from #src/assistant/rewrap-page-navigate-error",
  );
});

describe("the toolRegistrations registration loop", () => {
  /**
   * Scopes the assertion to the specific `for` loop that registers
   * `frontendControl.toolRegistrations` — this file has TWO `for (const registration of ...)` loops
   * (the other iterates a differently-named `assistantRegistrations` array entirely), so anchoring
   * on the generic prefix alone would silently scope onto the wrong one.
   */
  const registrationLoopSource = (() => {
    const startIndex = DAEMON_ENTRY_SOURCE.indexOf("for (const registration of withPageNavigateErrorRewrap(");
    assert.ok(
      startIndex > -1,
      "this test's own anchor (the frontendControl.toolRegistrations loop's `for` statement, wrapped in " +
        "withPageNavigateErrorRewrap) must still exist verbatim",
    );
    const endIndex = DAEMON_ENTRY_SOURCE.indexOf("\n}", startIndex);
    assert.ok(endIndex > -1, "this test's own anchor (the loop's closing brace) must still exist verbatim");
    return DAEMON_ENTRY_SOURCE.slice(startIndex, endIndex);
  })();

  test("the loop iterates withPageNavigateErrorRewrap(frontendControl.toolRegistrations), not the bare array", () => {
    assert.match(
      registrationLoopSource,
      /for \(const registration of withPageNavigateErrorRewrap\(frontendControl\.toolRegistrations\)\)/,
      "the registration loop must wrap frontendControl.toolRegistrations in withPageNavigateErrorRewrap(...) " +
        "before iterating — registering the bare array again would silently drop the page.navigate error rewrap",
    );
  });

  test("every registration is still handed to registry.register — the rewrap must not replace registration itself", () => {
    assert.match(registrationLoopSource, /registry\.register\(registration\)/);
  });
});
