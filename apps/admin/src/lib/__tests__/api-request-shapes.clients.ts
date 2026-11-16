import { analyticsApi } from "../../features/analytics/api/analytics-api";
import { api } from "../api";
import { commentsApi } from "../../features/comments/api/comments-api";
import { formsApi } from "../../features/forms/api/forms-api";
import { membersApi } from "../../features/members/api/members-api";
import { providersApi } from "../../features/providers/api/providers-api";
import { settingsApi } from "../../features/settings/api/settings-api";
import { widgetsApi } from "../../features/widgets/api/widgets-api";
import { workspaceApi } from "../../features/workspace/api/workspace-api";

/** Every admin API client object the request-shape table calls; a member must belong to exactly one. */
export const API_CLIENTS: Record<string, object> = { analyticsApi, api, commentsApi, formsApi, membersApi, providersApi, settingsApi, widgetsApi, workspaceApi };
