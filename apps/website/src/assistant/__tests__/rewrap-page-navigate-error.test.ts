import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { PAGE_NAVIGATE_TOOL_ID, rewrapPageNavigateError, withPageNavigateErrorRewrap } from "../rewrap-page-navigate-error.js";

function fakeCtx(): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input: {},
    signal: new AbortController().signal,
  };
}

function fakeRegistration(id: string, handler: ToolRegistration["handler"]): ToolRegistration {
  return {
    descriptor: { id, description: "fake" },
    policy: { authorize: () => "allow" },
    handler,
  } as ToolRegistration;
}

/**
 * @file Certifies `rewrapPageNavigateError` in isolation — the Tovu-side fix for the misleading
 * `page.navigate` refusal (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §4). The real error text
 * comes verbatim from `@jini-ai/agentic`'s `page-executor.ts:414`
 * (`` `"${safePage}" is not a published page. Available: ${...}` ``) — genuinely correct for its real
 * job (refusing an unregistered ADMIN SCREEN id) but worded to collide with this codebase's OWN,
 * unrelated `PostRecord.status === "published"` CMS-content concept. Asserted against the EXACT
 * upstream wording (not a paraphrase) so a future change to that message's shape is caught here
 * rather than silently failing to match.
 */

test("rewraps the exact 'not a published page' refusal into a disambiguated message naming both the real cause and the fix", () => {
  const upstream = new Error(`"pricing" is not a published page. Available: posts, pages, settings`);

  const rewrapped = rewrapPageNavigateError(upstream);

  assert.ok(rewrapped instanceof Error);
  assert.notEqual((rewrapped as Error).message, upstream.message, "the message must actually change");
  assert.match((rewrapped as Error).message, /"pricing"/, "must still name what the caller asked for");
  assert.match((rewrapped as Error).message, /admin screen/i, "must say this is about admin-SPA screen ids, not CMS content");
  assert.match((rewrapped as Error).message, /posts, pages, settings/, "must still carry the real available-screens list");
  // Named individually, not as one alternation: an alternation stays green while ANY member
  // matches, so it would have silently tolerated the two ids the 2026-09-08 `content_read`
  // collapse retired (`content_post_get`/`content_post_list` -> `content_read.content_post`)
  // for as long as `content_post_search` survived beside them.
  assert.match(
    (rewrapped as Error).message,
    /content_post_search/,
    "must steer the caller toward the search tool that actually answers a CMS-page request",
  );
  assert.match(
    (rewrapped as Error).message,
    /content_read\.content_post\b/,
    "must name the shipped read card, not a tool id the catalog no longer registers",
  );
  assert.doesNotMatch(
    (rewrapped as Error).message,
    /content_post_get|content_post_list/,
    "must not steer the caller at an id the `content_read` collapse retired",
  );
  assert.match(
    (rewrapped as Error).message,
    /admin\.show_site_page/,
    "must also point at admin.show_site_page for putting a published page on screen (2026-09-15)",
  );
});

test("an error with unrelated text is passed through completely unchanged", () => {
  const other = new Error("some other failure entirely");
  const result = rewrapPageNavigateError(other);
  assert.equal(result, other, "must be the SAME error object, not a rebuilt copy — no rewriting of errors this function does not own");
});

test("a non-Error rejection value is passed through unchanged", () => {
  const notAnError = { weird: "rejection shape" };
  assert.equal(rewrapPageNavigateError(notAnError), notAnError);
});

test("the 'Available:' list can legitimately be empty — '(none)' is still handled", () => {
  const upstream = new Error(`"anything" is not a published page. Available: (none)`);
  const rewrapped = rewrapPageNavigateError(upstream) as Error;
  assert.match(rewrapped.message, /\(none\)/);
});

/**
 * `withPageNavigateErrorRewrap` is the wiring half — the pure, directly-testable function
 * `agent-daemon-server.ts`'s registration loop actually calls (see that file's own registration
 * loop, and `agent-daemon-server.page-navigate-error-rewrap.unit.test.ts` next to it for the proof
 * that the loop really calls this). Tested here against fake `ToolRegistration`s so this file's
 * assertions do not need a daemon boot.
 */
test("withPageNavigateErrorRewrap: a rejecting page.navigate registration's handler is rewrapped", async () => {
  const upstream = new Error(`"pricing" is not a published page. Available: posts, pages`);
  const registrations = [fakeRegistration(PAGE_NAVIGATE_TOOL_ID, async () => { throw upstream; })];

  const wrapped = withPageNavigateErrorRewrap(registrations);
  assert.equal(wrapped.length, 1, "must not add or drop registrations");

  await assert.rejects(wrapped[0]!.handler(fakeCtx()), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match((err as Error).message, /admin screen/i);
    return true;
  });
});

test("withPageNavigateErrorRewrap: a SUCCESSFUL page.navigate call is untouched", async () => {
  const registrations = [fakeRegistration(PAGE_NAVIGATE_TOOL_ID, async () => ({ navigatedTo: "posts" }))];
  const wrapped = withPageNavigateErrorRewrap(registrations);
  assert.deepEqual(await wrapped[0]!.handler(fakeCtx()), { navigatedTo: "posts" });
});

test("withPageNavigateErrorRewrap: every OTHER tool's registration is passed through completely untouched", async () => {
  const original = fakeRegistration("chat.send_message", async () => ({ sent: true }));
  const wrapped = withPageNavigateErrorRewrap([original]);
  assert.equal(wrapped[0], original, "a non-page.navigate registration must be the SAME object, not rebuilt");
});

test("withPageNavigateErrorRewrap: an unrelated page.navigate failure is rewrapped unchanged (rewrapPageNavigateError's own pass-through)", async () => {
  const other = new Error("some unrelated internal failure");
  const registrations = [fakeRegistration(PAGE_NAVIGATE_TOOL_ID, async () => { throw other; })];
  const wrapped = withPageNavigateErrorRewrap(registrations);

  await assert.rejects(wrapped[0]!.handler(fakeCtx()), (err: unknown) => err === other);
});
