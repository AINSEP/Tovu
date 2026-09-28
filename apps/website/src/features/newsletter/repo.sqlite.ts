/**
 * @file The six newsletter repos on a site's SQLite `content.db`: the one Kysely query body in
 * `repo.ts` (`SqlNewsletter…Repo`) behind their historical `SqliteNewsletter…Repo` names, so the
 * composition root's construction sites stay as they are; new code calls the `newsletter…RepoFor`
 * factories. The campaign pair lives in the migrated core schema; the other five tables are the
 * `p_newsletter__*` dataModule tables `declareDataModule()` creates (`data-module-manifest.ts`,
 * ADR-023 §7/§8).
 */
import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import {
  SqlNewsletterAudienceSnapshotRepo,
  SqlNewsletterCampaignRepo,
  SqlNewsletterConfirmationTokenRepo,
  SqlNewsletterListRepo,
  SqlNewsletterSendRepo,
  SqlNewsletterSubscriptionRepo,
} from "./repo.js";

export class SqliteNewsletterCampaignRepo extends SqlNewsletterCampaignRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNewsletterListRepo extends SqlNewsletterListRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNewsletterSubscriptionRepo extends SqlNewsletterSubscriptionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNewsletterAudienceSnapshotRepo extends SqlNewsletterAudienceSnapshotRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNewsletterSendRepo extends SqlNewsletterSendRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNewsletterConfirmationTokenRepo extends SqlNewsletterConfirmationTokenRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
