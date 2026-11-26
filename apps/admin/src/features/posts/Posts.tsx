import { bindPosts } from "@jini-ai/admin/posts/Posts";
import { t as translateForPosts } from "./posts-i18n";
import { siteUrl } from "../../lib/site-url";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { postRowMenuItems } from "@jini-ai/cms/react/posts/posts-list-rules";
import { useWiredPosts } from "./hooks/use-posts.hooks";
import { ServerLabel } from "@/components/status-labels";
import { useWiredAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { PublishSectionButton } from "../publish-content/publish-section-button-binding";
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";

export const Posts = bindPosts({
  hooks: { usePostsHook: useWiredPosts, useLocaleHook: useWiredAdminLocale },
  kit: { ServerLabel, PublishSectionButton },
  deps: {
    translate: translateForPosts, siteUrl, navigate, postRowMenuItems,
    postAdminPath: ({ slug }) => `/admin/posts/${slug}`,
    postEditorRoute: ({ slug }) => `/posts/${slug}`,
    viewerTimeZone: VIEWER_TIME_ZONE,
  },
});
