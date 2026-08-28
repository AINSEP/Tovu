import { useEffect, useState } from "react";
import { describeApiError, type AdminPost } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../seo-i18n";
import { defaultSeoPort } from "./seo-dependencies.hooks";
import type { SeoPort } from "./seo-port.hooks";

/**
 * @file Everything `EntryPicker` (the SEO screen's post+page dropdown, REQ-06) does, so it can stay
 * markup only.
 *
 * Extracted verbatim — same state, same effect, same error string.
 *
 * `port` is injected — see `seo-port.hooks.ts` (shared with `use-seo.hooks.ts` and
 * `use-seo-entry-panel.hooks.ts`, since all three read/write the same SEO surface) — rather than
 * importing `lib/api` directly, so a test can describe the picker's list against
 * `createFakeSeoPort` instead of stubbing global `fetch`. `useWiredEntryPicker` below is the
 * zero-argument pair `Seo.tsx` actually mounts.
 */

export interface EntryPickerController {
  entries: AdminPost[] | null;
  error: string | null;
}

export function useEntryPicker(port: SeoPort, locale: string): EntryPickerController {
  const [entries, setEntries] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([port.listPosts(), port.listPages()])
      .then(([posts, pages]) =>
        setEntries([...posts.posts.map((p) => p.post), ...pages.posts.map((p) => p.post)])
      )
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load entries"))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  return { entries, error };
}

/**
 * Binds the real `/api/.../posts` and `/api/.../pages` clients — see `seo-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Seo.tsx` composes
 * this and a test composes {@link useEntryPicker} with `createFakeSeoPort`.
 */
export function useWiredEntryPicker(): EntryPickerController {
  const locale = useAdminLocale();
  return useEntryPicker(defaultSeoPort, locale);
}
