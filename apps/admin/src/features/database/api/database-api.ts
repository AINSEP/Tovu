import { request } from "@/lib/admin-http/request";
import { createDatabaseApi } from "@jini-ai/admin/screens/database/api/database-api";

/** The admin API calls of the database feature, over this host's `request`. */
export const databaseApi = createDatabaseApi({ request });
