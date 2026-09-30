import { useEffect, useMemo, useRef, useState } from "react";

import {
  describeApiError,
  type AdminPublishRunSnapshot,
  type AdminPublishTargetDescriptor,
  type AdminStaticPublishPreview,
  type AdminStaticPublishTargetId,
} from "@/lib/api";
import { localizePublishTargets } from "@/lib/descriptor-i18n";
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
import {
  buildStaticPublishConfig,
  publishTargetById,
  staticPublishFormReadyForPreview,
  staticPublishFormReadyToPublish,
  staticPublishProjectNameCopy,
  type StaticPublishProjectNameCopy,
} from "../rules";
import { defaultStaticPublishPort } from "./static-publish-dependencies.hooks";
import type { StaticPublishPort } from "./static-publish-port.hooks";

/**
 * @file Everything the Static Site tab's "Getting it online" provider form does — target selection,
 * the host's config fields and projectName, the preview action, and the publish
 * trigger+poll — so `StaticSiteTab.tsx` is only markup. Wired 2026-08-15 against
 * `src/server/routes/admin/system/publish-site.ts`'s three routes (preview, trigger, status).
 *
 * ## One form, fields from the host's descriptor
 *
 * The hosts, and each host's config fields, come from `GET .../system/publish-targets` (the deploy
 * plugin's descriptors) — this hook names no host. Config values are kept per target id, so
 * switching hosts never discards another host's half-filled fields, and `buildStaticPublishConfig`
 * (`rules.ts`) sends only the fields the selected host declares.
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
  /** The deploy registry's targets, in its order — `undefined` until the first load resolves. */
  targets: readonly AdminPublishTargetDescriptor[] | undefined;
  /** Translated error from loading {@link targets}, `null` otherwise. */
  targetsError: string | null;
  /** The selected target's id — the operator's pick, else the first listed target; `""` while the
   *  list loads. */
  target: AdminStaticPublishTargetId;
  /** {@link target}'s descriptor, `undefined` while the list loads. */
  selectedTarget: AdminPublishTargetDescriptor | undefined;
  setTarget: (target: AdminStaticPublishTargetId) => void;
  /** The selected target's config values, keyed by descriptor field name. */
  configValues: Readonly<Record<string, string>>;
  setConfigField: (name: string, value: string) => void;
  /** Whether Preview / Publish may be asked for with the current values (`rules.ts`). */
  canPreview: boolean;
  canPublish: boolean;
  /** The selected host's label and help for {@link projectName}, as dictionary keys. */
  projectNameCopy: StaticPublishProjectNameCopy;
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
   *  disabled button — see this function's own implementation note.
   *
   *  `options.credentialId` names the saved connection the publish must use (terra review
   *  2026-09-20, finding 1). This hook never picks one itself: it has no credentials controller, and
   *  the caller (`StaticSiteTab`) is the one screen that knows which connection the operator is
   *  actually looking at. Omitted when this provider has no saved connection. */
  publish: (options?: { credentialId?: string }) => Promise<void>;

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

export function useStaticPublish(port: StaticPublishPort, t: Translate, locale: string): StaticPublishController {
  const targetsQuery = useFetchQuery({ key: ["deployment", "publish-targets"], fetch: () => port.listPublishTargets() });
  // The host's own text in the viewer's locale, once, so every consumer (this form, the credential
  // rows built from these targets) renders it translated.
  const targets = useMemo(() => localizePublishTargets(targetsQuery.data, locale), [targetsQuery.data, locale]);
  const targetsError = targetsQuery.error ? publishLoadErrorMessage(locale, describeApiError(targetsQuery.error, "unknown error")) : null;
  const [chosenTarget, setChosenTarget] = useState<AdminStaticPublishTargetId | null>(null);
  const target = chosenTarget ?? targets?.[0]?.id ?? "";
  const selectedTarget = publishTargetById(targets, target);
  const [valuesByTarget, setValuesByTarget] = useState<Record<AdminStaticPublishTargetId, Record<string, string>>>({});
  const configValues = valuesByTarget[target] ?? {};
  const [projectName, setProjectName] = useState("");

  const [preview, setPreview] = useState<AdminStaticPublishPreview | undefined>(undefined);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Bumped by every field edit (via `invalidatePreview` below) so `checkPreview` can tell whether
  // the fields it was called against are still the CURRENT fields once its request resolves — see
  // that function's own note (C3 fix).
  const previewGenerationRef = useRef(0);

  // Synchronous duplicate-submit guard for `checkPreview()` (2026-09-05 stale-settlement sweep, C5
  // fix) — same reasoning `publishingRef` documents for `publish()` below, PLUS a second failure mode
  // specific to `checkPreview`: with no guard, two overlapping calls share the one `previewLoading`
  // flag, so whichever call's own `finally` fires FIRST clears it while the OTHER is still in flight —
  // the Preview button (and any caller depending on `previewLoading`) would read "not loading" with a
  // request still outstanding. A ref, not `previewLoading` (state) itself: a same-tick double call
  // (or any caller reaching `checkPreview()` directly, not just through the disabled button) must see
  // the other call's claim synchronously, before either has re-rendered.
  const previewCallRef = useRef(false);

  // Every setter below clears the (now stale) preview as a side effect — see this file's header.
  function invalidatePreview() {
    previewGenerationRef.current += 1;
    setPreview(undefined);
    setPreviewError(null);
  }
  function setTarget(value: AdminStaticPublishTargetId) {
    if (publishTargetById(targets, value) === undefined) return;
    setChosenTarget(value);
    invalidatePreview();
  }
  function setConfigField(name: string, value: string) {
    setValuesByTarget((prev) => ({ ...prev, [target]: { ...prev[target], [name]: value } }));
    invalidatePreview();
  }

  async function checkPreview() {
    // A second call while the first is still in flight is a duplicate submit — ignore it here too,
    // not just via the UI's `previewLoading`-gated disabled state, so the race can't still send two
    // requests or tear down `previewLoading` out from under the call that's still running (C5 fix,
    // same "ignored outright" idiom `publish()`'s `publishingRef` uses below). Safe against a
    // same-tick double call specifically because it is synchronous: nothing yields between the read
    // and the write, so a second synchronous call always observes this call's claim.
    if (previewCallRef.current || selectedTarget === undefined) return;
    previewCallRef.current = true;
    // Captured BEFORE the request starts — if a field edit bumps `previewGenerationRef` while this
    // request is in flight, the comparison below after `await` tells us this result is now stale
    // (C3 fix: without it, a slow preview response for `acme/old` could resolve AFTER the operator
    // had already changed the field to `acme/new` and repopulate the form with the wrong target).
    const requestGeneration = previewGenerationRef.current;
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const result = await port.getPublishPreview(buildStaticPublishConfig(selectedTarget, configValues));
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
      // `previewLoading` stuck true forever with nothing left in flight to ever clear it. Safe to
      // always release `previewCallRef` here too now that duplicates are refused at entry, above —
      // there is never a second, still-running call left whose own flag this could clobber.
      previewCallRef.current = false;
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

  async function publish(options: { credentialId?: string } = {}) {
    // A second call while the first is still in flight is a duplicate submit (e.g. a double-click
    // landing before React re-renders with the button disabled) — ignore it here too, not just via
    // the UI's `publishing`-gated disabled state, so the race can't still send two POSTs (C4 fix).
    // This check-then-set is safe against a same-tick double call specifically BECAUSE it is
    // synchronous: nothing yields between the read and the write below, so a second synchronous call
    // always observes this call's write.
    if (publishingRef.current || selectedTarget === undefined) return;
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
      const started = await port.triggerPublish({
        config: buildStaticPublishConfig(selectedTarget, configValues),
        projectName,
        // Conditional spread, never `credentialId: options.credentialId` — an absent choice must not
        // reach the wire as an explicit `undefined` key.
        ...(options.credentialId !== undefined ? { credentialId: options.credentialId } : {}),
      });
      setRun(started);
    } catch (err) {
      setPublishError(publishTriggerErrorMessage(locale, describeApiError(err, "unknown error")));
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  return {
    targets,
    targetsError,
    target,
    selectedTarget,
    setTarget,
    configValues,
    setConfigField,
    canPreview: staticPublishFormReadyForPreview(selectedTarget, configValues),
    canPublish: staticPublishFormReadyToPublish(selectedTarget, configValues, projectName),
    projectNameCopy: staticPublishProjectNameCopy(selectedTarget),
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
