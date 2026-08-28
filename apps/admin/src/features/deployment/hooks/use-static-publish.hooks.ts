import { useEffect, useRef, useState } from "react";

import {
  describeApiError,
  type AdminPublishRunSnapshot,
  type AdminStaticPublishConfig,
  type AdminStaticPublishPreview,
  type AdminStaticPublishTargetId,
} from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import {
  t as defaultT,
  publishLoadErrorMessage,
  publishPollErrorMessage,
  publishPreviewErrorMessage,
  publishTriggerErrorMessage,
} from "../deployment-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultStaticPublishPort } from "./static-publish-dependencies.hooks";
import type { StaticPublishPort } from "./static-publish-port.hooks";

/**
 * @file Everything the Static Site tab's "Getting it online" provider form does — target selection,
 * the owner/repo/branch/teamId/projectName fields, the preview action, and the publish
 * trigger+poll — so `StaticSiteTab.tsx` is only markup. Wired 2026-08-15 against
 * `src/server/routes/admin/system/publish-site.ts`'s three routes (preview, trigger, status).
 *
 * ## One form, four shapes
 *
 * `owner`/`repo`/`branch` only mean anything for `target === "github-pages"`; `teamId` only for
 * `"vercel"`; netlify and cloudflare-pages use neither — both carry no target-specific field at all
 * (see `AdminStaticPublishConfig`'s own doc in `lib/api.ts`). Rather than four parallel sets of
 * fields (or unmounting/remounting a whole sub-form per target, which would lose whatever the
 * operator already typed if they toggle back), this hook keeps ALL five text fields in state at once
 * and {@link buildConfig} reads only the ones the current `target` uses — switching targets never
 * discards another target's half-filled fields, so a reader who taps between providers while
 * deciding doesn't lose work either way.
 *
 * ## `basePath` is never a field here
 *
 * There is no `setBasePath` anywhere in this file, on purpose — `AdminStaticPublishConfig` (the
 * wire type) has no such field either. The base path is always what `preview.basePath`/
 * `run.result.basePath` REPORT the server already computed, never something this form could send
 * back. See `static-publish/adapter.ts`'s `computeBasePath` for why that is structural, not a
 * missing feature.
 *
 * ## `preview` is invalidated by every field edit
 *
 * A stale preview computed against a DIFFERENT owner/repo would show the wrong base path next to a
 * form the operator has since changed — worse than showing nothing, since it looks current. Every
 * setter below clears `preview`/`previewError` as a side effect, so the "Preview" affordance always
 * either reflects the fields currently on screen or is honestly empty.
 */
export interface StaticPublishController {
  target: AdminStaticPublishTargetId;
  setTarget: (target: AdminStaticPublishTargetId) => void;
  owner: string;
  setOwner: (value: string) => void;
  repo: string;
  setRepo: (value: string) => void;
  branch: string;
  setBranch: (value: string) => void;
  teamId: string;
  setTeamId: (value: string) => void;
  projectName: string;
  setProjectName: (value: string) => void;

  /** The most recent preview result — `undefined` until {@link checkPreview} has resolved at least
   *  once since the fields were last edited (see this file's header). */
  preview: AdminStaticPublishPreview | undefined;
  previewLoading: boolean;
  previewError: string | null;
  /** Runs a preview against the CURRENT field values for the CURRENT target. Resolves either way — a
   *  failure is surfaced through {@link previewError}. */
  checkPreview: () => Promise<void>;

  /** The current/most recent publish run — `undefined` until the first status read resolves. */
  run: AdminPublishRunSnapshot | undefined;
  /** True whenever `run.status === "running"` AND polling can still reach the status endpoint — see
   *  {@link pollError}'s own doc for why the second half matters (same shape
   *  `StaticExportController.isRunning` documents). */
  isPublishing: boolean;
  /** Already-formatted, translated error from the INITIAL status read — `null` while loading or once
   *  loaded successfully. Distinct from {@link publishError}: same split
   *  `StaticExportController.loadError`/`triggerError` draws. */
  loadError: string | null;
  /** Already-formatted, translated error from the poll loop giving up after a bounded number of
   *  consecutive failures — `null` while healthy, reset at the start of every new {@link publish}.
   *  Same shape and same reason `StaticExportController.pollError` exists: an unbounded retry here
   *  would strand the operator on a stuck "Publishing…" spinner with the button disabled forever. */
  pollError: string | null;
  publishError: string | null;
  /** True while a {@link publish} POST is in flight — briefer than {@link isPublishing}, which stays
   *  true for the whole publish, not just the initial request. Exposed (unlike an internal-only flag)
   *  so the caller can disable the Publish button on this alone, before any run comes back — without
   *  it, a double-click could send two POSTs before the first one's response ever arrives. */
  publishing: boolean;
  /** Starts a real publish with the current field values. Resolves either way — a failure is
   *  surfaced through {@link publishError}, never a thrown rejection. A call while {@link publishing}
   *  is already true is a duplicate submit and is ignored outright, not just discouraged by the
   *  disabled button — see this function's own implementation note. */
  publish: () => Promise<void>;

  t: Translate;
}

/** Same interval `use-static-export.hooks.ts` polls its own run at — see that constant's doc for
 *  why this width. Publishing additionally blocks on an external provider's own build (up to
 *  roughly a minute per `publish-site.ts`'s header), so this loop simply runs for longer, not
 *  faster or slower. */
const PUBLISH_POLL_INTERVAL_MS = 1500;

/** Same bound and same rationale as `use-static-export.hooks.ts`'s own `POLL_FAILURE_LIMIT` — how
 *  many CONSECUTIVE poll failures the loop below tolerates before giving up and surfacing
 *  {@link StaticPublishController.pollError} instead of retrying forever. */
const PUBLISH_POLL_FAILURE_LIMIT = 3;

/** Builds the wire config from the form's current field values — the one function that decides
 *  which fields matter for which target (everything else in this hook is target-agnostic state).
 *  Blank optional fields (`branch`, `teamId`) are omitted entirely rather than sent as `""`, so an
 *  operator who typed then deleted a branch name gets the server's own default (`"gh-pages"`)
 *  instead of an explicit empty string. One case per target, not an `if (github-pages) ... else
 *  vercel` — the shape this hook replaced silently built a `{target: "vercel", ...}` config for
 *  ANY non-github-pages target, which would have sent a Vercel-shaped publish request for a Netlify
 *  or Cloudflare Pages selection; a switch with an explicit branch per target makes that class of
 *  bug a compile error instead (TypeScript's own exhaustiveness check over `AdminStaticPublishTargetId`
 *  fails the build if a target is ever added here without a matching case).
 *  @complexity O(1). */
function buildConfig(fields: {
  target: AdminStaticPublishTargetId;
  owner: string;
  repo: string;
  branch: string;
  teamId: string;
}): AdminStaticPublishConfig {
  switch (fields.target) {
    case "github-pages":
      return {
        target: "github-pages",
        owner: fields.owner,
        repo: fields.repo,
        ...(fields.branch.trim() !== "" ? { branch: fields.branch.trim() } : {}),
      };
    case "vercel":
      return { target: "vercel", ...(fields.teamId.trim() !== "" ? { teamId: fields.teamId.trim() } : {}) };
    case "netlify":
      return { target: "netlify" };
    case "cloudflare-pages":
      return { target: "cloudflare-pages" };
  }
}

export function useStaticPublish(port: StaticPublishPort, t: Translate, locale: string): StaticPublishController {
  const [target, setTargetRaw] = useState<AdminStaticPublishTargetId>("github-pages");
  const [owner, setOwnerRaw] = useState("");
  const [repo, setRepoRaw] = useState("");
  const [branch, setBranchRaw] = useState("");
  const [teamId, setTeamIdRaw] = useState("");
  const [projectName, setProjectName] = useState("");

  const [preview, setPreview] = useState<AdminStaticPublishPreview | undefined>(undefined);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Bumped by every field edit (via `invalidatePreview` below) so `checkPreview` can tell whether
  // the fields it was called against are still the CURRENT fields once its request resolves — see
  // that function's own note (C3 fix).
  const previewGenerationRef = useRef(0);

  // Every setter below clears the (now stale) preview as a side effect — see this file's header.
  function invalidatePreview() {
    previewGenerationRef.current += 1;
    setPreview(undefined);
    setPreviewError(null);
  }
  function setTarget(value: AdminStaticPublishTargetId) {
    setTargetRaw(value);
    invalidatePreview();
  }
  function setOwner(value: string) {
    setOwnerRaw(value);
    invalidatePreview();
  }
  function setRepo(value: string) {
    setRepoRaw(value);
    invalidatePreview();
  }
  function setBranch(value: string) {
    setBranchRaw(value);
    invalidatePreview();
  }
  function setTeamId(value: string) {
    setTeamIdRaw(value);
    invalidatePreview();
  }

  async function checkPreview() {
    // Captured BEFORE the request starts — if a field edit bumps `previewGenerationRef` while this
    // request is in flight, the comparison below after `await` tells us this result is now stale
    // (C3 fix: without it, a slow preview response for `acme/old` could resolve AFTER the operator
    // had already changed the field to `acme/new` and repopulate the form with the wrong target).
    const requestGeneration = previewGenerationRef.current;
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const result = await port.getPublishPreview(buildConfig({ target, owner, repo, branch, teamId }));
      // A field edited after this request started already invalidated the preview and moved the
      // generation forward — applying this now-stale result would repopulate the OLD fields over a
      // form the operator has since changed. Discard it silently; the edit's own `invalidatePreview()`
      // already left `preview`/`previewError` in the right (empty) state.
      if (previewGenerationRef.current !== requestGeneration) return;
      setPreview(result);
    } catch (err) {
      if (previewGenerationRef.current !== requestGeneration) return;
      setPreviewError(publishPreviewErrorMessage(locale, describeApiError(err, "unknown error")));
    } finally {
      // Unconditional, unlike the two branches above: this request's own spinner must stop once ITS
      // OWN network call settles regardless of generation, or a discarded stale response would leave
      // `previewLoading` stuck true forever with nothing left in flight to ever clear it.
      setPreviewLoading(false);
    }
  }

  const query = useFetchQuery({ key: ["deployment", "publish"], fetch: () => port.getPublishStatus() });
  const [run, setRun] = useState<AdminPublishRunSnapshot | undefined>(undefined);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // Seeds `run` from the query's first successful load, exactly once — same shape
  // `use-static-export.hooks.ts`'s own `seededRef` uses, and for the same reason (a reload mid-
  // publish, or a second tab, should show the real state rather than a blank "not started").
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || query.status === "loading" || !query.data) return;
    seededRef.current = true;
    setRun(query.data);
  }, [query.status, query.data]);

  const loadError = query.error ? publishLoadErrorMessage(locale, describeApiError(query.error, "unknown error")) : null;

  // Counts CONSECUTIVE poll failures for the `PUBLISH_POLL_FAILURE_LIMIT` bound below — same ref-not-
  // state reasoning `use-static-export.hooks.ts`'s own `pollFailuresRef` documents.
  const pollFailuresRef = useRef(0);
  // Synchronous duplicate-submit guard for `publish()` — a ref, not the `publishing` state, because a
  // true double-click can fire two calls in the same synchronous tick, before React has re-rendered
  // with `publishing: true`; `publishing` (state) still exists to let the UI disable the button, but
  // the guard that actually stops a second POST from ever being sent has to be synchronous (C4 fix).
  const publishingRef = useRef(false);

  const isPublishing = run?.status === "running" && pollError === null;

  // Self-scheduling poll loop, re-armed only when `isPublishing` flips true — identical shape and
  // identical reasoning to `use-static-export.hooks.ts`'s own poll effect; see that file's comment
  // for why `run`/`port` are deliberately excluded from the dependency list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-armed only when `isPublishing` flips true; `run`/`port` deliberately excluded — see comment above.
  useEffect(() => {
    if (!isPublishing) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      timer = setTimeout(poll, PUBLISH_POLL_INTERVAL_MS);
    }
    async function poll() {
      try {
        const status = await port.getPublishStatus();
        if (cancelled) return;
        pollFailuresRef.current = 0;
        setRun(status);
        if (status.status === "running") scheduleNext();
      } catch (err) {
        if (cancelled) return;
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= PUBLISH_POLL_FAILURE_LIMIT) {
          // Bounded (C2, same shape as use-static-export.hooks.ts's own fix): give up rather than
          // retry forever. Setting `pollError` also flips `isPublishing` false on the next render,
          // which re-arms this effect's own cleanup — but `return` here (no `scheduleNext()`) is
          // what actually stops the loop; it must not depend on that later render having happened.
          setPollError(publishPollErrorMessage(locale, describeApiError(err, "unknown error")));
          return;
        }
        scheduleNext();
      }
    }
    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isPublishing]);

  async function publish() {
    // A second call while the first is still in flight is a duplicate submit (e.g. a double-click
    // landing before React re-renders with the button disabled) — ignore it here too, not just via
    // the UI's `publishing`-gated disabled state, so the race can't still send two POSTs (C4 fix).
    // This check-then-set is safe against a same-tick double call specifically BECAUSE it is
    // synchronous: nothing yields between the read and the write below, so a second synchronous call
    // always observes this call's write.
    if (publishingRef.current) return;
    publishingRef.current = true;
    // Local action supersedes any still-pending bootstrap read — same C1 fix and same reasoning
    // `use-static-export.hooks.ts`'s own `trigger()` documents: this write is synchronous and
    // happens-before the `await` below, so it wins the race regardless of how late the bootstrap
    // read resolves.
    seededRef.current = true;
    // A fresh publish also clears any earlier poll-failure standoff (C2) — the operator retrying via
    // this same button is exactly the recovery path a stalled `pollError` is meant to unblock.
    pollFailuresRef.current = 0;
    setPollError(null);
    setPublishError(null);
    setPublishing(true);
    try {
      const started = await port.triggerPublish({ config: buildConfig({ target, owner, repo, branch, teamId }), projectName });
      setRun(started);
    } catch (err) {
      setPublishError(publishTriggerErrorMessage(locale, describeApiError(err, "unknown error")));
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  return {
    target,
    setTarget,
    owner,
    setOwner,
    repo,
    setRepo,
    branch,
    setBranch,
    teamId,
    setTeamId,
    projectName,
    setProjectName,
    preview,
    previewLoading,
    previewError,
    checkPreview,
    run,
    isPublishing,
    loadError,
    pollError,
    publishError,
    publishing,
    publish,
    t,
  };
}

/**
 * Binds the real `/api/.../system/publish*` client, and a `t` bound to the real resolved locale —
 * the zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, same shape
 * `use-static-export.hooks.ts`'s `useWiredStaticExport` documents.
 */
export function useWiredStaticPublish(): StaticPublishController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return useStaticPublish(defaultStaticPublishPort, t, locale);
}
