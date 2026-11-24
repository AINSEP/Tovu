import { Pages as JiniPages, type PagesListPaths, type PagesListSorting } from "@jini-ai/admin/pages/Pages";
import type { Translate } from "@jini-ai/core/text";

import type { AdminPost } from "../posts/api/posts-api.types";
import {
  compareAdminPostsByTitle, compareAdminPostsBySlug, compareAdminPostsByStatus, compareAdminPostsByUpdated,
  columnSortLabel, updatedColumnSortLabel, DEFAULT_ADMIN_POST_SORT,
} from "../../lib/admin-post-list-sort";
import { siteUrl } from "../../lib/site-url";
import { ServerLabel } from "@/components/status-labels";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";
import { pageAdminPath, pagePublicPath } from "./rules";
import { useWiredPages } from "./hooks/use-pages.hooks";
import { useWiredThemePages, type ThemePagesController } from "./hooks/use-theme-pages.hooks";
import { ThemePagesTab } from "./ThemePagesTab";

/**
 * @file Host wiring for the Pages list screen. The screen itself (markup, columns, tab chrome,
 * confirm copy — and the "why" of each) is `@jini-ai/admin/pages/Pages`; this file binds this app's
 * real values into it: the wired "My Pages" hook, the Theme Pages hook + tab body (themes stay in
 * this app), the publish-section button, the localized server-status label, the column comparators
 * and sort labels `lib/admin-post-list-sort.ts` shares with the Posts list, and the page link rules
 * (`./rules.ts`'s `pageAdminPath`/`pagePublicPath`, shared with the page editor, plus `siteUrl`).
 *
 * `panels.tsx` still reaches this through `./index.ts` (lazy `panel-pages.ts` chunk), unchanged.
 */

const PAGES_SORTING: PagesListSorting<AdminPost> = {
  defaultSort: DEFAULT_ADMIN_POST_SORT,
  compareByTitle: compareAdminPostsByTitle,
  compareBySlug: compareAdminPostsBySlug,
  compareByStatus: compareAdminPostsByStatus,
  compareByUpdated: compareAdminPostsByUpdated,
  columnSortLabel,
  updatedColumnSortLabel,
};

const PAGES_PATHS: PagesListPaths = { pageAdminPath, pagePublicPath, siteUrl };

/** Hands the Theme Pages controller's own fields to this app's `ThemePagesTab` — the same
 *  field-by-field mapping the screen used to do inline before it moved to `@jini-ai/admin`. */
function BoundThemePagesTab({ controller, t }: { controller: ThemePagesController; t: Translate }) {
  return (
    <ThemePagesTab
      pages={controller.pages}
      activeThemeId={controller.activeThemeId}
      error={controller.error}
      savingPageId={controller.savingPageId}
      setPagePublished={controller.setPagePublished}
      t={t}
    />
  );
}

export interface PagesProps {
  hooks?: { usePagesHook: typeof useWiredPages; useThemePagesHook: typeof useWiredThemePages };
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`, and `features/posts/Posts.tsx`'s `usePostsHook`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives this component through any state —
   * mid-delete, load failure, empty list — without module mocking, a fake `fetch`, or waiting on a
   * real request. That matters here specifically: this screen has no unit test today.
   */
  usePagesHook?: typeof useWiredPages;
  /** Same DI seam as `usePagesHook`, for the Theme Pages tab's own data source. */
  useThemePagesHook?: typeof useWiredThemePages;
}

/**
 * Resolves `Pages`'s two injectable-seam props to their real implementations when a caller passes
 * none — same `??`-avoidance idiom `MenuEditor.tsx`'s `orEmpty`/`AssistantDock.tsx`'s/`App.tsx`'s
 * resolver groups use (2026-08-14, DI migration sweep's complexity follow-up): ESLint's
 * cyclomatic-complexity rule counts a default parameter value inside a function's OWN body as one
 * of that function's own branches — a call out to a separately-scoped resolver does not. Only
 * these two data-fetching seams are touched; `Pages`'s local `activeTab` chrome state (owner
 * ruling, see that declaration's own comment in `@jini-ai/admin/pages/Pages`) is untouched by this
 * pass.
 */
function resolvePagesHook({ override }: { override: typeof useWiredPages | undefined }, _options = {}): typeof useWiredPages {
  return override ?? useWiredPages;
}
function resolveThemePagesHook({ override }: { override: typeof useWiredThemePages | undefined }, _options = {}): typeof useWiredThemePages {
  return override ?? useWiredThemePages;
}

export function Pages(props: PagesProps) {
  const { hooks = { usePagesHook: resolvePagesHook({ override: props.usePagesHook }), useThemePagesHook: resolveThemePagesHook({ override: props.useThemePagesHook }) } } = props;
  return (
    <JiniPages
      usePagesHook={hooks.usePagesHook}
      useThemePagesHook={hooks.useThemePagesHook}
      ThemePagesTab={BoundThemePagesTab}
      PublishSectionButton={PublishSectionButton}
      ServerLabel={ServerLabel}
      sorting={PAGES_SORTING}
      paths={PAGES_PATHS}
    />
  );
}
