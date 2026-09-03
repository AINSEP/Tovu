import { agentHandle } from "@jini-ai/agentic";
import { useId } from "react";

import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { siteUrl } from "../../lib/site-url";
import { actionLabel } from "./rules";
import { useWiredSitemapModal, type SitemapModalController } from "./hooks/use-sitemap-modal.hooks";
import { t } from "./seo-i18n";

/**
 * `SitemapModal` — "View sitemap" (owner request, `Seo.tsx`'s Sitemap card). Reads the exact same
 * `GET /sitemap.xml` bytes a crawler gets (`sitemap-dependencies.hooks.ts`'s `defaultSitemapPort`,
 * via `siteUrl()`) and renders them as a filterable `URL | Last modified` table, with a Raw XML
 * toggle for verifying the literal response text. `changefreq`/`priority` columns were considered
 * and dropped: `server/inbound/public-http/routes/site/sitemap.ts` never emits either field (read
 * directly, not guessed), so a column for them would only ever show blank.
 *
 * Same `.settings-dialog-backdrop`/`.settings-dialog` chrome as `MediaPickerDialog.tsx` (backdrop
 * click + Escape both cancel, `role="dialog"`/`aria-modal`/`aria-labelledby`) — not
 * `ThemePageDetailsModal.tsx`'s native `<dialog>` (that file's own header ties its `showModal()`/
 * `close()` lifecycle to being permanently mounted with a toggled `open` prop; this modal, like
 * `MediaPickerDialog`, is only ever mounted while actually open, so the simpler div-backdrop shape
 * fits without adopting a lifecycle this component doesn't need). `.sitemap-modal` widens the
 * shared `.settings-dialog` to ~900px the same way `.widget-picker-dialog`/`.media-picker-dialog`
 * do for their own callers (`styles.css`); `.sitemap-modal-body` is the one scrolling region
 * between the fixed header and the fixed footer, same `flex: 1 1 auto; min-height: 0;
 * overflow-y: auto` shape those two already established.
 *
 * State (fetch, parse, filter, view toggle, Escape-to-close) lives in `hooks/use-sitemap-modal
 * .hooks.ts`; this file is markup plus the one bit of sequencing that belongs to neither hook on
 * its own — refetching after a successful regenerate (see `handleRegenerate` below).
 *
 * ## Agent handles
 * Every interactive element carries its own `agentHandle` (grep `agentHandle(` in `Seo.tsx` for
 * the convention this follows): the raw-XML link, the table/raw toggle, the filter box, each row's
 * URL link (namespaced via `buildAgentListHandles`, the same per-item scheme `MediaPickerDialog
 * .tsx` uses), the footer Regenerate button, and the footer Close button.
 */

export interface SitemapModalProps {
  locale: string;
  /** `settings.sitemapEnabled` from `useSeo()` — when `false`, the modal shows why instead of a
   *  table (REQ 8: "disabled" and "on but zero URLs" are different facts, so this never fetches to
   *  find out — it already knows). */
  sitemapEnabled: boolean;
  /** `saving` from `useSeo()` — shared with the outer page's own Save/Regenerate buttons, same as
   *  today's single-flag convention (`Seo.tsx`'s existing `disabled={saving}` on both). */
  regenerating: boolean;
  /** `regenerateSitemap` from `useSeo()`. Resolves `true` on success, `false` on a caught failure —
   *  `handleRegenerate` below only refetches on `true`, matching REQ 7 ("after a SUCCESSFUL
   *  regenerate it refetches"). */
  onRegenerate: () => Promise<boolean>;
  onClose: () => void;
  /** Injectable seam for the modal's fetch/parse/filter/view state. Defaults to the real
   *  {@link useWiredSitemapModal}; a test can pass a fake here to exercise this component's
   *  rendering against a fixed `SitemapModalController`. */
  useModal?: typeof useWiredSitemapModal;
}

/** The header's `Sitemap · N URLs` title — no count while loading/erroring, since neither state
 *  has a real number to show yet.
 *
 * @complexity O(1). */
function sitemapModalTitle(locale: string, modal: SitemapModalController): string {
  if (modal.status !== "ready") return t(locale, "Sitemap");
  return t(locale, "Sitemap · {count} URLs").replace("{count}", String(modal.entries.length));
}

/** The header's raw-XML link + table/raw toggle — only shown once there is a real response to
 *  point at (REQ 3/6). Its own component purely so {@link SitemapModal} stays a flat sequence of
 *  blocks.
 *
 * @complexity O(1). */
function SitemapModalHeaderActions({ locale, modal }: { locale: string; modal: SitemapModalController }) {
  return (
    <div className="sitemap-modal-header-actions">
      <a
        className="sitemap-modal-source-link"
        href={siteUrl("/sitemap.xml")}
        target="_blank"
        rel="noreferrer"
        {...agentHandle("seo-sitemap-open-raw-link", {
          role: "link",
          label: "Open the real sitemap.xml file in a new tab",
        })}
      >
        {t(locale, "sitemap.xml ↗")}
      </a>
      {modal.status === "ready" ? (
        <button
          type="button"
          className="btn-secondary"
          aria-pressed={modal.view === "raw"}
          onClick={() => modal.setView(modal.view === "raw" ? "table" : "raw")}
          {...agentHandle("seo-sitemap-raw-toggle", {
            role: "button",
            label: "Toggle between the parsed table and the raw XML response",
          })}
        >
          {modal.view === "raw" ? t(locale, "Table") : t(locale, "Raw XML")}
        </button>
      ) : null}
    </div>
  );
}

/** The parsed-table view: filter box + `URL | Last modified` table, or the empty-filter/empty-
 *  sitemap notices in place of a table with nothing to show. Its own component for the same
 *  flat-sequence-of-blocks reason as {@link SitemapModalHeaderActions}.
 *
 * @complexity O(1) to render — `entries`/`filteredEntries` are already computed by
 *   `useSitemapModal` (memoized there), this only maps them to JSX. */
function SitemapModalTable({ locale, modal }: { locale: string; modal: SitemapModalController }) {
  if (modal.entries.length === 0) return <div className="notice">{t(locale, "The sitemap has no URLs yet.")}</div>;

  const rowHandles = buildAgentListHandles(
    "seo-sitemap-row",
    modal.filteredEntries.map((entry) => entry.loc)
  );

  return (
    <>
      <input
        type="search"
        className="sitemap-modal-filter"
        placeholder={t(locale, "Filter by URL…")}
        value={modal.filter}
        onChange={(e) => modal.setFilter(e.target.value)}
        {...agentHandle("seo-sitemap-filter", {
          role: "field",
          label: "Narrow the sitemap table by a substring match on the URL",
        })}
      />
      {modal.filteredEntries.length === 0 ? (
        <p className="muted-cell">{t(locale, "No URLs match this filter.")}</p>
      ) : (
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th>{t(locale, "URL")}</th>
                <th>{t(locale, "Last modified")}</th>
              </tr>
            </thead>
            <tbody>
              {modal.filteredEntries.map((entry, index) => (
                <tr key={entry.loc}>
                  <td>
                    <a
                      href={entry.loc}
                      target="_blank"
                      rel="noreferrer"
                      {...agentHandle(rowHandles[index]!, { role: "link", label: "Open this URL on the live site" })}
                    >
                      {entry.loc}
                    </a>
                  </td>
                  <td>{entry.lastmod ?? <span className="muted-cell">{t(locale, "—")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** The body's content-status switch (REQ 8/9: disabled, loading, error, then raw-vs-table) — kept
 *  as its own flat sequence of guards rather than a nested ternary inline in {@link SitemapModal}.
 *
 * @complexity O(1) — delegates the actual list rendering to {@link SitemapModalTable}. */
function SitemapModalBody({
  locale,
  sitemapEnabled,
  modal,
}: {
  locale: string;
  sitemapEnabled: boolean;
  modal: SitemapModalController;
}) {
  if (!sitemapEnabled) {
    return (
      <div className="notice">
        {t(locale, 'Sitemap is off. Turn on "Sitemap enabled" above to publish one.')}
      </div>
    );
  }
  if (modal.status === "loading") return <div className="notice">{t(locale, "Loading sitemap…")}</div>;
  if (modal.status === "error") {
    return (
      <div className="notice error" role="alert">
        {modal.error}
      </div>
    );
  }
  if (modal.view === "raw") return <pre className="sitemap-modal-raw">{modal.xmlText}</pre>;
  return <SitemapModalTable locale={locale} modal={modal} />;
}

export function SitemapModal({
  locale,
  sitemapEnabled,
  regenerating,
  onRegenerate,
  onClose,
  useModal = useWiredSitemapModal,
}: SitemapModalProps) {
  const titleId = useId();
  const modal = useModal(onClose);

  /** Only refetches on a successful regenerate (REQ 7) — `onRegenerate` already resolves `false`
   *  on a caught failure (`useSeo`'s own `regenerateSitemap`), so a failed attempt leaves the
   *  currently-shown sitemap exactly as it was rather than re-fetching the same stale content. */
  async function handleRegenerate() {
    const succeeded = await onRegenerate();
    if (succeeded) modal.refetch();
  }

  return (
    <div className="settings-dialog-backdrop" onClick={onClose}>
      <div
        className="settings-dialog sitemap-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sitemap-modal-header">
          <h2 id={titleId}>{sitemapModalTitle(locale, modal)}</h2>
          <SitemapModalHeaderActions locale={locale} modal={modal} />
        </div>

        <div className="sitemap-modal-body">
          <SitemapModalBody locale={locale} sitemapEnabled={sitemapEnabled} modal={modal} />
        </div>

        <div className="widget-picker-footer">
          <span className="editor-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleRegenerate}
              disabled={regenerating}
              {...agentHandle("seo-sitemap-modal-regenerate", {
                role: "button",
                label: "Rebuild the cached sitemap and refresh this view",
              })}
            >
              {actionLabel(regenerating, t(locale, "Working…"), t(locale, "Regenerate sitemap"))}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              {...agentHandle("seo-sitemap-modal-close", { role: "button", label: "Close the sitemap viewer" })}
            >
              {t(locale, "Close")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
