import { useState } from "react";
import { describeApiError } from "@/lib/api";
import { useFetchMutation } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { assignedTermsMessage, t } from "../collections-i18n";
import { defaultTermPickerPort } from "./term-picker-dependencies.hooks";
import type { TermPickerPort } from "./term-picker-port.hooks";

/**
 * @file `TermPicker`'s own state and async action, extracted so it is reachable from `renderHook`
 * without rendering `CollectionEntryEditor`'s surrounding editor shell. `TermPicker` is a nested
 * sub-component, but it owns a genuinely separate stateful unit (its own selection set, its own
 * save-in-flight/message/error, its own `assignTerms` call) — not a piece of the parent editor's
 * state — so it gets its own hook rather than folding into `use-collection-entry-editor.hooks.ts`.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/collections` needs it;
 * promote to `src/hooks/` only when a second feature actually does.
 *
 * `port`/`locale` are injected — see `term-picker-port.hooks.ts` — rather than reaching `lib/api`/
 * `useAdminLocale()` directly, so a test can describe the assign outcome against
 * `createFakeTermPickerPort` instead of stubbing global `fetch`. `useWiredTermPicker` below is the
 * pair `CollectionEntryEditor.tsx` actually mounts.
 *
 * `lib/fetch-query` migration (2026-08-12): `assignTerms` is a `useFetchMutation` with no
 * `invalidates` — matching the pre-migration behavior, which never reloaded anything after a
 * successful assign (only cleared the local selection); term assignment isn't part of any cached
 * `AdminEntry`/`AdminContentType` read this feature tracks.
 */

export interface TermPickerController {
  selected: Set<string>;
  toggle: (termId: string) => void;
  saving: boolean;
  message: string | null;
  error: string | null;
  assign: () => Promise<void>;
}

export interface TermPickerDependencies {
  port: TermPickerPort;
  locale: string;
}

export function useTermPicker(
  props: { contentType: string; contentId: string },
  deps: TermPickerDependencies
): TermPickerController {
  const { port, locale } = deps;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const assignMutation = useFetchMutation({
    run: (input: { contentType: string; contentId: string; termIds: string[] }) => port.assignTerms(input),
  });

  function toggle(termId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  async function assign() {
    if (selected.size === 0) return;
    setMessage(null);
    const submitted = [...selected];
    try {
      await assignMutation.mutate({ contentType: props.contentType, contentId: props.contentId, termIds: submitted });
      setMessage(assignedTermsMessage(locale, submitted.length));
      // Only drop the ids that were actually part of this request — a checkbox ticked while the
      // request was in flight is a separate, not-yet-submitted selection and must survive (M1).
      setSelected((current) => {
        const next = new Set(current);
        for (const id of submitted) next.delete(id);
        return next;
      });
    } catch {
      // already surfaced through assignMutation.error -> error below
    }
  }

  const saving = assignMutation.status === "pending";
  const error = assignMutation.error ? describeApiError(assignMutation.error, t(locale, "Failed to assign terms")) : null;

  return { selected, toggle, saving, message, error, assign };
}

/**
 * Binds the real `/api/.../taxonomy/assign-terms` client and the resolved `useAdminLocale()` value
 * — see `term-picker-dependencies.hooks.ts`. The zero-argument-deps half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `CollectionEntryEditor.tsx` composes this and a
 * test composes {@link useTermPicker} with `createFakeTermPickerPort`.
 */
export function useWiredTermPicker(props: { contentType: string; contentId: string }): TermPickerController {
  const locale = useAdminLocale();
  return useTermPicker(props, { port: defaultTermPickerPort, locale });
}
