import { listColumns } from "@jini-ai/db/kernel";
import { createSubmissionIpRetentionRepo as createPackageRetentionRepo } from "@jini-ai/cms/forms/sql";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { FORMS_TABLES } from "../../platform/db/content-tables.js";

/**
 * @file The submission-IP retention repo on a site's content database: Jini's retention query bound to
 * Tovu's forms table names and the connection's column catalog (`listColumns`, the dialect-specific lookup).
 */

/** Bind the site's connection and table names; retention policy and query stay in Jini. */
export function createSubmissionIpRetentionRepo({ kernel }: { kernel: ContentKernel }, _optional = {}) {
  return createPackageRetentionRepo({ kernel, tables: FORMS_TABLES, columns: ({ table }) => listColumns({ kernel, table }) }, {});
}
