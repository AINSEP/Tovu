/** S1 contract on real Postgres; requires the configured local test server, never skips. */
import { after, before } from "node:test";
import { sql } from "kysely";
import { freshPostgresDatabase, dropDatabase } from "#src/platform/db/__tests__/postgres-database";
import { openPostgresKernel } from "#src/platform/db/kernel/drivers/postgres";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { migrateContentDatabase } from "#src/platform/db/migrations/index";
import { SqlMemberExternalIdentityRepo } from "../repo.js";
import { runExternalIdentityContract } from "./member-external-identities.contract.js";

const DATABASE = "tovu_member_external_identities_contract";
let kernel: ContentKernel;
before(async () => {
  kernel = openPostgresKernel({ connectionString: freshPostgresDatabase(DATABASE) });
  await migrateContentDatabase(kernel);
});
after(async () => {
  await kernel?.close();
  dropDatabase({ database: DATABASE });
});
runExternalIdentityContract({ name: "postgres", open: async () => {
  await kernel.execute(sql`DELETE FROM member_external_identities`);
  return new SqlMemberExternalIdentityRepo({ kernel });
} });
