import { after } from "node:test";

import { sql } from "drizzle-orm";

import { openPgliteContentStore, type PgliteContentStore } from "#src/platform/db/pglite/content-store";
import type { PostRepoPort } from "../post.js";
import { PglitePostRepo } from "../repo.pglite.js";

/**
 * @file The third `PostRepoPort` adapter for the rule-of-two contract suites: a `PglitePostRepo` over
 * in-memory PGlite (nothing on disk).
 *
 * One PGlite per test FILE, emptied at the start of each `make` — a fresh instance plus the 90-table
 * schema costs seconds, emptying two tables costs milliseconds. Safe because the suites run their
 * tests one after another and each makes its repo before using it. Closed once, after the file.
 */
let shared: PgliteContentStore | undefined;

// Registered at import (file level): an `after` registered inside a test would run after THAT test.
after(async () => {
  await shared?.close();
});

function sharedStore(): PgliteContentStore {
  shared ??= openPgliteContentStore({});
  return shared;
}

export function makePglitePostRepo(): { repo: PostRepoPort; teardown: () => void } {
  const base = sharedStore();
  const ready = base.ready.then(async () => {
    await base.executor().execute(sql`TRUNCATE posts, post_revisions`);
  });
  return { repo: new PglitePostRepo({ ...base, ready }), teardown: () => {} };
}
