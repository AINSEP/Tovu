import { agentHandle } from "@jini-ai/agentic";
import { useWiredContentAnalysis, type ContentAnalysisTarget } from "./hooks/use-content-analysis.hooks";

/**
 * @file The post editor's Content analysis card — the admin surface of the `content-analyzer`
 * built-in plugin (AW-7 Tier 2). Markup only: whether it shows, which analysis it shows and every
 * string in it come from `hooks/use-content-analysis.hooks.ts` and `rules.ts`.
 *
 * Core admin code rather than a plugin-provided panel because no plugin admin-UI surface exists yet
 * (see `ADS-memory/.local-artifacts/aw7-tier2/dx-pain.md`). Mounted by `PostEditor.tsx` beside the
 * Categories & Tags box; renders nothing unless the plugin is enabled.
 */
export function ContentAnalysisCard(
  props: ContentAnalysisTarget & {
    /** Dependency injection seam for tests — the same convention `TermPicker` uses. Defaulted to the
     *  real hook, so production callers pass nothing. */
    useContentAnalysisHook?: typeof useWiredContentAnalysis;
  }
) {
  const useContentAnalysisHook = props.useContentAnalysisHook ?? useWiredContentAnalysis;
  const { hidden, view, analyzing, error, analyze, t } = useContentAnalysisHook({
    post: props.post,
    title: props.title,
    bodyJson: props.bodyJson,
  });

  if (hidden) return null;

  return (
    <section className="card content-analysis" aria-labelledby="content-analysis-title">
      <h3 id="content-analysis-title" className="card-title">
        {t("Content analysis")}
      </h3>
      <p className="card-lead" aria-live="polite">
        {view.lead}
      </p>
      {view.report ? (
        <>
          <ul className="content-analysis-stats">
            {view.report.stats.map((stat) => (
              <li key={stat.key} className="content-analysis-stat">
                <span className="dash-stat-label">{stat.label}</span>
                <span className="dash-stat-value">{stat.value}</span>
                <span className="dash-stat-meta">{stat.meta}</span>
              </li>
            ))}
          </ul>
          <h4 id="content-analysis-toc" className="field-label">
            {t("Table of contents")}
          </h4>
          {view.report.toc.length > 0 ? (
            <ul className="content-analysis-list" aria-labelledby="content-analysis-toc">
              {view.report.toc.map((entry) => (
                <li key={entry.key} style={{ paddingInlineStart: `${entry.indentRem}rem` }}>
                  <span className="content-analysis-toc-level">{entry.levelLabel}</span>
                  {entry.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">{t("No headings yet.")}</p>
          )}
          <h4 id="content-analysis-checks" className="field-label">
            {t("Checks")}
          </h4>
          <ul className="content-analysis-list" aria-labelledby="content-analysis-checks">
            {view.report.checks.map((check) => (
              <li key={check.key} className="content-analysis-check">
                {/* Status is the pill's TEXT; the icon is decorative and the tone only reinforces it. */}
                <span className={`status ${check.tone}`}>
                  <span aria-hidden="true">{check.icon}</span> {check.statusLabel}
                </span>
                <strong>{check.title}</strong>
                <span>{check.message}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <span className="editor-actions content-analysis-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void analyze()}
          disabled={analyzing}
          {...agentHandle({ handle: "content-analysis-analyze" }, {
            role: "button",
            label: "Analyze this post's current, unsaved title and body for SEO, readability, word count, reading time, headings and image alt text",
          })}
        >
          {analyzing ? t("Analyzing…") : t("Analyze now")}
        </button>
        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    </section>
  );
}
