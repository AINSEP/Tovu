import { describeApiError } from "../../../lib/api";
import { useFetchQuery } from "../../../lib/fetch-query";
import { KEYS } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { defaultCommentsPort } from "./comments-dependencies.hooks";
import type { CommentsPort } from "./comments-port.hooks";

/**
 * @file The top-level `Comments()` component's own state: loading the operator's effective
 * permissions, which gate whether `QueueSection`/`SettingsSection` render at all.
 *
 * `QueueSection` and `SettingsSection` are private, unexported sub-components of `Comments.tsx`
 * (its own file header explains why: mirrors `Database.tsx`'s multi-section-single-file shape).
 * Each gets its own hook file (`use-comment-queue.hooks.ts`, `use-comment-settings.hooks.ts`)
 * because each owns independent state, AND (2026-08-14, reversing this file's earlier "only the
 * exported, tested screen gets a seam" rule) its own DI-seam prop — this file's `Comments` was
 * seamed while its own two sections were not, which was an inconsistency within one file rather
 * than a defensible boundary.
 *
 * `port`/`locale` are injected — see `comments-port.hooks.ts` — rather than importing `lib/api`/
 * calling `useAdminLocale()` directly, so a test can describe the permissions load against
 * `createFakeCommentsPort` instead of stubbing global `fetch`. `useWiredComments` below is the
 * zero-argument pair `Comments.tsx` actually mounts.
 *
 * `locale` (standing i18n rule, 2026-08-11 — a component with a hook gets its locale-derived UI
 * copy FROM that hook, not its own `useAdminLocale()` call) is exposed raw, not as a bound `t`:
 * `comments-i18n.ts`'s own `t(locale, key)`/`lib/admin-nav-i18n`'s `translateAdminNavLabel(locale,
 * key)` are pure functions that already take `locale` as an explicit argument — `Comments.tsx` and
 * its `QueueSection`/`SettingsSection` sub-components call those directly throughout (never
 * rebuilding a dictionary lookup inline), so there is no bound closure to inject here, only the
 * raw string those calls need. Same "pure, no-I/O rule stays a direct import" carve-out
 * `pageRowMenuItems` gets in `use-pages.hooks.ts`.
 *
 * `lib/fetch-query` migration (2026-08-12): the permissions load is one `useFetchQuery` keyed on
 * `KEYS.permissions`.
 */

export interface CommentsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  permissions: string[] | null;
  error: string | null;
  /** The raw resolved locale — see this file's own header for why `Comments.tsx` gets this instead
   *  of a bound `t`. */
  locale: string;
}

export interface CommentsDependencies {
  port: CommentsPort;
  locale: string;
}

export function useComments(deps: CommentsDependencies): CommentsController {
  const { port, locale } = deps;
  const list = useFetchQuery({ key: KEYS.permissions, fetch: () => port.me() });

  const permissions = list.data ? (list.data.effectivePermissions ?? []) : null;
  const error = list.error ? describeApiError(list.error, "failed to load permissions") : null;

  return { permissions, error, locale };
}

/**
 * Binds the real `/api/.../auth/me` client and the resolved `useAdminLocale()` value — see
 * `comments-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Comments.tsx`
 * composes this and a test composes {@link useComments} with `createFakeCommentsPort`.
 */
export function useWiredComments(): CommentsController {
  const locale = useAdminLocale();
  return useComments({ port: defaultCommentsPort, locale });
}
