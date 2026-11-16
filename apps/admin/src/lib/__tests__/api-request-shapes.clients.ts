import { analyticsApi } from "../../features/analytics/api/analytics-api";
import { api } from "../api";
import { authApi } from "../../features/auth/api/auth-api";
import { collectionsApi } from "../../features/collections/api/collections-api";
import { commentsApi } from "../../features/comments/api/comments-api";
import { databaseApi } from "../../features/database/api/database-api";
import { formsApi } from "../../features/forms/api/forms-api";
import { fsFilesApi } from "../../features/fs-files/api/fs-files-api";
import { membersApi } from "../../features/members/api/members-api";
import { menusApi } from "../../features/menus/api/menus-api";
import { pagesApi } from "../../features/pages/api/pages-api";
import { pluginsApi } from "../../features/plugins/api/plugins-api";
import { postsApi } from "../../features/posts/api/posts-api";
import { providersApi } from "../../features/providers/api/providers-api";
import { publishContentApi } from "../../features/publish-content/api/publish-content-api";
import { recoveryApi } from "../../features/recovery/api/recovery-api";
import { rolesApi } from "../../features/roles/api/roles-api";
import { settingsApi } from "../../features/settings/api/settings-api";
import { taxonomyApi } from "../../features/taxonomy/api/taxonomy-api";
import { trashApi } from "../../features/trash/api/trash-api";
import { usersApi } from "../../features/users/api/users-api";
import { widgetsApi } from "../../features/widgets/api/widgets-api";
import { workspaceApi } from "../../features/workspace/api/workspace-api";

/** Every admin API client object the request-shape table calls; a member must belong to exactly one. */
export const API_CLIENTS: Record<string, object> = { analyticsApi, api, authApi, collectionsApi, commentsApi, databaseApi, formsApi, fsFilesApi, membersApi, menusApi, pagesApi, pluginsApi, postsApi, providersApi, publishContentApi, recoveryApi, rolesApi, settingsApi, taxonomyApi, trashApi, usersApi, widgetsApi, workspaceApi };
