import { analyticsApi } from "../../features/analytics/api/analytics-api";
import { api } from "../api";
import { formsApi } from "../../features/forms/api/forms-api";

/** Every admin API client object the request-shape table calls; a member must belong to exactly one. */
export const API_CLIENTS: Record<string, object> = { analyticsApi, api, formsApi };
