import { useCallback } from "react";

import type { AdminPost } from "@/features/posts/api/posts-api.types";
import { navigate as defaultNavigate } from "@jini-ai/admin/shell/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { contentRefreshApplies, subscribeToContentRefresh } from "@jini-ai/admin/shell/lib/content-refresh-bus";
import { usePages, type PagesController } from "@jini-ai/admin/pages/hooks/use-pages.hooks";
import type { PagesEventsPort } from "@jini-ai/admin/pages/hooks/pages-port.hooks";

import { t as translate } from "@jini-ai/admin/pages/pages-i18n";
import { pageAdminPath, PAGES_RESOURCE } from "../rules";
import { defaultPagesPort } from "./pages-dependencies.hooks";

/**
 * @file The host-binding half of the Pages LIST hook pair. `usePages` (the hook that owns every
 * piece of list state and the doc comments recording why) lives in
 * `@jini-ai/admin/pages/hooks/use-pages.hooks`; this file keeps only the zero-argument
 * `useWiredPages()` that binds this app's real values into it — the `/api/.../pages` client
 * (`pages-dependencies.hooks.ts`), `lib/router`'s `navigate`, the content-refresh bus filtered to
 * `PAGES_RESOURCE`, the shared `pageAdminPath` rule (`../rules.ts`, also read by the page editor and
 * the Theme Pages hook), and a `t` bound to the real resolved locale (`useAdminLocale()`, called
 * here and ONLY here). Same `useX(dependencies)` / `useWiredX()` split documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */

/**
 * `pages_write_html` (`apps/website/src/features/pages/agent-tools.ts`) is agent-callable, so the
 * list reloads whenever the content-refresh bus names `PAGES_RESOURCE` — the same filtered-event
 * port shape `integrations/jini-admin/redirects-ports.ts`'s `redirectsEvents` binds.
 */
export const pagesEvents: PagesEventsPort = {
  subscribe(listener) {
    return subscribeToContentRefresh({ listener: scope => { if (contentRefreshApplies({ scope, resource: PAGES_RESOURCE })) listener(); } });
  },
};

/**
 * Binds the real `/api/.../pages` client, `lib/router`'s `navigate`, and a `t` bound to the real
 * resolved locale (`useAdminLocale()`, called here and ONLY here — see this file's header) — see
 * `pages-dependencies.hooks.ts`. The zero-argument half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Pages.tsx` composes this and a test composes {@link usePages} with
 * `createFakePagesPort` and a fake `navigate`/`t`. It also binds the filtered content-refresh port
 * (`pagesEvents` above).
 */
export function useWiredPages(): PagesController<AdminPost> {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => translate({ locale, key }), [locale]);
  const navigate = useCallback((routePath: string) => defaultNavigate({ routePath }), []);
  return usePages({ port: defaultPagesPort, navigate, t, locale, events: pagesEvents, pageAdminPath });
}
