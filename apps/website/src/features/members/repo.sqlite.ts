import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import {
  SqlMagicLinkTokenRepo,
  SqlMemberConsentRepo,
  SqlMemberRepo,
  SqlMemberSessionRepo,
  SqlMemberSubscriptionRepo,
  SqlMemberTierRepo,
} from "./repo.js";

/**
 * @file The 6 `members` repos on a site's SQLite `content.db` (ADR-PIPE-013 Decision §5, REQ-18):
 * each is a thin subclass of the one Kysely query body in `repo.ts`. Kept as named classes so
 * existing call sites that construct them from the content db handle stay as they are; new code
 * calls the `…RepoFor(kernel)` factories.
 */

export class SqliteMemberRepo extends SqlMemberRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteMemberTierRepo extends SqlMemberTierRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteMemberSubscriptionRepo extends SqlMemberSubscriptionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteMemberSessionRepo extends SqlMemberSessionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteMagicLinkTokenRepo extends SqlMagicLinkTokenRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteMemberConsentRepo extends SqlMemberConsentRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
