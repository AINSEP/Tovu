import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { StorageKernel } from "@jini-ai/db/kernel";
import {
  SqlFormDefinitionRepo, SqlFormSubmissionRepo,
  createSubmissionIpRetentionRepo as createPackageRetentionRepo,
  type FormDefinitionDatabase, type FormSubmissionDatabase,
} from "@jini-ai/cms/forms/sql";

/** Forms table names belong to Tovu's unchanged schema. */
export const FORMS_TABLES = { definitions: "form_definitions", submissions: "form_submissions" };

/**
 * @file The forms repos on a site's SQLite `content.db`: {@link SqlFormDefinitionRepo} and
 * {@link SqlFormSubmissionRepo} (the one Kysely query body in @jini-ai/cms/forms/sql). Kept as named
 * classes so existing call sites that construct them from the content db handle stay as they are.
 */
export class SqliteFormDefinitionRepo extends SqlFormDefinitionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as StorageKernel<FormDefinitionDatabase>, tables: FORMS_TABLES }, {});
  }
}

export class SqliteFormSubmissionRepo extends SqlFormSubmissionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as StorageKernel<FormSubmissionDatabase>, tables: FORMS_TABLES }, {});
  }
}

/** Bind the site's connection and table names; retention policy and query stay in Jini. */
export function createSubmissionIpRetentionRepo({ kernel }: { kernel: ContentKernel }, _optional = {}) {
  return createPackageRetentionRepo({ kernel, tables: FORMS_TABLES }, {});
}
