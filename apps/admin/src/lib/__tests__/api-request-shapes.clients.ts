import { analyticsApi } from "../../features/analytics/api/analytics-api";
import { api } from "../api";
import { commentsApi } from "../../features/comments/api/comments-api";
import { formsApi } from "../../features/forms/api/forms-api";
import { fsFilesApi } from "../../features/fs-files/api/fs-files-api";
import { membersApi } from "../../features/members/api/members-api";
import { menusApi } from "../../features/menus/api/menus-api";
import { pagesApi } from "../../features/pages/api/pages-api";
import { pluginsApi } from "../../features/plugins/api/plugins-api";
import { providersApi } from "../../features/providers/api/providers-api";
import { settingsApi } from "../../features/settings/api/settings-api";
import { trashApi } from "../../features/trash/api/trash-api";
import { widgetsApi } from "../../features/widgets/api/widgets-api";
import { workspaceApi } from "../../features/workspace/api/workspace-api";

/** Every admin API client object the request-shape table calls; a member must belong to exactly one. */
export const API_CLIENTS: Record<string, object> = { analyticsApi, api, commentsApi, formsApi, fsFilesApi, membersApi, menusApi, pagesApi, pluginsApi, providersApi, settingsApi, trashApi, widgetsApi, workspaceApi };
