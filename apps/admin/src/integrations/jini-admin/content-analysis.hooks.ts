import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentAnalysis, type ContentAnalysisController, type ContentAnalysisTarget } from "@jini-ai/admin/screens/content-analysis/hooks/use-content-analysis.hooks";
import { useFetchMutation, useFetchQuery } from "@jini-ai/ui/fetch-query";
import { contentAnalysisPort } from "./content-analysis-ports";

/**
 * @file The host half of the Content analysis card's hook pair: `@jini-ai/admin`'s `useContentAnalysis`
 * holds the state; this binds it to the live preview port (which translates the host `ApiError` into
 * Jini's `AdminApiError`), the admin locale and the host query/mutation hooks. `PostSavedPanels.tsx`
 * passes it to the card as its required `useContentAnalysisHook` prop.
 */
export function useWiredContentAnalysis(props: ContentAnalysisTarget): ContentAnalysisController {
  const locale = useAdminLocale();
  return useContentAnalysis(props, { port: contentAnalysisPort, locale, useFetchQuery, useFetchMutation });
}
