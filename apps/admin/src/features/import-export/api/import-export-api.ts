import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createImportExportApi } from "@jini-ai/admin/screens/import-export/api/import-export-api";

/** The admin API calls of the import-export feature, over this host's `request`. */
export const importExportApi = createImportExportApi({ request, workspaceId: WORKSPACE_ID });
