import "../../styles/theme-pages-tab.css";
import { DataTable, RowMenu } from "@jini-ai/admin/react";
import { useState, type ReactNode } from "react";

import type { Translate } from "../../lib/dictionary-translator";
import { InfoTip } from "../../components/InfoTip";
import { navigate } from "../../lib/router";
import { siteUrl } from "../../lib/site-url";
import type { ThemePageRow } from "./hooks/use-theme-pages.hooks";
import { themePageRowMenuItems } from "./rules";
import { ThemePageDetailsModal } from "./ThemePageDetailsModal";
import {
  themePagePublishState,
  themePagePublishTooltip,
  themeStudioHref,
  themePagePublicLinkState,
  type ThemePagePublishState,
} from "./lib/theme-page-publish-state";

/**
 * @file The "Theme Pages" tab body — split out of `Pages.tsx` (2026-08-30, deep-link/publish-toggle
 * pass), then reworked three more times on owner review (2026-08-31, all three) once "match My
 * Pages, modal not inline disclosure" became the actual ask:
 *
 * 1. **Column shape now matches `Pages.tsx`'s own "My Pages" tab.** Same `DataTable` `columns` API,
 *    same shared `RowMenu` (`@jini-ai/admin/react`, also used by Users/Roles/Members/
 *    `AccessTokensTab`) in a `More` column — this tab used to be visually its own thing (a bare
 *    Publish cell with no row menu at all); it now reads as My Pages' sibling, not a different
 *    screen. Every row renders the SAME five columns (page id, public URL, Theme Studio, publish
 *    switch, `More`) — the table's shape never depends on which row it is.
 * 2. **Per-row detail lives in a MODAL, never an inline expander.** The old "see more" button used
 *    to reflow the row in place, dropping loose text into the Publish cell — the owner's own words:
 *    *"this reorganization when you click see more... looks awful."* That disclosure is gone
 *    entirely; the `More` column's `RowMenu` `Details` item opens `ThemePageDetailsModal.tsx`
 *    instead, which shows everything the old panel did (file path, whether there is an original to
 *    reset to) plus the row's own publish reason and any colliding content record — see that file's
 *    own header. Exactly one modal instance is ever mounted (the `detailPageId` state below), never
 *    one per row. The SAME menu's `Edit` item (2026-08-31, moved out of the modal's own footer per
 *    that file's header, PART 3) navigates straight to Theme Studio — `handlers.onEdit` here is the
 *    one place that calls `navigate(themeStudioHref(...))` for it, matching `rules.ts`'s own
 *    `ThemePageRowMenuHandlers` doc on why that module stays free of navigation itself.
 * 3. **PART 1 — the single "URL" column was a real mislabel, now split in two.** It carried the
 *    header `"URL"` but its `<a href>` was always `themeStudioHref` — the theme studio, not the
 *    page's own public address. There are genuinely two different destinations a row can offer, so
 *    there are now two columns: `"URL"` ({@link ThemePagePublicUrlCell}, the actual public-site
 *    address, `siteUrl(...)`-based, external — same `target="_blank" rel="noreferrer"` treatment
 *    `Posts.tsx`'s Slug column uses) and `"Theme Studio"` (unchanged destination/treatment, just its
 *    own column now, cell text `t("Edit")` rather than the path — showing a path as the STUDIO
 *    link's own text was half of the original mislabel). See {@link ThemePagePublicUrlCell}'s own
 *    doc for the three cases that column has to get right: `index` is genuinely live at `/`; `404`
 *    and a declared template shell have no public address at all (not "a URL that 404s" — no
 *    address); every other row's address exists but 404s until its Publish switch is on, since theme
 *    pages ship unpublished by default (2026-08-30).
 *
 * Still read-only in the sense that matters most: there is no `PostRecord` behind a theme page, so
 * `RowMenu`'s two actions are "show me everything about this row" and "take me to the one place I
 * can actually change it", not edit/disable/delete in the `My Pages` sense — see `Pages.tsx`'s own
 * header for why this tab is deliberately kept separate from My Pages' actual database rows.
 *
 * `Edit` now appears TWICE per row — once in this menu, once in the `Theme Studio` column (same
 * `themeStudioHref` destination both places, not two different links). Left as-is rather than
 * collapsed: the `Theme Studio` column is recent, deliberate work (splitting the old mislabeled
 * single "URL" column into a real public-site link and a real Theme Studio link, PART 1 above), the
 * owner asked for `Edit` specifically IN the row menu on top of that, and nothing here says the
 * column is meant to go away — flagged for the owner to decide, not removed on this pass's own
 * judgment.
 */

/** The publish switch for one row — mirrors `ThemeExplore.tsx`'s `ThemeExplorePublishToggle` markup
 *  and accessibility contract exactly (`role="switch"`, `aria-checked`, never colour-only, a locked
 *  switch fixed to its true position), reused here as its own small component rather than imported:
 *  that component lives in a file another pass is actively editing this same session, and it is
 *  scoped to Explore's single SELECTED file, not a list of N simultaneously visible rows. Deliberately
 *  reuses the SAME CSS classnames (`theme-explore-switch`, `theme-explore-switch-knob`) rather than
 *  new ones — those rules are generic (a labelled boolean switch), already ship in `styles.css`, and
 *  this file makes no edits there, so reusing them costs nothing and keeps the two screens visually
 *  identical for free.
 *
 * **`btn-toggle-switch` — the white-on-white fix (2026-08-31, owner-reported bug).** Every row here
 * sits inside a `.list-table td` (`DataTable`'s own markup), which is exactly the context
 * `styles.css`'s row-action reset (`.list-table td button:not([class*="btn-"]):not(.link-button)`)
 * targets — and that selector's specificity, (0,3,2), OUTRANKS `.theme-explore-switch.is-on`'s
 * (0,2,0) at the tie-broken type-tier, silently overriding this switch's on/off/disabled background
 * to the same flat `var(--surface)` regardless of state. This was the root cause of the owner's
 * reported bug: a locked-ON switch (`index`/`404`) rendered with NO colour distinction from a
 * genuinely off, switchable one, because neither one was ever showing its real background at all
 * inside this table. `styles.css`'s own comment on that reset documents the sanctioned escape —
 * "excludes any button that already opted into an explicit variant... via `[class*="btn-"]`" — so
 * this adds that substring-matching class rather than fighting the specificity war with a `.list-
 * table`-scoped override (which would need FOUR chained classes to win outright — an ugly, fragile
 * `.a.a.a.a` shape, and would also have to be reordered relative to nothing since specificity, not
 * source order, is what is losing here). The `btn-toggle-switch` class carries no rules of its own;
 * it exists purely to make the exclusion's `[class*="btn-"]` test match, so `.theme-explore-switch`'s
 * OWN existing rules (unedited) finally apply as intended, inside a table cell exactly as they
 * already do inside Explore's toolbar div. See `styles.css`'s own reset comment for the matching
 * note on this specific collision.
 *
 * Renders no `<span>` label and no inline reason text — both replaced by
 * {@link ThemePagePublishCell}'s own per-row `InfoTip` (locked rows only) and the full reason inside
 * `ThemePageDetailsModal.tsx`.
 *
 * @complexity O(1) — one fixed control, no iteration.
 */
function ThemePagePublishToggle({
  row,
  state,
  saving,
  onSetPublished,
  t,
}: {
  row: ThemePageRow;
  state: ThemePagePublishState;
  saving: boolean;
  onSetPublished: (published: boolean) => void;
  t: Translate;
}): ReactNode {
  const on = state.kind === "toggle" ? state.published : state.on;
  // Locked forever; a live toggle is additionally disabled for the duration of its own round trip —
  // same "can't act while the very action it's for is in flight" shape `ThemeExplorePublishToggle`
  // uses, narrowed to THIS row rather than the whole screen (see `Pages.tsx`'s `savingPageId`).
  const disabled = state.kind === "locked" || saving;

  function handleClick() {
    if (state.kind === "toggle") onSetPublished(!state.published);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${t("Publish")} ${row.pageId}`}
      className={on ? "theme-explore-switch btn-toggle-switch is-on" : "theme-explore-switch btn-toggle-switch"}
      disabled={disabled}
      onClick={handleClick}
    >
      <span className="theme-explore-switch-knob" aria-hidden="true" />
    </button>
  );
}

/**
 * A small padlock glyph — the SHAPE-based signal that a switch's fixed position is LOCKED, not
 * merely a dim copy of the off state. Owner-reported bug (2026-08-31): a locked-ON switch
 * (`index`/`404`) rendered indistinguishable from a genuinely off, switchable one at a glance —
 * `.theme-explore-switch.is-on:disabled`'s green background under the plain `:disabled` rule's
 * `opacity: 0.6` (`styles.css`) reads as "barely-there grey" on an ordinary screen, and the knob's
 * own left/right position — the other, supposedly colour-independent signal — is too small a shift
 * to register at a glance. This glyph's PRESENCE means "this position cannot change", independent of
 * the switch's own on/off colour or knob position, which still carry the actual boolean untouched.
 *
 * `aria-hidden`: the lock state is already accessible via the switch's own `disabled` attribute and
 * the adjoining `InfoTip`'s reason text — this is a sighted-only reinforcement, not a second source
 * of truth a screen reader needs read aloud a third time.
 *
 * @complexity O(1).
 */
function ThemePageLockGlyph(): ReactNode {
  return (
    <svg
      className="theme-page-lock-glyph"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * The whole Publish cell for one row: the switch, plus — on a locked row only — a lock glyph and an
 * `InfoTip` carrying the lock reason. A real candidate row's full detail (file path, reset/collision
 * state) no longer lives beside the switch at all; it moved into `ThemePageDetailsModal.tsx`
 * (2026-08-31 owner review pass — see this file's own header), reachable from the row's `More` menu
 * instead. That is also why this cell no longer takes an `expanded`/`onToggleExpanded` pair: nothing
 * here toggles in place any more.
 *
 * @complexity O(1) — one fixed set of mutually exclusive branches, no iteration.
 */
function ThemePagePublishCell({
  row,
  saving,
  onSetPublished,
  t,
}: {
  row: ThemePageRow;
  saving: boolean;
  onSetPublished: (published: boolean) => void;
  t: Translate;
}): ReactNode {
  const state = themePagePublishState(row, t);

  return (
    <div className="theme-page-publish-cell">
      <ThemePagePublishToggle row={row} state={state} saving={saving} onSetPublished={onSetPublished} t={t} />
      {state.kind === "locked" ? (
        <>
          <ThemePageLockGlyph />
          <InfoTip label={themePagePublishTooltip(state)} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The public-site URL cell for one row — the actual address on the public origin, or the fact that
 * there isn't one, reusing {@link themePagePublicLinkState} rather than re-deriving the
 * index/locked/toggle split inline (PART 1, this file's own header). Three renders, one per state:
 *
 * - `"live"` — a real external link, `siteUrl(path)`, `target="_blank" rel="noreferrer"` — the same
 *   external-destination treatment `Posts.tsx`'s Slug column already uses (this tab's own file
 *   header names it as the reference).
 * - `"not-live"` — the address as plain (non-link) text: presenting it as a working link would be a
 *   dead link, since theme pages ship unpublished by default and most rows 404 on the real site
 *   today. `.theme-page-url-not-live` is the same flat `color: var(--muted)` idiom
 *   `.theme-page-details-muted` already uses (`styles.css`), just scoped to this table cell.
 * - `"none"` — no address at all (`404`, a declared template shell): also plain text, and
 *   specifically NOT "a link that happens to 404" — there is nothing to link to.
 *
 * @complexity O(1) — one derived state, three mutually exclusive branches, no iteration.
 */
function ThemePagePublicUrlCell({ row, t }: { row: ThemePageRow; t: Translate }): ReactNode {
  const link = themePagePublicLinkState(row, t);
  if (link.kind === "none") {
    return <span className="theme-page-no-url">{t("No direct URL")}</span>;
  }
  if (link.kind === "not-live") {
    return <span className="theme-page-url-not-live">{link.path}</span>;
  }
  return (
    <a href={siteUrl(link.path)} target="_blank" rel="noreferrer">
      {link.path}
    </a>
  );
}

/**
 * The "Theme Pages" tab body — one row per candidate/locked page the active theme ships, laid out as
 * `Pages.tsx`'s own "My Pages" tab is: a plain `DataTable`, a shared `RowMenu` in a `More` column,
 * nothing that reflows a row in place. `DataTable<ThemePageRow>` rather than the bare
 * `DataTable<string>` this used to be, now that a row carries publish/reset/collision state
 * alongside its id.
 *
 * `detailPageId` is pure interactive DOM-chrome state — which row's detail modal is open, no I/O
 * behind it — so it stays local here rather than moving into `use-theme-pages.hooks.ts`, the same
 * line `Pages.tsx`'s own `activeTab` comment draws for this screen's other view-only state. `null`
 * means the modal is closed; `ThemePageDetailsModal` itself is always mounted (never conditionally
 * rendered per row) so there is exactly one live instance, matching that component's own doc.
 *
 * @complexity Time/space: O(n) in `pages.length` for the one render pass; every other branch is
 * O(1).
 */
export function ThemePagesTab({
  pages,
  activeThemeId,
  error,
  savingPageId,
  setPagePublished,
  t,
}: {
  pages: ThemePageRow[] | null;
  activeThemeId: string | null;
  error: string | null;
  savingPageId: string | null;
  setPagePublished: (pageId: string, published: boolean) => void;
  t: Translate;
}): ReactNode {
  const [detailPageId, setDetailPageId] = useState<string | null>(null);

  if (error && !pages) return <div className="notice error">{error}</div>;
  // `activeThemeId` is gated together with `pages` rather than separately: both land from the same
  // chained load, so this second condition is unreachable in practice — it exists to make a row
  // with page data but no theme id UNREPRESENTABLE in the markup below, since that state could only
  // render a `?theme=` pointing at nothing. Narrowing it to `themeId` here also lets the `cell`
  // closures below see a plain `string`, which a destructured parameter would not carry.
  if (!pages || activeThemeId === null) return <div className="notice">{t("Loading theme pages…")}</div>;
  const themeId = activeThemeId;
  const detailRow = pages.find((p) => p.pageId === detailPageId) ?? null;

  return (
    <>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={pages}
        rowKey={(row) => row.pageId}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No theme pages.")}</p>
              <p className="page-description">
                {t("The active theme doesn't ship any of its own static pages.")}
              </p>
            </div>
          </div>
        }
        columns={[
          { key: "page", header: t("Page"), cell: (row) => row.pageId },
          {
            key: "url",
            header: t("URL"),
            cell: (row) => <ThemePagePublicUrlCell row={row} t={t} />,
          },
          {
            key: "themeStudio",
            header: t("Theme Studio"),
            // No `target`/`rel`: this is an in-app admin destination, and
            // `installInternalLinkInterceptor` (`@jini-ai/admin/browser`) deliberately declines to
            // intercept any anchor carrying a `target`, so `_blank` would cost a full SPA reload in
            // a second tab.
            cell: (row) => <a href={themeStudioHref(themeId, row.pageId)}>{t("Edit")}</a>,
          },
          {
            key: "publish",
            header: t("Publish"),
            cell: (row) => (
              <ThemePagePublishCell
                row={row}
                saving={savingPageId === row.pageId}
                onSetPublished={(published) => setPagePublished(row.pageId, published)}
                t={t}
              />
            ),
          },
          {
            key: "actions",
            header: t("More"),
            cell: (row) => (
              <RowMenu
                triggerLabel={`Actions for "${row.pageId}"`}
                items={themePageRowMenuItems(
                  row,
                  { onOpenDetails: setDetailPageId, onEdit: (pageId) => navigate(themeStudioHref(themeId, pageId)) },
                  t
                )}
              />
            ),
          },
        ]}
      />
      <ThemePageDetailsModal row={detailRow} onClose={() => setDetailPageId(null)} t={t} />
    </>
  );
}
