import type { ReactNode } from "react";
import { agentHandle } from "@jini-ai/agentic";

import { adminHref, navigate } from "../../lib/router";
import type { Translate } from "../../lib/dictionary-translator";
import {
  themePageCollisionAdminPath,
  themePagePublishSummary,
  type ThemePageRow,
  type ThemePageSlugCollision,
} from "./hooks/use-theme-pages.hooks";
import { themePagePublishState } from "./lib/theme-page-publish-state";
import { useThemePageDetailsModal } from "./ThemePageDetailsModal.hooks";

/**
 * @file The Theme Pages tab's "Details" info modal — 2026-08-31 owner review pass, replacing the
 * row's old inline "see more" disclosure (`Pages.tsx`'s own header covers that history). Owner:
 * *"that brings up a modal, like an info modal. And that info modal tells you whatever you need to
 * know."* Everything the old inline panel showed (file path, whether there is an original to reset
 * to) still lives here, plus two facts that panel never had room for: the row's own publish state/
 * reason (previously only on the switch itself) and any live content record already claiming this
 * page's slug (`row.collidingContent` — the same fact Theme Studio's Explore screen warns about,
 * `ThemeExplore.tsx`'s `ThemeExploreSlugCollisionWarning`).
 *
 * Same native-`<dialog>` foundation as `@jini-ai/admin/react`'s `ConfirmDialog` (already used by
 * this same screen, `Pages.tsx`'s delete confirmation) — `aria-labelledby` pointing at a visible
 * `<h2>`, rather than `MessageOverflowModal.tsx`'s `aria-label`-only shape: this dialog's title IS
 * the whole page id, worth showing rather than hiding behind an attribute a sighted user never
 * sees. `MessageOverflowModal.tsx` is still the closer precedent for WHY a generic per-row detail
 * modal exists at all (an "I can't show this well inline, so show it in a modal" affordance) — read
 * for that shape, not copied: it is scoped to arbitrary full-size chat content with its own
 * lifecycle hook, and this dialog's content has no side effects of its own, so `ThemePagesTab.tsx`
 * keeps exactly ONE instance of this component always mounted (never one per row — see this file's
 * own hook for why that also means no double-mount risk), toggling only `open`/`row` as the
 * selection changes, the same "controlled, never conditionally unmounted" shape `ConfirmDialog`
 * itself uses.
 *
 * **PART 2 — an Edit action (2026-08-31, owed-work pass; SUPERSEDED by PART 4 below, same day).**
 * This modal briefly offered its own `t("Edit")` button, pointed at the same Theme Studio
 * destination as `ThemePagesTab.tsx`'s own Theme Studio column. The owner then asked for that action
 * to live in the row's `RowMenu` instead, directly under `Details` — see PART 4. Left as history here
 * rather than deleted outright since it explains why `Close` alone can look like an odd choice for a
 * footer without the surrounding context.
 *
 * **PART 3 — visual pass (2026-08-31, same-day follow-up).** Owner: *"looks awful"* — a flat white
 * box with no hierarchy: the page id rendered as a small lowercase word, `File`/`Publish` were
 * undifferentiated `label: value` sentences, two paragraphs of explanatory prose read like
 * documentation, and the collision warning's own "Open {title}" link had no button affordance at
 * all against its amber background. Restructured into named blocks below (kept small enough to stay
 * flat, per this file's own complexity ceiling):
 * - {@link ThemePageDetailsHeader} — a kicker (`t("Page")`) over the id, the same eyebrow/title
 *   pairing `.page-kicker`/`.page-title` already use for "CONTENT" → "Pages" at the screen level
 *   (`styles.css`), just re-declared under this dialog's own class names rather than reusing those
 *   two directly — they are deliberately scoped to `.page-header` (see that rule's own comment on
 *   why), which this dialog is not.
 * - {@link ThemePageDetailsFacts} — `File`/`Publish` as an actual label/value grid (`<dl>`) instead
 *   of two sentences, reusing the exact `t("File")`/`t("Publish")` strings that already existed.
 * - {@link ThemePageDetailsNotes} — the two explanatory asides, grouped and kept at their existing
 *   quiet `.theme-page-details-muted` treatment rather than reading as body prose.
 * - {@link ThemePageDetailsCollisionWarning} — unchanged copy and unchanged trigger condition
 *   (`row.collidingContent` alone, still not gated on publish state — see this component's own
 *   comment for why that gate would hide the exact case this warning exists for), but the action is
 *   now `.btn-warning` — an existing primitive, not a new one — instead of a bare `<a>`, and a small
 *   `aria-hidden` triangle marks the block as a warning before its text is read.
 *
 * No copy changed anywhere in this pass, so `pages-i18n.ts` needed no new keys — every string above
 * is one already covered across all 21 locales.
 *
 * **PART 4 — Edit moved to the row's `RowMenu` (2026-08-31, same-day follow-up to PART 2).** Owner:
 * put `Edit` in the three-dot menu, directly under `Details`, not as a button inside the dialog. The
 * action itself (same Theme Studio destination, same `themeStudioHref`) now lives in
 * `themePageRowMenuItems` (`rules.ts`) and `ThemePagesTab.tsx`'s own `onEdit` handler — see those
 * files' own comments. This modal's footer is `Close` only again; `themeId` is gone from
 * {@link ThemePageDetailsModalProps} entirely rather than kept as a now-dead required prop, since a
 * repo-wide check turned up exactly one caller (`ThemePagesTab.tsx`) and no other reader.
 */

/** Stable id for the dialog's own accessible name — a static constant, not a generated one, since
 *  exactly one instance of this component is ever mounted at a time (see this file's own header). */
const TITLE_ID = "theme-page-details-title";

/**
 * The dialog's opening block — a small-caps `t("Page")` kicker over the page id itself, styled as
 * the actual heading it is (see this file's own header, PART 3) instead of inheriting body-text
 * size. Its own component purely so {@link ThemePageDetailsModal} stays a flat list of blocks.
 *
 * @complexity O(1).
 */
function ThemePageDetailsHeader({ pageId, t }: { pageId: string; t: Translate }): ReactNode {
  return (
    <div className="theme-page-details-header">
      <p className="theme-page-details-kicker">{t("Page")}</p>
      <h2 id={TITLE_ID}>{pageId}</h2>
    </div>
  );
}

/**
 * `File`/`Publish` as a real label/value grid (a `<dl>`, one `dt`/`dd` pair per fact) rather than
 * the two `"Label: value"` sentences this replaced — the two most scannable facts on the screen,
 * so they get their own row instead of blending into paragraph text (this file's own header, PART
 * 3). Same `t("File")`/`t("Publish")` strings as before; only the layout changed.
 *
 * @complexity O(1).
 */
function ThemePageDetailsFacts({ row, t }: { row: ThemePageRow; t: Translate }): ReactNode {
  return (
    <dl className="theme-page-details-facts">
      <div className="theme-page-details-fact">
        <dt>{t("File")}</dt>
        <dd>
          <code>{row.filePath}</code>
        </dd>
      </div>
      <div className="theme-page-details-fact">
        <dt>{t("Publish")}</dt>
        <dd>{themePagePublishSummary(row, t)}</dd>
      </div>
    </dl>
  );
}

/**
 * The toggle explainer and "no original to reset to" note — unchanged copy, grouped into one quiet
 * block instead of two full-weight paragraphs sitting in the middle of the dialog like documentation
 * (this file's own header, PART 3). Returns `null` when neither applies, so
 * {@link ThemePageDetailsModal} never renders an empty wrapper.
 *
 * @complexity O(1).
 */
function ThemePageDetailsNotes({ row, t }: { row: ThemePageRow; t: Translate }): ReactNode {
  const showsToggleHint = themePagePublishState(row, t).kind === "toggle";
  const showsNoOriginalHint = !row.resettable;
  if (!showsToggleHint && !showsNoOriginalHint) return null;
  return (
    <div className="theme-page-details-notes">
      {showsToggleHint ? (
        <p className="theme-page-details-muted">
          {t(
            "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own."
          )}
        </p>
      ) : null}
      {showsNoOriginalHint ? (
        <p className="theme-page-details-muted">
          {t("Added to this theme after it was installed — there is no original to reset to.")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Purely decorative (`aria-hidden`) triangle marking the collision block as a warning before its
 * text is read — the block's own `.notice.warning` background/border already carry the same signal
 * for a screen reader via nothing (color alone), so this is a sighted-only reinforcement same as
 * {@link ThemePageLockGlyph} in `ThemePagesTab.tsx` is for the lock icon, not a second source of
 * truth. Same hand-rolled `viewBox="0 0 24 24"`/`stroke="currentColor"`/`strokeWidth={2}` idiom that
 * icon uses, so both read as one icon language rather than two.
 *
 * @complexity O(1).
 */
function ThemePageCollisionIcon(): ReactNode {
  return (
    <svg
      className="theme-page-details-collision-icon"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/**
 * The slug-collision warning — same copy and same trigger (`row.collidingContent` alone) as before
 * this pass; only the presentation changed (this file's own header, PART 3). Deliberately NOT gated
 * on `row.published` too: a page can be off and still lose the URL race depending on the colliding
 * record's own override, so hiding this behind a publish check would hide exactly the case that
 * caused the original owner confusion this modal exists to prevent (`ThemeExploreSlugCollisionWarning`
 * in `ThemeExplore.tsx` makes the identical call for the identical reason).
 *
 * The action was a bare `<a>` with no button styling — the thing that read as a "broken text input"
 * in the owner's report. It is now `.btn-warning`, an existing primitive already used elsewhere for
 * this exact severity (`styles.css`), not a new class invented for this one dialog.
 *
 * @complexity O(1).
 */
function ThemePageDetailsCollisionWarning({
  collision,
  t,
}: {
  collision: ThemePageSlugCollision;
  t: Translate;
}): ReactNode {
  const adminPath = themePageCollisionAdminPath(collision);
  return (
    <div className="notice warning theme-page-details-collision">
      <div className="theme-page-details-collision-body">
        <ThemePageCollisionIcon />
        <p>
          {t(
            "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone."
          ).replace("{title}", collision.title)}
        </p>
      </div>
      <a
        className="btn-warning"
        href={adminHref(adminPath)}
        onClick={(e) => {
          e.preventDefault();
          navigate(adminPath);
        }}
        {...agentHandle("theme-page-details-collision-open", { role: "link", label: "Open the colliding content record" })}
      >
        {t("Open {title}").replace("{title}", collision.title)}
      </a>
    </div>
  );
}

export interface ThemePageDetailsModalProps {
  /** The row this modal describes, or `null` while closed — `ThemePagesTab.tsx` clears this back to
   *  `null` on close rather than leaving the last-viewed row's data live underneath a closed dialog. */
  row: ThemePageRow | null;
  onClose: () => void;
  t: Translate;
  /** Injectable seam for the dialog's open/close lifecycle. Defaults to the real
   *  {@link useThemePageDetailsModal}; a test can pass a fake here to exercise this component's
   *  rendering without driving the real `<dialog>` lifecycle. */
  useModal?: typeof useThemePageDetailsModal;
}

export function ThemePageDetailsModal({ row, onClose, t, useModal = useThemePageDetailsModal }: ThemePageDetailsModalProps) {
  const { dialogRef, handleNativeCancel, handleBackdropClick } = useModal(row !== null, onClose);

  return (
    <dialog
      ref={dialogRef}
      className="theme-page-details-dialog"
      aria-labelledby={TITLE_ID}
      onCancel={handleNativeCancel}
      onClick={handleBackdropClick}
      {...agentHandle("theme-page-details-dialog", {
        role: "region",
        label: "This theme page's details — file path, publish state, and any colliding content record",
      })}
    >
      {row ? (
        <>
          <ThemePageDetailsHeader pageId={row.pageId} t={t} />
          <ThemePageDetailsFacts row={row} t={t} />
          <ThemePageDetailsNotes row={row} t={t} />
          {row.collidingContent ? <ThemePageDetailsCollisionWarning collision={row.collidingContent} t={t} /> : null}
        </>
      ) : null}
      <div className="theme-page-details-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          {...agentHandle("theme-page-details-close", { role: "button", label: "Close this details dialog" })}
        >
          {t("Close")}
        </button>
      </div>
    </dialog>
  );
}
