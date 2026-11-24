import assert from "node:assert/strict";
import test from "node:test";
import { executePageCapability, rewrapPageNavigateError, type PageDriver } from "@jini-ai/agentic";

import { describeAdminScreenRefusal } from "../rewrap-page-navigate-error.js";

/**
 * @file Certifies Tovu's wording for the misleading `page.navigate` refusal
 * (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §4). The real error text comes verbatim from
 * `@jini-ai/agentic`'s `page-executor.ts` (`` `"${safePage}" is not a published page. Available: ${...}` ``)
 * — genuinely correct for its real job (refusing an unregistered ADMIN SCREEN id) but worded to
 * collide with this codebase's OWN, unrelated `PostRecord.status === "published"` CMS-content
 * concept. Detection, pass-through and registration wrapping are certified in Jini's
 * `packages/agentic/src/core/__tests__/page-navigate-error.test.ts`; this file pins the copy.
 */

test("rewraps the exact 'not a published page' refusal into a disambiguated message naming both the real cause and the fix", () => {
  const upstream = new Error(`"pricing" is not a published page. Available: posts, pages, settings`);

  const rewrapped = rewrapPageNavigateError({ err: upstream, describeRefusal: describeAdminScreenRefusal });

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
});

// F3.1: get the wording from the installed upstream executor rather than a copied message.
test("the real page.navigate refusal is rewrapped into CMS guidance", async () => {
  let navigations = 0;
  const driver = {
    listPages: async () => [{ id: "posts", label: "Posts" }, { id: "settings", label: "Settings" }],
    navigate: async () => { navigations++; },
  } as unknown as PageDriver;
  await assert.rejects(executePageCapability({ driver, capabilityId: "page.navigate", input: { page: "missing-cms-page" } }), (error: unknown) => {
    assert.ok(error instanceof Error);
    const rewrapped = rewrapPageNavigateError({ err: error, describeRefusal: describeAdminScreenRefusal }) as Error;
    assert.notEqual(rewrapped, error);
    assert.match(rewrapped.message, /admin screen/i);
    assert.match(rewrapped.message, /"missing-cms-page"/);
    assert.match(rewrapped.message, /posts \(Posts\), settings \(Settings\)/);
    assert.match(rewrapped.message, /content_post_search/);
    return true;
  });
  assert.equal(navigations, 0);
});
