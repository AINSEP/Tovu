import { request } from "@/lib/admin-http/request";
import { createRecoveryApi } from "@jini-ai/admin/recovery/api/recovery-api";

/** The admin API calls of the recovery feature, over this host's `request`. */
export const recoveryApi = createRecoveryApi({ request });
