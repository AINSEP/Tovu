import test from "node:test";
import assert from "node:assert/strict";
import { trimRetiredSiteCacheIn } from "./site-cache-trim.ts";
import { sitePartition } from "./desktop-auth.ts";
import { UNKNOWN_EVIDENCE } from "./main/boot/desktop-cache-policy.ts";

/** A packaged-probe GO for both clear ops — what a recorded ST-1a verdict would carry. */
const GO = { cap: "go", clearOps: { clearCache: "go", clearCodeCaches: "go" } } as const;

/** A recording `fromPartition`: every partition asked for, and every method called on its session. */
function recordingSessions() {
  const calls: string[] = [];
  const fromPartition = (partition: string) => {
    calls.push(`fromPartition:${partition}`);
    // Only the cache-only members exist; a call to any storage-clearing member would throw here.
    return {
      clearCache: async () => { calls.push("clearCache"); },
      clearCodeCaches: async (options: { urls?: string[] }) => { calls.push(`clearCodeCaches:${JSON.stringify(options)}`); },
      // Sign-in state lives beside the cache; touching it would be a bug the recorder makes loud.
      clearStorageData: async () => { calls.push("clearStorageData"); },
      clearData: async () => { calls.push("clearData"); },
    };
  };
  return { calls, heldSession: fromPartition };
}

test("trimRetiredSiteCacheIn clears HTTP and code caches in the site's canonical partition only", async () => {
  const recorder = recordingSessions();
  const siteDir = "/sites/retired";

  await trimRetiredSiteCacheIn({ siteDir, heldSession: recorder.heldSession, evidence: GO });

  const partition = sitePartition({ siteDir });
  assert.match(partition, /^persist:tovu-site-[0-9a-f]+$/, "a named persistent partition, never the default session");
  assert.deepEqual(recorder.calls, [`fromPartition:${partition}`, "clearCache", "clearCodeCaches:{}"]);
});

test("trimRetiredSiteCacheIn never resolves another site's partition", async () => {
  const recorder = recordingSessions();

  await trimRetiredSiteCacheIn({ siteDir: "/sites/retired", heldSession: recorder.heldSession, evidence: GO });

  assert.equal(recorder.calls.includes(`fromPartition:${sitePartition({ siteDir: "/sites/kept" })}`), false);
});

test("trimRetiredSiteCacheIn skips a partition this process does not hold, opening nothing", async () => {
  const asked: string[] = [];
  await trimRetiredSiteCacheIn({ siteDir: "/sites/unheld", heldSession: (partition) => { asked.push(partition); return undefined; }, evidence: GO });
  assert.deepEqual(asked, [sitePartition({ siteDir: "/sites/unheld" })]);
});

test("trimRetiredSiteCacheIn clears nothing on unknown packaged evidence, resolving no session at all", async () => {
  const recorder = recordingSessions();
  await trimRetiredSiteCacheIn({ siteDir: "/sites/retired", heldSession: recorder.heldSession, evidence: UNKNOWN_EVIDENCE });
  assert.deepEqual(recorder.calls, [], "no ST-1a verdict for this Electron: no clear, and no partition is even asked for");
});

test("trimRetiredSiteCacheIn runs each clear only on its own GO verdict", async () => {
  const onlyHttp = recordingSessions();
  await trimRetiredSiteCacheIn({ siteDir: "/sites/retired", heldSession: onlyHttp.heldSession, evidence: { cap: "go", clearOps: { clearCache: "go", clearCodeCaches: "no-go" } } });
  assert.deepEqual(onlyHttp.calls.slice(1), ["clearCache"]);
  const onlyCode = recordingSessions();
  await trimRetiredSiteCacheIn({ siteDir: "/sites/retired", heldSession: onlyCode.heldSession, evidence: { cap: "unknown", clearOps: { clearCache: "unknown", clearCodeCaches: "go" } } });
  assert.deepEqual(onlyCode.calls.slice(1), ["clearCodeCaches:{}"]);
});

test("trimRetiredSiteCacheIn never calls a sign-in-state member (cookies, storage) even on GO", async () => {
  const recorder = recordingSessions();
  await trimRetiredSiteCacheIn({ siteDir: "/sites/retired", heldSession: recorder.heldSession, evidence: GO });
  assert.equal(recorder.calls.some((call) => call === "clearStorageData" || call === "clearData"), false);
});
