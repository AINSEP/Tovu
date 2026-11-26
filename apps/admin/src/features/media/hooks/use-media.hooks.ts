import { bindMedia } from "@jini-ai/admin/screens/media/hooks/use-media.hooks";
import { MEDIA_JSON_UPLOAD_MAX_BYTES } from "@tovu/contracts/upload-limits";
import { describeApiError } from "@/lib/admin-http/request";
import { sizeRefusalFromError } from "../upload-size-copy";
import { useFetchMutation, useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { readFileAsBase64 } from "@jini-ai/admin/screens/media/rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { t as translate } from "../media-i18n";
import { defaultMediaPort } from "./media-dependencies.hooks";
import { useGridPages } from "@jini-ai/cms/react/media/hooks/use-grid-pages.hooks";
import { useMediaWrites } from "@jini-ai/cms/react/media/hooks/use-media-writes.hooks";

export const useWiredMedia = bindMedia({
  hooks: { useLocaleHook: useAdminLocale, useGridPages, useMediaWrites, useFetchQuery, useFetchMutation, useInvalidate, useContentRefreshSubscription },
  deps: { port: defaultMediaPort, translate, describeApiError, sizeRefusalFromError, readFileAsBase64, maxJsonUploadBytes: MEDIA_JSON_UPLOAD_MAX_BYTES },
});
