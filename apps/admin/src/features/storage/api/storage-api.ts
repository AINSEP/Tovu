import { createStorageClient } from "@jini-ai/admin/screens/storage/api/storage-api";
import { request } from "@/lib/admin-http/request";

/** The live client over this admin's `request`. */
export const storageClient = createStorageClient({ request, basePath: "/api/admin/storage" }, {});
