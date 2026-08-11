import { Toast } from "@jini-ai/ui";

import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { useThemeExplore, type ThemeExploreView } from "./hooks/use-theme-explore.hooks";
import { t as translateAppearance } from "./appearance-i18n";

/**
 * @file Explore — edit any theme, active or not, and see it rendered.
 *
 * The screen the copy-not-inherit model needed. Every installed theme is a COPY of an original that
 * still exists untouched in the catalog, so editing here is always safe in the one way that matters:
 * the thing you forked from is still on disk, byte-identical, to reset back to. That is what the
 * banner says, and it is why there is no "are you sure" dialog anywhere on this screen.
 *
 * The preview is an `<iframe src>` pointed at the SITE server, not `srcDoc`. A rendered theme page
 * references `/theme-assets/<id>/css/...`, which only the site server serves — a `srcDoc` iframe
 * resolves those relative URLs against the admin's own origin and every stylesheet 404s. Pointing
 * `src` at the site origin makes the preview load exactly the bytes a visitor would get, which is
 * the entire claim this screen makes.
 */
export interface ThemeExploreProps {
  /** Theme id from `?theme=`. */
  themeId: string;
  /** DI seam for tests — same convention as `Appearance.tsx`'s `useAppearanceHook`. */
  useThemeExploreHook?: typeof useThemeExplore;
}

const VIEWS: ReadonlyArray<{ key: ThemeExploreView; label: string }> = [
  { key: "preview", label: "Preview" },
  { key: "html", label: "HTML" },
];

export function ThemeExplore({ themeId, useThemeExploreHook = useThemeExplore }: ThemeExploreProps) {
  const locale = useAdminLocale();
  const t = (key: string): string => translateAppearance(locale, key);
  const {
    detail,
    files,
    selected,
    select,
    view,
    setView,
    source,
    setSource,
    dirty,
    saving,
    error,
    notice,
    dismissNotice,
    save,
    previewNonce,
  } = useThemeExploreHook(themeId);

  if (error && !detail) return <div className="notice error">{error}</div>;
  if (!detail) return <div className="notice">{t("Loading theme…")}</div>;

  const pageId = selected?.startsWith("pages/") ? selected.slice("pages/".length, -".html".length) : null;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Studio")}</p>
          <h1 className="page-title">{detail.name}</h1>
          <p className="page-description">
            {t("Edit this theme and see it rendered. Nothing here changes your live site until you activate it.")}
          </p>
        </div>
      </div>

      <div className="page-toolbar">
        <a
          href="/admin/themes"
          onClick={(e) => {
            e.preventDefault();
            navigate("/themes");
          }}
        >
          {t("← All themes")}
        </a>
      </div>

      {/* The directions. Deliberately NOT the words "child theme": there is no runtime relationship
          between this theme and the one it came from — it is a fork, and calling it a child would
          teach that changing the original still feeds into this one, which it does not. */}
      {detail.hasOriginal ? (
        <div className="notice theme-explore-directions">
          <strong>{t("You're editing your own copy.")}</strong>{" "}
          {t(
            "An untouched original is kept separately, so you can change anything here without losing what you started from."
          )}
          {detail.lineage?.from ? (
            <>
              {" "}
              {t("Copied from")} <code>{detail.lineage.from}</code>
              {detail.lineage.version ? ` v${detail.lineage.version}` : null}.
            </>
          ) : null}
        </div>
      ) : (
        <div className="notice warning">
          {t(
            "No stored original for this theme, so edits here cannot be reset. Copy it first if you want a fallback."
          )}
        </div>
      )}

      {detail.status !== "valid" ? (
        <div className="notice error">
          {t("This theme is not loading:")} {detail.errors.join("; ")}
        </div>
      ) : null}
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <Toast message={notice} tone="success" ttlMs={5000} onDismiss={dismissNotice} /> : null}

      <div className="theme-explore">
        {/* Flat page/partial list for now, grouped by kind. A real nested file tree is a separate
            component — this theme's whole editable surface is ~20 entries two folders deep, which a
            tree would not make more legible. */}
        <nav className="theme-explore-files" aria-label={t("Theme files")}>
          {(["page", "partial"] as const).map((kind) => {
            const group = files.filter((f) => f.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <p className="theme-explore-files-heading">{kind === "page" ? t("Pages") : t("Partials")}</p>
                <ul>
                  {group.map((file) => (
                    <li key={file.path}>
                      <button
                        type="button"
                        className={selected === file.path ? "is-active" : undefined}
                        aria-current={selected === file.path ? "true" : undefined}
                        onClick={() => select(file.path)}
                      >
                        {file.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="theme-explore-main">
          <div className="page-editor-toolbar">
            <div className="segmented" role="tablist" aria-label={t("Editor view")}>
              {VIEWS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={view === entry.key}
                  className={view === entry.key ? "is-active" : undefined}
                  onClick={() => setView(entry.key)}
                >
                  {t(entry.label)}
                </button>
              ))}
            </div>
            <button className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? t("Saving…") : dirty ? t("Save") : t("Saved")}
            </button>
          </div>

          {view === "preview" ? (
            pageId ? (
              <iframe
                // `previewNonce` is in the key, not just the URL: changing a URL an iframe is
                // already showing does not always refetch, but remounting always does.
                key={`${selected}-${previewNonce}`}
                className="theme-explore-preview"
                title={t("Theme preview")}
                src={siteUrl(`/theme-explore/${encodeURIComponent(detail.id)}/${encodeURIComponent(pageId)}?v=${previewNonce}`)}
              />
            ) : (
              <div className="notice">
                {t("Partials have no standalone preview — open a page to see this one in context.")}
              </div>
            )
          ) : (
            <textarea
              className="page-html-source"
              value={source}
              spellCheck={false}
              onChange={(e) => setSource(e.target.value)}
              aria-label={t("Theme file source")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
