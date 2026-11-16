import { analyticsApi } from "../../features/analytics/api/analytics-api";
import { api } from "../api";
import { commentsApi } from "../../features/comments/api/comments-api";
import { formsApi } from "../../features/forms/api/forms-api";
import { providersApi } from "../../features/providers/api/providers-api";
import { workspaceApi } from "../../features/workspace/api/workspace-api";

/** Every admin API client object the request-shape table calls; a member must belong to exactly one. */
export const API_CLIENTS: Record<string, object> = { analyticsApi, api, commentsApi, formsApi, providersApi, workspaceApi };
