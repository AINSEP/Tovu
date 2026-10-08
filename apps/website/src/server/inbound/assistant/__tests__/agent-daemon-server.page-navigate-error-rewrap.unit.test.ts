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
      /for \(const registration of withPageNavigateErrorRewrap\(withReadOnlyFrontendCapabilities\(frontendControl\.toolRegistrations\)\)\)/,
      "the registration loop must wrap frontendControl.toolRegistrations in withPageNavigateErrorRewrap(...) " +
        "before iterating — registering the bare array again would silently drop the page.navigate error rewrap",
    );
  });

  // The read-only gateway refused page.find_elements and admin.capture_screenshot until this
  // wrapper marked them; a correct wrapper the loop never calls would leave that refusal in place.
  test("the loop marks the read-only frontend capabilities before registering", () => {
    assert.match(registrationLoopSource, /withReadOnlyFrontendCapabilities\(frontendControl\.toolRegistrations\)/);
    assert.match(DAEMON_ENTRY_SOURCE, /^\s+withReadOnlyFrontendCapabilities,$/m, "expected withReadOnlyFrontendCapabilities in the agent-daemon-port import list");
  });

  test("every registration is still handed to registry.register — the rewrap must not replace registration itself", () => {
    assert.match(registrationLoopSource, /registry\.register\(applyToolApprovalPolicy\(\{\s*registration:\s*lostFrontendBindings\.wrap\(registration\),\s*surfaces:\s*\{\s*surfaceExchanges\s*\}/);
  });

  test("a run whose bind token was unknown gets the reload message: bind errors are recorded and every tool is wrapped", () => {
    assert.match(DAEMON_ENTRY_SOURCE, /const lostFrontendBindings = createLostFrontendBindings\(\)/);
    assert.match(DAEMON_ENTRY_SOURCE, /onBindError: \(context\) => \{\n[^\n]*\n\s*lostFrontendBindings\.noteBindError\(context\)/);
  });
});

// F1.4/F2.4: run the actual complete loop, then invoke tools from the resulting registry.
test("the daemon loop registers every frontend tool and preserves navigation success, rewrap and lost-binding guidance", async () => {
  const { default: ts } = await import("typescript");
  const { daemonSource, evaluateDaemonStatements } = await import("./helpers/daemon-source.js");
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createToolExecutor } = await import("@jini-ai/daemon");
  const { withPageNavigateErrorRewrap } = await import("#src/assistant/rewrap-page-navigate-error");
  const { withReadOnlyFrontendCapabilities } = await import("#src/assistant/frontend-control-capabilities");
  const { createLostFrontendBindings } = await import("#src/assistant/lost-frontend-binding");
  const { applyToolApprovalPolicy } = await import("#src/assistant/tool-approval-policy");
  const { createSurfaceExchangeStore } = await import("@jini-ai/daemon/surface-exchanges");
  const { createTimeoutScheduler } = await import("@jini-ai/daemon/scheduler");
  const { createSystemClock, createRandomUuidGenerator } = await import("@jini-ai/core/primitives");
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const loop = daemonSource.statements.find((statement) => ts.isForOfStatement(statement) && statement.expression.getText(daemonSource).includes("frontendControl.toolRegistrations"));
  assert.ok(loop, "the module-level frontend registration loop must exist");
  const registry = createToolRegistry({});
  const lostFrontendBindings = createLostFrontendBindings();
  lostFrontendBindings.noteBindError({ runId: "lost-run", error: new Error("unknown or expired bind token") });
  const registrations: import("@jini-ai/core").ToolRegistration[] = [
    { descriptor: { id: "page.navigate" }, policy: { authorize: () => "allow" }, handler: async (ctx) => {
      const page = (ctx.input as { page: string }).page;
      if (page !== "posts") throw new Error(`"${page}" is not a published page. Available: posts, settings`);
      return { navigatedTo: "posts" };
    } },
    { descriptor: { id: "chat.send_message" }, policy: { authorize: () => "allow" }, handler: async () => ({ sent: true }) },
    { descriptor: { id: "admin.capture_screenshot" }, policy: { authorize: () => "allow" }, handler: async (ctx) => { throw new Error(`no frontend is bound to run "${ctx.run.id}"`); } },
  ];
  await evaluateDaemonStatements([loop], { registry, lostFrontendBindings, withPageNavigateErrorRewrap, withReadOnlyFrontendCapabilities, applyToolApprovalPolicy, surfaceExchanges, frontendControl: { toolRegistrations: registrations } });
  assert.deepEqual(registry.list({}).map(({ id }) => id).sort(), ["admin.capture_screenshot", "chat.send_message", "page.navigate"]);
  const executor = createToolExecutor({ registry });
  const request = { principal: { id: "principal" }, run: { id: "bound-run" }, toolId: "page.navigate", input: { page: "posts" } };
  const success = await executor.execute(request);
  assert.equal(success.status, "completed");
  assert.deepEqual(success.output, { navigatedTo: "posts" });
  const failure = await executor.execute({ ...request, input: { page: "pricing" } });
  assert.equal(failure.status, "failed");
  assert.equal(failure.error, '"pricing" is not a registered ADMIN SCREEN id (page.navigate moves the operator\'s admin UI between a fixed set of screens — it does not open site content). Available screens: posts, settings. Looking for a post or page instead? Use content_post_search / content_read.content_post (or content_duplicate to copy one), not page.navigate.');
  const sent = await executor.execute({ ...request, toolId: "chat.send_message", input: {} });
  assert.equal(sent.status, "completed");
  assert.deepEqual(sent.output, { sent: true });
  const lost = await executor.execute({ ...request, run: { id: "lost-run" }, toolId: "admin.capture_screenshot", input: {} });
  assert.equal(lost.status, "failed");
  assert.equal(lost.error, "The admin tab lost its connection to the assistant after a server restart, so it cannot run this tool. Reload the admin page and try again.");
});
