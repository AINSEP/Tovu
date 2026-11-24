import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/__tests__/render-with-jini-kits";
import { ContentAnalysisCard } from "@jini-ai/admin/screens/content-analysis/ContentAnalysisCard";
import type { ContentAnalysisTarget } from "@jini-ai/admin/screens/content-analysis/hooks/use-content-analysis.hooks";
import { CONTENT_ANALYZER_PLUGIN_ID } from "@jini-ai/admin/screens/content-analysis/rules";
import { useWiredContentAnalysis } from "../hooks/use-content-analysis.hooks";
import { VALID_REPORT_JSON } from "./content-analysis-fixtures";

/**
 * @file `@jini-ai/admin`'s `ContentAnalysisCard` mounted the way `PostSavedPanels.tsx` mounts it —
 * with this host's `useWiredContentAnalysis` (live preview transport + admin locale) injected. The
 * card's own markup tests live with the card in `@jini-ai/admin`.
 */

const TARGET: ContentAnalysisTarget = {
  post: { id: "p1", version: 1, ext: { [CONTENT_ANALYZER_PLUGIN_ID]: { report: VALID_REPORT_JSON } } },
  title: "Draft",
  bodyJson: null,
};

describe("ContentAnalysisCard", () => {
  describe("without the seam (the real wired hook)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("renders nothing when the live preview status has content-analyzer disabled", async () => {
      let listed = false;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
        const url = String(input);
        const isStatus = url.endsWith(`/plugins/${CONTENT_ANALYZER_PLUGIN_ID}/preview`);
        const body = isStatus ? { pluginId: CONTENT_ANALYZER_PLUGIN_ID, enabled: false } : { data: [] };
        if (isStatus) listed = true;
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      });
      const { container } = render(
        <ContentAnalysisCard {...TARGET} useContentAnalysisHook={useWiredContentAnalysis} />
      );
      await vi.waitFor(() => expect(listed).toBe(true));
      expect(container).toBeEmptyDOMElement();
    });
  });
});
