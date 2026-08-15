import { useEffect, useRef, useState } from "react";

import { describeApiError, type AdminDockerfileSource } from "../../../lib/api";
import { useFetchMutation, useFetchQuery } from "../../../lib/fetch-query";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { useDirtyGuard } from "../../../hooks/use-dirty-guard.hooks";
import { t as defaultT, dockerfileLoadErrorMessage, dockerfileSaveErrorMessage } from "../deployment-i18n";
import type { Translate } from "../../../lib/dictionary-translator";
import { defaultDockerfileSourcePort } from "./dockerfile-source-dependencies.hooks";
import type { DockerfileSourcePort } from "./dockerfile-source-port.hooks";

/**
 * @file Everything the Dockerfile tab does — load, edit, save, and the copy-to-clipboard
 * interaction — so `DockerfileTab.tsx` is only markup.
 *
 * ## 2026-08-15 — the tab gained a write half
 *
 * The backend (`PUT .../system/dockerfile`, `api.setDockerfileSource`,
 * `features/deployments/dockerfile.ts`'s `writeDockerfileSource`) landed the same day as this
 * change and was already wired through `dockerfile-source-port.hooks.ts`/
 * `dockerfile-source-dependencies.hooks.ts` before this hook touched it — see those files' own
 * headers. `DockerfileTab.tsx`'s OWN header used to claim "there is no write route" as the reason
 * this tab was read-only; that had gone stale (the write route existed, the frontend just hadn't
 * been wired to it yet) and is corrected as part of this pass, not left standing.
 *
 * `snapshot`/`draft` are deliberately two different pieces of state, not one: `snapshot` is the
 * last value this hook knows the SERVER holds (from the initial load, or echoed back by a
 * successful save); `draft` is the operator's live edit buffer, seeded from `snapshot` once and
 * otherwise touched only by `setDraft`/a successful `save()`. Same split `use-form-editor.hooks.ts`
 * draws between `list.data` and `form`/`name`/`slug`/etc., and for the identical reason: an
 * in-progress edit must survive a background refresh of the same query key without being clobbered
 * (see `seededRef` below).
 *
 * `save()` calls `setDockerfileSource` through `useFetchMutation` with NO `invalidates` — there is
 * no sibling list resource for a single repo-root file, and the mutation's own response is a fresher
 * answer than a redundant re-`GET` of the same key would be. `snapshot`/`draft` are set directly
 * from that response instead, mirroring `use-form-editor.hooks.ts`'s `handleSave` (which invalidates
 * only the sibling `KEYS.list`, never its own `KEYS.form(id)` read) and
 * `use-widget-region-editor.hooks.ts`'s `save()` (though that one DOES re-`load()`, for a reason
 * that does not apply here — it reconciles a version counter for OTHER placements that may have
 * changed shape; a Dockerfile write has no analogous server-side transform to reconcile).
 */

export interface DockerfileSourceController {
  /** The last value this hook knows the server holds — `undefined` until the first successful
   *  load. Distinct from {@link draft}: see this file's header for why the split exists. */
  snapshot: AdminDockerfileSource | undefined;
  /** The editable buffer `DockerfileTab.tsx`'s textarea is bound to. Seeded from `snapshot` once
   *  it first loads (or once a save creates it, for the "no Dockerfile yet" case), and otherwise
   *  driven entirely by {@link setDraft} and a successful {@link save}. */
  draft: string;
  setDraft: (value: string) => void;
  /** Whether `draft` differs from `snapshot`'s own contents — drives the "Unsaved changes" pill
   *  and, via `useDirtyGuard`, a native `beforeunload` prompt against losing an un-saved edit by
   *  closing or reloading the tab. Always `false` before `snapshot` has loaded. */
  isDirty: boolean;
  /** Already-formatted, translated LOAD error — `null` while loading or once loaded successfully.
   *  Distinct from {@link saveError}: a failed load and a failed save are different failures that
   *  can both be true at once (load succeeded earlier, THIS save attempt just failed). */
  error: string | null;
  /** True while a `save()` call is in flight. */
  saving: boolean;
  /** Already-formatted, translated SAVE error from the most recent {@link save} call — `null` until
   *  a save fails, and reset to `null` at the start of every new attempt. */
  saveError: string | null;
  /** True for a short window right after a successful {@link save} — drives a transient "Saved"
   *  confirmation next to the Save button, on the theory that "the Unsaved-changes pill went away"
   *  is not, by itself, an obviously-noticed success signal. Same `setTimeout(..., 1500)` reset
   *  idiom as {@link copied}. */
  saved: boolean;
  /** True for a short window right after a successful {@link copy} — drives the button's
   *  "Copied!" label. Mirrors `copyHash`'s `setTimeout(..., 1500)` reset in
   *  `use-edit-media-panel.hooks.ts`. */
  copied: boolean;
  /** Writes {@link draft} (not `snapshot` — the operator's current edit, which is what's actually
   *  on screen) to the clipboard, if there's anything to write. Swallows a denied clipboard
   *  permission the same way `copyHash`/`copyUrl` do. */
  copy: () => Promise<void>;
  /** Persists {@link draft} via `PUT .../system/dockerfile`, creating the file if it didn't exist
   *  yet. Resolves either way (a failure is surfaced through {@link saveError}, not a thrown
   *  rejection) — callers don't need a try/catch of their own. */
  save: () => Promise<void>;
  /** Bound translator — see this file's header. */
  t: Translate;
}

export function useDockerfileSource(
  port: DockerfileSourcePort,
  t: Translate,
  locale: string
): DockerfileSourceController {
  const query = useFetchQuery({
    key: ["deployment", "dockerfile"],
    fetch: () => port.getDockerfileSource(),
  });
  const [snapshot, setSnapshot] = useState<AdminDockerfileSource | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Seeds `snapshot`/`draft` from the query's first successful load, exactly once — a LATER
  // background refetch of the same `["deployment", "dockerfile"]` key (the 10s `staleTime` window,
  // or a remount) must not clobber an in-progress, unsaved edit. Same guard shape
  // `use-form-editor.hooks.ts`'s `seededFormIdRef` uses; a plain boolean here rather than an
  // identity comparison because this key has no id to key off — it names one fixed file.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || query.status === "loading" || !query.data) return;
    seededRef.current = true;
    setSnapshot(query.data);
    setDraft(query.data.contents ?? "");
  }, [query.status, query.data]);

  const error = query.error
    ? dockerfileLoadErrorMessage(locale, describeApiError(query.error, "unknown error"))
    : null;

  // No `invalidates` — see this file's header for why a redundant re-`GET` of this hook's own read
  // key would be strictly worse than the response already in hand.
  const saveMutation = useFetchMutation({
    run: (contents: string) => port.setDockerfileSource(contents),
  });

  const { isDirty } = useDirtyGuard(draft, snapshot ? (snapshot.contents ?? "") : null);

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — see this file's header.
    }
  }

  async function save() {
    try {
      const updated = await saveMutation.mutate(draft);
      setSnapshot(updated);
      setDraft(updated.contents ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // already surfaced through saveMutation.error -> saveError below
    }
  }

  const saveError = saveMutation.error
    ? dockerfileSaveErrorMessage(locale, describeApiError(saveMutation.error, "unknown error"))
    : null;

  return {
    snapshot,
    draft,
    setDraft,
    isDirty,
    error,
    saving: saveMutation.status === "pending",
    saveError,
    saved,
    copied,
    copy,
    save,
    t,
  };
}

/**
 * Binds the real `/api/.../system/dockerfile` client, and a `t` bound to the real resolved locale.
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair — see
 * `use-deployment-overview.hooks.ts`'s `useWiredDeploymentOverview` for the identical shape.
 */
export function useWiredDockerfileSource(): DockerfileSourceController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return useDockerfileSource(defaultDockerfileSourcePort, t, locale);
}
