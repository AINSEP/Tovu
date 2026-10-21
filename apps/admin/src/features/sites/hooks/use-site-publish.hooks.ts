import { useEffect, useRef, useState } from "react";

import { hasPermission, type Translate } from "@jini-ai/ui/panel-kit";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";

import { describeApiError, type AdminPublishDestination, type AdminPublishRunSnapshot } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { defaultStaticPublishPort } from "../../deployment/hooks/static-publish-dependencies.hooks";
import type { StaticPublishPort } from "../../deployment/hooks/static-publish-port.hooks";
import { useStaticPublish, type StaticPublishController, type StaticPublishOptions } from "../../deployment/hooks/use-static-publish.hooks";
import { defaultPublishContentPort } from "../../publish-content/hooks/publish-content-dependencies.hooks";
import type { PublishContentPort } from "../../publish-content/hooks/publish-content-port.hooks";
import { usePublishToLiveAvailable } from "../../publish-content/hooks/publish-availability.store";
import { requestPublish } from "../../publish-content/hooks/publish-request.store";
import {
  CONTENT_PUBLISH_PERMISSION,
  STATIC_PUBLISH_PERMISSION,
  destinationAction,
  destinationKindLabel,
  destinationPeerId,
  peerPlanDecision,
  relativePublishedTime,
  skippedAfterPublish,
  type SitePublishAction,
  type SitePublishPermissions,
} from "../site-publish-rules";
import { defaultSitePublishPort, type SitePublishPort } from "./site-publish-dependencies.hooks";

/**
 * @file The Sites Export tab's "Publish" button (owner, 2026-10-18): a list of the places this site
 * was published or deployed to before, and one Publish action per row. Nothing ships until the
 * operator picks a row, even when there is only one, and the pick is the only confirmation.
 *
 * Static rows replay through {@link useStaticPublish} (trigger + bounded poll). Tovu rows run the
 * publish-content plan -> confirm -> execute ceremony over its own port: the confirmation token
 * stays inside this hook, and conflicting rows are skipped, never forced; the row then offers the
 * full Publish dialog to review them. One run at a time, because the server runs one static
 * publish at a time and a second click while a push is in flight would only race it.
 */

/** A row's inline progress or result. `static-run` is a settled static run, rendered by the shared
 *  `PublishRunResult`. */
export type SitePublishRowState =
  | { readonly kind: "running" }
  | { readonly kind: "static-run"; readonly run: AdminPublishRunSnapshot }
  | { readonly kind: "done"; readonly url: string; readonly skipped: number }
  | { readonly kind: "nothing"; readonly skipped: number }
  | { readonly kind: "error"; readonly message: string };

export interface SitePublishRowView {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  /** "Last published …" already resolved, e.g. "3 days ago". */
  readonly when: string;
  readonly kindLabel: string;
  readonly action: SitePublishAction;
  /** A deploy the host accepted that nothing confirmed landed. */
  readonly pendingDeploy: boolean;
  readonly state: SitePublishRowState | null;
}

export interface SitePublishController {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
  readonly status: "loading" | "error" | "ready";
  readonly error: string | null;
  /** Explicitly retry a failed destinations read. */
  readonly retry: () => void;
  readonly rows: readonly SitePublishRowView[];
  /** A run is in flight: every row's action is disabled until it settles. */
  readonly busy: boolean;
  readonly publish: (id: string) => void;
  /** Opens the full Publish dialog: the connect offer, or the conflicts a push skipped. */
  readonly openPublishDialog: () => void;
  readonly t: Translate;
}

export interface SitePublishDependencies {
  port: SitePublishPort;
  staticPort: StaticPublishPort;
  peerPort: PublishContentPort;
  t: Translate;
  locale: string;
  /** `publish-availability.store.ts`: `false` on the live site. */
  liveAvailable: boolean;
}

const DESTINATIONS_KEY = ["sites", "publish-destinations"] as const;
const PERMISSIONS_KEY = ["sites", "publish-permissions"] as const;

/** The one row a run belongs to; `state` is only set for content pushes (static state is read off
 *  the static controller). */
/** A static run's state is read off the shared static controller; a content push carries its own,
 *  so `state` exists exactly on the `"peer"` arm. */
type ActiveRun =
  | { readonly id: string; readonly via: "static" }
  | { readonly id: string; readonly via: "peer"; readonly state: SitePublishRowState };

export function useSitePublish(deps: SitePublishDependencies, options: { now?: () => number } = {}): SitePublishController {
  const { port, peerPort, t, locale, liveAvailable } = deps;
  const [open, setOpen] = useState(false);
  // A fresh read on each enabled edge; rerenders keep the same key and do not fetch again.
  const destinations = useFetchQuery({ key: DESTINATIONS_KEY, fetch: () => port.listDestinations() }, { enabled: open, staleTime: 0 });
  const me = useFetchQuery({ key: PERMISSIONS_KEY, fetch: () => port.me() }, { enabled: open, staleTime: 0 });
  const staticPublish = useStaticPublish(deps.staticPort, t, locale);
  const [active, setActive] = useState<ActiveRun | null>(null);
  // Synchronous double-click guard for content pushes, same reason `useStaticPublish`'s own
  // `publishingRef` documents: two clicks in one tick both see `active` as it was.
  const pushingRef = useRef(false);

  const permissions = permissionsFrom(me.data?.effectivePermissions);
  const { staticState, busy, staticActive } = runFlags(active, staticPublish);
  useRefetchAfterStaticRun(staticPublish.run, staticActive, destinations.refetch);
  // Closing clears settled feedback, including a run that finishes while hidden. A running
  // publish keeps its owner and progress so reopening cannot start a competing run.
  useEffect(() => {
    if (!open && !busy) setActive(null);
  }, [open, busy]);

  function close() {
    setOpen(false);
    if (!busy) setActive(null);
  }

  async function pushContent(id: string, peerId: string, url: string) {
    if (pushingRef.current) return;
    pushingRef.current = true;
    const settle = (state: SitePublishRowState) => setActive({ id, via: "peer", state });
    settle({ kind: "running" });
    try {
      const state = await runContentPush({ peerPort, peerId, url, t });
      settle(state);
      if (state.kind === "done") destinations.refetch();
    } finally {
      pushingRef.current = false;
    }
  }

  function publish(id: string) {
    const destination = destinations.data?.find((row) => row.id === id);
    if (!destination || busy || destinationAction({ destination, permissions, liveAvailable }) !== "publish") return;
    if (destination.kind === "static") {
      setActive({ id, via: "static" });
      void staticPublish.publish(staticReplayOptions(destination));
      return;
    }
    // `destinationAction` only answers "publish" for a non-static row when `destinationPeerId` is
    // non-null (site-publish-rules.ts), so the peer id is always present here.
    void pushContent(id, destinationPeerId(destination)!, destination.url);
  }

  const rowContext = { active, staticState, permissions, liveAvailable, nowMs: (options.now ?? Date.now)(), locale, t };
  return {
    open,
    toggle: () => { if (open) close(); else setOpen(true); },
    close,
    retry: destinations.refetch,
    ...listView(destinations, t),
    rows: listRows(destinations.data, rowContext),
    busy,
    publish,
    openPublishDialog: () => {
      close();
      void requestPublish({});
    },
    t,
  };
}

/** The whole-site content push for one peer: plan, then confirm and execute only when the plan
 *  writes something. The token never leaves this function; no overwrite is ever requested, so
 *  conflicting rows stay skipped. Resolves to the row's settled state, never rejects. */
async function runContentPush(input: { peerPort: PublishContentPort; peerId: string; url: string; t: Translate }): Promise<SitePublishRowState> {
  const { peerPort, peerId, t } = input;
  try {
    const plan = await peerPort.planPublish({ peerId });
    const decision = peerPlanDecision(plan);
    if (decision.kind === "refused") return { kind: "error", message: decision.reason ?? t("Publishing was refused.") };
    if (decision.kind === "nothing") return { kind: "nothing", skipped: decision.skipped };
    const { confirmationToken } = await peerPort.confirmPublish({ peerId, planId: plan.planId, planHash: plan.planHash });
    const result = await peerPort.executePublish({ peerId, bundleId: plan.bundleId, confirmationToken });
    return { kind: "done", url: input.url, skipped: skippedAfterPublish({ plan: plan.details, executed: result.report }) };
  } catch (err) {
    return { kind: "error", message: describeApiError(err, t("Could not publish.")) };
  }
}

/** A saved static destination as `useStaticPublish`'s replay options. The credential is named only
 *  when the row saved one, never sent as an explicit `undefined`. */
function staticReplayOptions(destination: Extract<AdminPublishDestination, { kind: "static" }>): StaticPublishOptions {
  return {
    destination: { config: { target: destination.target, fields: destination.configFields }, projectName: destination.projectName },
    ...(destination.credentialId !== undefined ? { credentialId: destination.credentialId } : {}),
  };
}

interface RowContext {
  readonly active: ActiveRun | null;
  readonly staticState: SitePublishRowState | null;
  readonly permissions: SitePublishPermissions;
  readonly liveAvailable: boolean;
  readonly nowMs: number;
  readonly locale: string;
  readonly t: Translate;
}

/** One destination as the panel renders it. @complexity O(1). */
function rowView(destination: AdminPublishDestination, context: RowContext): SitePublishRowView {
  return {
    id: destination.id,
    label: destination.label,
    url: destination.url,
    when: relativePublishedTime({ iso: destination.lastPublishedAt, nowMs: context.nowMs, locale: context.locale }),
    kindLabel: context.t(destinationKindLabel(destination.kind)),
    action: destinationAction({ destination, permissions: context.permissions, liveAvailable: context.liveAvailable }),
    pendingDeploy: destination.kind === "deploy" && destination.status === "started",
    state: rowState(destination.id, context),
  };
}

/** The in-flight or settled state of the one row a run belongs to; `null` for every other row. */
function rowState(id: string, context: RowContext): SitePublishRowState | null {
  const { active } = context;
  if (active?.id !== id) return null;
  if (active.via === "static") return context.staticState;
  return active.state;
}

/** A failed refresh takes precedence over cached data; stale empty copy would hide the failure. */
function listView(query: { data: unknown; error: unknown }, t: Translate): Pick<SitePublishController, "status" | "error"> {
  const error = query.error ? describeApiError(query.error, t("Could not load publish destinations.")) : null;
  if (error) return { status: "error", error };
  return { status: query.data === undefined ? "loading" : "ready", error: null };
}

/** @complexity O(d) destinations. */
function listRows(destinations: readonly AdminPublishDestination[] | undefined, context: RowContext): SitePublishRowView[] {
  return (destinations ?? []).map((destination) => rowView(destination, context));
}

/** Which row a run belongs to and whether one is in flight. Static state is read off the shared
 *  static controller; content-push state rides on `active` itself. */
function runFlags(active: ActiveRun | null, staticPublish: StaticPublishController) {
  const staticActive = active?.via === "static";
  const staticState = staticActive ? staticRowState(staticPublish) : null;
  const busy = staticState?.kind === "running" || (active?.via === "peer" && active.state.kind === "running");
  return { staticState, busy, staticActive };
}

/** @complexity O(p) granted permissions. */
function permissionsFrom(granted: readonly string[] | undefined): SitePublishPermissions {
  return {
    known: granted !== undefined,
    canPublishStatic: hasPermission({ permissions: granted ?? [], permission: STATIC_PUBLISH_PERMISSION }),
    canPublishContent: hasPermission({ permissions: granted ?? [], permission: CONTENT_PUBLISH_PERMISSION }),
  };
}

/** The static row's state, read off the shared static controller. The POST and the poll count as
 *  running; a trigger or poll failure is an error; a settled run shows its own result. */
function staticRowState(controller: StaticPublishController): SitePublishRowState | null {
  if (controller.publishError) return { kind: "error", message: controller.publishError };
  if (controller.publishing || controller.isPublishing) return { kind: "running" };
  if (controller.pollError) return { kind: "error", message: controller.pollError };
  const run = controller.run;
  if (run && (run.status === "completed" || run.status === "errored")) return { kind: "static-run", run };
  return null;
}

/** Re-reads the list once per static run this list started that finished, so the row's "last
 *  published" moves. Keyed on the run's finish time so a re-render never refetches twice. */
function useRefetchAfterStaticRun(run: AdminPublishRunSnapshot | undefined, ours: boolean, refetch: () => void) {
  const seen = useRef<string | null>(null);
  const finished = ours && run?.status === "completed" ? run.finishedAtIso : null;
  useEffect(() => {
    if (finished === null || finished === seen.current) return;
    seen.current = finished;
    refetch();
  }, [finished, refetch]);
}

/** Binds the real ports and the viewer's locale; `t` is the Sites screen's translator. */
export function useWiredSitePublish({ t }: { t: Translate }): SitePublishController {
  const locale = useAdminLocale();
  const liveAvailable = usePublishToLiveAvailable();
  return useSitePublish({
    port: defaultSitePublishPort,
    staticPort: defaultStaticPublishPort,
    peerPort: defaultPublishContentPort,
    t,
    locale,
    liveAvailable,
  });
}

