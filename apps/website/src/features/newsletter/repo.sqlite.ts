/**
 * @file The six newsletter repos on a site's SQLite `content.db`: the one Kysely query body in
 * `@jini-ai/user-management/newsletter/repo*` (`SqlNewsletter…Repo`) behind their historical `SqliteNewsletter…Repo` names used by the
 * composition root; new code constructs `SqlNewsletter…Repo`
 * with a schema-erased kernel and {@link NEWSLETTER_SQL_TABLES} directly. The campaign pair lives in the migrated core schema; the other five tables
 * are the `p_newsletter__*` dataModule tables `declareDataModule()` creates (`@jini-ai/user-management/newsletter/data-module-manifest`,
 * ADR-023 §7/§8).
 *
 * The query bodies are Jini's (`@jini-ai/user-management/newsletter/repo*`); this binding supplies
 * this site's table names ({@link NEWSLETTER_SQL_TABLES}) and the campaign body reporter
 * ({@link logUnreadableCampaignBody}).
 */

import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { NEWSLETTER_TABLE_NAMES } from "@jini-ai/user-management/newsletter/data-module-manifest";
import { SqlNewsletterAudienceSnapshotRepo, SqlNewsletterSendRepo } from "@jini-ai/user-management/newsletter/repo-sends";
import { SqlNewsletterCampaignRepo } from "@jini-ai/user-management/newsletter/repo";
import { SqlNewsletterConfirmationTokenRepo, SqlNewsletterListRepo, SqlNewsletterSubscriptionRepo } from "@jini-ai/user-management/newsletter/repo-subscribers";
import type { CampaignBodyReporter, NewsletterSqlTables } from "@jini-ai/user-management/newsletter/repo.rows";

/** This site's newsletter table names (the Jini adapters have no default): the migrated campaign pair plus the dataModule tables. */
export const NEWSLETTER_SQL_TABLES: NewsletterSqlTables = {
  campaigns: "newsletter_campaigns",
  campaignRevisions: "newsletter_campaign_revisions",
  ...NEWSLETTER_TABLE_NAMES,
};

/** This site's unreadable-revision log line (the Jini campaign repo has no console default). Identity/sequence only. */
export const logUnreadableCampaignBody: CampaignBodyReporter = ({ campaignId, seq }) =>
  console.warn(`[newsletter] Cannot read campaign ${campaignId} body (seq=${seq}). Open the campaign and restore a valid revision.`);

/** The shared constructor object every binding passes: this connection's schema-erased kernel and the site's tables. */
function sqlDeps({ store }: { store: ContentKernel | ContentDb }) {
  return { kernel: schemaErasedKernel({ store }), tables: NEWSLETTER_SQL_TABLES };
}

export class SqliteNewsletterCampaignRepo extends SqlNewsletterCampaignRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ ...sqlDeps({ store }), onUnreadableBody: logUnreadableCampaignBody });
  }
}

export class SqliteNewsletterListRepo extends SqlNewsletterListRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(sqlDeps({ store }));
  }
}

export class SqliteNewsletterSubscriptionRepo extends SqlNewsletterSubscriptionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(sqlDeps({ store }));
  }
}

export class SqliteNewsletterAudienceSnapshotRepo extends SqlNewsletterAudienceSnapshotRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(sqlDeps({ store }));
  }
}

export class SqliteNewsletterSendRepo extends SqlNewsletterSendRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(sqlDeps({ store }));
  }
}

export class SqliteNewsletterConfirmationTokenRepo extends SqlNewsletterConfirmationTokenRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(sqlDeps({ store }));
  }
}
