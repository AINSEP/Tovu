import { useState } from "react";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { t as translate } from "../content-analysis-i18n";
import {
  CONTENT_ANALYZER_PLUGIN_ID,
  buildContentAnalysisView,
  currentAnalysis,
  describeAnalysisError,
  isContentAnalyzerEnabled,
  previewAnalysis,
  previewRequestBody,
  type ContentAnalysisView,
  type FreshAnalysis,
  type PluginPreviewRequest,
} from "../rules";
import { defaultContentAnalysisPort } from "./content-analysis-dependencies.hooks";
import type { ContentAnalysisPort } from "./content-analysis-port.hooks";

/**
 * @file `ContentAnalysisCard`'s state and its one action — the post editor's Content analysis card
 * for the `content-analyzer` plugin (AW-7 Tier 2).
 *
 * - The card shows only while the plugin is enabled. The plugin list is read with `staleTime: 0`:
 *   the Plugins screen toggles plugins without going through this cache, so a cached "disabled"
 *   must not outlive a trip there and back.
 * - On load it shows the analysis the plugin stored on the post's last save
 *   (`ext["content-analyzer"].report`). "Analyze now" runs the plugin's preview over the editor's
 *   CURRENT title and body — unsaved edits included — and shows that instead, until the next save
 *   brings back a freshly stored one (`rules.ts`'s `currentAnalysis`).
 *
 * `port`/`locale` are injected — see `content-analysis-port.hooks.ts` — and `useWiredContentAnalysis`
 * below is the pair the card actually mounts.
 */

export interface ContentAnalysisTarget {
  post: { id: string; version: number; ext?: Record<string, Record<string, unknown>> };
  /** The editor's current (possibly unsaved) title. */
  title: string;
  /** The editor's current (possibly unsaved) TipTap JSON; `null` before TipTap mounts. */
  bodyJson: unknown;
}

export interface ContentAnalysisDependencies {
  port: ContentAnalysisPort;
  locale: string;
}

export interface ContentAnalysisController {
  /** The plugin is off, or the plugin list has not loaded (or failed) — the card renders nothing. */
  hidden: boolean;
  view: ContentAnalysisView;
  analyzing: boolean;
  error: string | null;
  /** Runs the plugin's preview over the current draft. Never rejects; a failure lands in `error`. */
  analyze: () => Promise<void>;
  t: Translate;
}

const PLUGINS_KEY = ["content-analysis", "plugins"] as const;

export function useContentAnalysis(props: ContentAnalysisTarget, deps: ContentAnalysisDependencies): ContentAnalysisController {
  const { port, locale } = deps;
  const { post } = props;
  const t: Translate = (key) => translate(locale, key);
  const pluginsQuery = useFetchQuery({ key: PLUGINS_KEY, fetch: () => port.listPlugins(), staleTime: 0 });
  const previewMutation = useFetchMutation({
    run: (body: PluginPreviewRequest) => port.previewPlugin({ pluginId: CONTENT_ANALYZER_PLUGIN_ID }, body),
  });
  const [fresh, setFresh] = useState<FreshAnalysis | null>(null);

  async function analyze() {
    // Tagged with the version the draft was sent against, so a save landing mid-flight wins.
    const basis = { postId: post.id, version: post.version };
    try {
      const response = await previewMutation.mutate(previewRequestBody({ postId: post.id, title: props.title, bodyJson: props.bodyJson }));
      setFresh({ ...basis, state: previewAnalysis(response.fields) });
    } catch {
      // Reported through `previewMutation.error` below; the shown analysis stays as it was.
    }
  }

  return {
    hidden: !isContentAnalyzerEnabled(pluginsQuery.data?.plugins ?? []),
    view: buildContentAnalysisView(currentAnalysis(post, fresh), t),
    analyzing: previewMutation.status === "pending",
    error: previewMutation.error ? describeAnalysisError(previewMutation.error, t) : null,
    analyze,
    t,
  };
}

/**
 * Binds the real plugin list and preview route and the resolved `useAdminLocale()` value — the
 * zero-dependency half of the pair, so `ContentAnalysisCard.tsx` composes this and a test composes
 * {@link useContentAnalysis} with `createFakeContentAnalysisPort`.
 */
export function useWiredContentAnalysis(props: ContentAnalysisTarget): ContentAnalysisController {
  const locale = useAdminLocale();
  return useContentAnalysis(props, { port: defaultContentAnalysisPort, locale });
}
