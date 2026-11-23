import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { keepStoredRevocation } from "../../platform/db/keep-stored-revocation.js";
import {
  SqlMagicLinkTokenRepo,
  SqlMemberConsentRepo,
  SqlMemberExternalIdentityRepo,
  SqlMemberRepo,
  SqlMemberSessionRepo,
  SqlMemberSubscriptionRepo,
  SqlMemberTierRepo,
  type MemberSessionSqlRequired,
  type MemberTables,
} from "@jini-ai/user-management/members/repo";

/** This site's member table names (the Jini adapters have no default). */
export const MEMBER_TABLES: MemberTables = {
  members: "members",
  memberTiers: "member_tiers",
  memberSubscriptions: "member_subscriptions",
  memberSessions: "member_sessions",
  memberMagicTokens: "member_magic_tokens",
  memberConsents: "member_consents",
  memberRevisions: "member_revisions",
  memberExternalIdentities: "member_external_identities",
};

/**
 * The constructor object every member SQL repo takes on this site: the schema-erased kernel of the
 * connection (any dialect), this site's table names and its one-way session revocation rule (shared
 * with the principal session table, so it stays a platform helper).
 * @example new SqlMemberRepo(memberSqlDeps({ store: kernel }))
 */
export function memberSqlDeps({ store }: { store: ContentKernel | ContentDb }, _optional: Record<string, never> = {}): MemberSessionSqlRequired {
  return {
    kernel: schemaErasedKernel({ store }),
    tables: MEMBER_TABLES,
    // MEMBER_TABLES.memberSessions is the only table these repos pass to the rule.
    keepStoredRevocation: ({ table }) => keepStoredRevocation({ table: table as "member_sessions" }),
  };
}

/** Same identity queries on SQLite; accepts the existing handle or its kernel.
 * @example new SqliteMemberExternalIdentityRepo({ store })
 */
export class SqliteMemberExternalIdentityRepo extends SqlMemberExternalIdentityRepo {
  constructor(required: { store: ContentKernel | ContentDb }, _options: Record<string, never> = {}) {
    super(memberSqlDeps({ store: required.store }));
  }
}

/**
 * @file The 6 `members` repos on a site's SQLite `content.db` (ADR-PIPE-013 Decision §5, REQ-18):
 * each is a thin subclass of the one Kysely query body in `repo.ts` (now Jini
 * `@jini-ai/user-management/members/repo`), bound to this site's table names and revocation rule. Kept as named classes so
 * existing call sites that construct them from the content db handle stay as they are; new code
 * constructs the `Sql…Repo` classes with a kernel directly.
 */

export class SqliteMemberRepo extends SqlMemberRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(memberSqlDeps({ store }));
  }
}

export class SqliteMemberTierRepo extends SqlMemberTierRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(memberSqlDeps({ store }));
  }
}

export class SqliteMemberSubscriptionRepo extends SqlMemberSubscriptionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(memberSqlDeps({ store }));
  }
}

export class SqliteMemberSessionRepo extends SqlMemberSessionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(memberSqlDeps({ store }));
  }
}

export class SqliteMagicLinkTokenRepo extends SqlMagicLinkTokenRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(memberSqlDeps({ store }));
  }
}

export class SqliteMemberConsentRepo extends SqlMemberConsentRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(memberSqlDeps({ store }));
  }
}
