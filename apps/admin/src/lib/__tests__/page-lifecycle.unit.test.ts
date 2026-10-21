import { expect, it } from "vitest";

import { isPageUnloading } from "../page-lifecycle";

/**
 * @file The browser half of `page-lifecycle.ts` (the non-browser import is
 * `page-lifecycle.node.unit.test.ts`): the listeners installed at import flip the unloading fact on
 * `pagehide` and clear it on `pageshow`, so a page restored from the back/forward cache reports real
 * request failures again.
 */
it("reports unloading from pagehide until the next pageshow (bfcache restore)", () => {
  expect(isPageUnloading()).toBe(false);
  window.dispatchEvent(new Event("pagehide"));
  expect(isPageUnloading()).toBe(true);
  expect(isPageUnloading()).toBe(true);
  window.dispatchEvent(new Event("pageshow"));
  expect(isPageUnloading()).toBe(false);
});
