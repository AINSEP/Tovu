import { analyticsApi } from "../../features/analytics/api/analytics-api";
import { api } from "../api";
import { commentsApi } from "../../features/comments/api/comments-api";
import { formsApi } from "../../features/forms/api/forms-api";
import { membersApi } from "../../features/members/api/members-api";
import { menusApi } from "../../features/menus/api/menus-api";
import { providersApi } from "../../features/providers/api/providers-api";
import { settingsApi } from "../../features/settings/api/settings-api";
import { trashApi } from "../../features/trash/api/trash-api";
import { widgetsApi } from "../../features/widgets/api/widgets-api";
import { workspaceApi } from "../../features/workspace/api/workspace-api";

/** Every admin API client object the request-shape table calls; a member must belong to exactly one. */
export const API_CLIENTS: Record<string, object> = { analyticsApi, api, commentsApi, formsApi, membersApi, menusApi, providersApi, settingsApi, trashApi, widgetsApi, workspaceApi };
