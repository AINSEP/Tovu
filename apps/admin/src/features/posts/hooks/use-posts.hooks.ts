import { bindPostsHooks } from "@jini-ai/admin/posts/hooks/use-posts.hooks";
import { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../posts-i18n";
import { navigate as defaultNavigate } from "@jini-ai/admin/shell/lib/router";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { POSTS_RESOURCE, buildPostRowMenuHandleMap } from "@jini-ai/cms/react/posts/posts-list-rules";
import { defaultPostsListPort } from "./posts-list-dependencies.hooks";

export const useWiredPosts = bindPostsHooks({
  hooks: { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate, useContentRefreshSubscription, useLocaleHook: useWiredAdminLocale },
  deps: {
    port: defaultPostsListPort,
    navigate: (routePath) => defaultNavigate({ routePath }),
    createRoutePath: "/posts?create=1", resource: POSTS_RESOURCE,
    translate, buildPostRowMenuHandleMap,
  },
});
