import test from "node:test";
import assert from "node:assert/strict";
import { trimRetiredSiteCacheIn } from "./site-cache-trim.ts";
import { sitePartition } from "./desktop-auth.ts";

/** A recording `fromPartition`: every partition asked for, and every method called on its session. */
function recordingSessions() {
  const calls: string[] = [];
  const fromPartition = (partition: string) => {
    calls.push(`fromPartition:${partition}`);
    // Only the cache-only members exist; a call to any storage-clearing member would throw here.
    return {
      clearCache: async () => { calls.push("clearCache"); },
      clearCodeCaches: async (options: { urls?: string[] }) => { calls.push(`clearCodeCaches:${JSON.stringify(options)}`); },
    };
  };
  return { calls, heldSession: fromPartition };
}

test("trimRetiredSiteCacheIn clears HTTP and code caches in the site's canonical partition only", async () => {
  const recorder = recordingSessions();
  const siteDir = "/sites/retired";

  await trimRetiredSiteCacheIn({ siteDir, heldSession: recorder.heldSession });

  const partition = sitePartition({ siteDir });
  assert.match(partition, /^persist:tovu-site-[0-9a-f]+$/, "a named persistent partition, never the default session");
  assert.deepEqual(recorder.calls, [`fromPartition:${partition}`, "clearCache", "clearCodeCaches:{}"]);
});

test("trimRetiredSiteCacheIn never resolves another site's partition", async () => {
  const recorder = recordingSessions();

  await trimRetiredSiteCacheIn({ siteDir: "/sites/retired", heldSession: recorder.heldSession });

  assert.equal(recorder.calls.includes(`fromPartition:${sitePartition({ siteDir: "/sites/kept" })}`), false);
});

test("trimRetiredSiteCacheIn skips a partition this process does not hold, opening nothing", async () => {
  const asked: string[] = [];
  await trimRetiredSiteCacheIn({ siteDir: "/sites/unheld", heldSession: (partition) => { asked.push(partition); return undefined; } });
  assert.deepEqual(asked, [sitePartition({ siteDir: "/sites/unheld" })]);
});
