import { request, requestOnce } from "@/lib/admin-http/request";
import { createAuthApi } from "@jini-ai/admin/screens/auth/api/auth-api";

/** The admin API calls of the auth feature, over this host's `request` and `requestOnce`. */
export const authApi = createAuthApi({ request, requestOnce });
