import { emptiedPgContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { PostRepoPort } from "../post.js";
import { postRepoFor } from "../repo.js";

/**
 * @file The Postgres `PostRepoPort` adapter for the rule-of-two contract suites: the post repo over
 * the file's shared in-memory PGlite content kernel (`dialect-matrix.ts`), `posts` and
 * `post_revisions` emptied at the start of each `make`. Safe because the suites run their tests one
 * after another and each makes its repo before using it.
 */
export function makePglitePostRepo(): { repo: PostRepoPort; teardown: () => void } {
  return { repo: postRepoFor(emptiedPgContentKernel(["posts", "post_revisions"])), teardown: () => {} };
}
