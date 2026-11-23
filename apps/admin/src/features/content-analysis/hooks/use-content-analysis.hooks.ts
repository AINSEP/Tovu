import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

import { useContentAnalysis, type ContentAnalysisController, type ContentAnalysisTarget } from "@jini-ai/admin/screens/content-analysis/hooks/use-content-analysis.hooks";
import { defaultContentAnalysisPort } from "./content-analysis-dependencies.hooks";

/**
 * @file The host half of the Content analysis card's hook pair: `@jini-ai/admin`'s
 * `useContentAnalysis` holds the state; this binds it to the admin's live plugin-preview port and
 * locale. `PostSavedPanels.tsx` passes it to the card as its required `useContentAnalysisHook` prop.
 */

/**
 * Binds the real preview status and preview route and the resolved `useAdminLocale()` value — the
 * zero-dependency half of the pair, so `ContentAnalysisCard.tsx` composes this and a test composes
 * {@link useContentAnalysis} with `createFakeContentAnalysisPort`.
 */
export function useWiredContentAnalysis(props: ContentAnalysisTarget): ContentAnalysisController {
  const locale = useAdminLocale();
  return useContentAnalysis(props, { port: defaultContentAnalysisPort, locale });
}
