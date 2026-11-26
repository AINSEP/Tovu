import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
/**
 * @file `GET /api/admin/v1/workspaces/:workspaceId/settings/events` — a Server-Sent Events stream
 * that tells an open admin tab when settings it can read have changed, so it re-reads without a
 * page reload.
 *
 * ## Why polling the revision ledger rather than an in-process emitter
 *
 * The writes this must observe do not all happen here. `settings_set_ui_preference` executes in the
 * agent daemon (`assistant/agent-daemon-server.ts`), a separate OS process with its own connection
 * to the same SQLite file, and an in-process event emitter in this server would never hear it —
 * the same boundary that made the per-layer value cache unfixable (see `features/settings/
 * settings.ts`'s cache header).
 *
 * `setting_revisions.seq` is a monotonic AUTOINCREMENT in that shared file, written inside the same
 * transaction as every value and definition change (INV-01). Polling it therefore observes every
 * writer — this process, the daemon, a future background job — with no IPC, no broker, and no
 * coordination to get wrong. The cost is two indexed lookups per tick: the ledger head, then one
 * `seq > ?` page.
 *
 * ## The ledger is global; this stream is not
 *
 * One file holds every workspace's revisions, so `seq` is a position in a shared sequence rather
 * than in this workspace's own history. Both places that treat it as a coordinate have to account
 * for that, and both used to get it wrong in the same way: the page query took `limit` rows
 * globally and filtered afterwards in JS, so a busy tenant's writes crowded out a quiet one's, and
 * the resume cursor accepted any client-supplied `Last-Event-ID` without bounding it to the ledger.
 * The query is now workspace-predicated (see `Jini packages/core/src/settings/ports.ts`) and the cursor is
 * clamped to the head below. Disclosure was never the issue and is unchanged — `change-feed.ts`
 * remains the only thing that decides what a subscriber is told.
 *
 * ## Why this does not reintroduce the polling it replaces
 *
 * A tab could poll `/settings/effective` itself. It would cost one request per namespace per
 * interval per tab (six namespaces for the settings dialog alone), each resolving up to three
 * layers, and it would still be seconds stale. This is one connection per tab and one indexed
 * lookup per tick regardless of namespace count, and it sends nothing at all when nothing changed.
 *
 * ## Disclosure
 *
 * Frames carry namespace NAMES only, never values, and only for revisions
 * `Jini packages/core/src/settings/change-feed.ts` deems visible to the subscribing principal. A client re-reads
 * through the ordinary authorized `getSettingsEffective` path, so this endpoint cannot become a
 * way to obtain a value the caller could not already fetch. `settings.read` gates the subscription
 * itself, matching `get-effective.ts`.
 *
 * ### The emitted id is a global position, and that is an accepted decision
 *
 * `seq` is one AUTOINCREMENT shared by every workspace, so even a workspace's OWN revision is
 * stamped with a global number: one write in `ws-a` after fifty in `ws-b` emits `id: 51`. A
 * subscriber can difference the ids of its own consecutive events and infer roughly how many
 * settings writes happened platform-wide in between.
 *
 * Accepted rather than fixed. What leaks is a coarse aggregate write-count — no values, no
 * identities, nothing attributable to a particular tenant, and only for administrative settings
 * changes. Closing it needs either a per-workspace counter, which is a schema change on the write
 * path every writer shares (this process and the agent daemon both), or an opaque encrypted cursor,
 * which adds a key whose rotation would make reconnecting tabs silently skip the writes they
 * missed while still looking healthy. Both cost more than the disclosure is worth.
 *
 * **Revisit if** the ledger starts carrying higher-frequency or more attributable events than
 * administrative settings changes — the inference gets sharper as write volume rises.
 *
 * What is NOT accepted is emitting the global ledger HEAD, which `cursor` is advanced to below.
 * That would publish the platform-wide position on every frame, precisely and without the
 * subscriber writing anything. `__tests__/routes/settings-events-id-disclosure.test.ts` holds that
 * line, using a neighbour that writes AFTER this workspace does — the only arrangement in which
 * the two numbers differ.
 */

import { settingsEventsRoute, sseWriteHeadHeaders, admitSubscriber as admitSubscription, createNamespaceResolver } from "@jini-ai/cms/admin-http/routes/settings/events";
import { authorizeChangeFeed } from "@jini-ai/cms/admin-http/routes/settings/preview-feed-access";
import { createThemePreviewFeed, readThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import {
  collectChangedNamespaces,
  type ChangeFeedViewer,
} from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import type { Express, Request, Response } from "express";
import type { SettingsRouteDeps } from "./deps.js";
import { asyncRoute } from "../../../../../platform/express/async-route.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

type IntervalHandle = ReturnType<typeof setInterval>;

/** Interval scheduling for the feed's three timers; injectable so tests drive ticks themselves. */
type FeedTimers = {
  scheduleInterval?: (work: () => void, ms: number) => IntervalHandle;
  clearScheduledInterval?: (timer: IntervalHandle) => void;
};

/** The slice of the settings route deps this feed reads: the ledger's three revision reads, the
 *  authorizer, readiness, the themes folder for preview frames, and optional injected timers. */
export type SettingsEventsDeps = Pick<SettingsRouteDeps, "workspaceId" | "authorize" | "settingsReady" | "themesDir"> & {
  settingsRepo: Pick<SettingsRouteDeps["settingsRepo"], "maxRevisionSeq" | "listRevisionsSince" | "findDefinitionBySettingId">;
  feedTimers?: FeedTimers;
};

type ChangeFeedAccess = Awaited<ReturnType<typeof authorizeChangeFeed>>;

/** Who was admitted to the stream and which channels they may receive. */
type Admission = { principal: { id: string }; access: ChangeFeedAccess; includePreview: boolean };

/**
 * The timers this stream schedules on, falling back to the globals.
 * @complexity O(1).
 */
function resolveFeedTimers({ feedTimers }: { feedTimers: FeedTimers | undefined }, _options: Record<string, never> = {}): Required<FeedTimers> {
  const { scheduleInterval = setInterval, clearScheduledInterval = clearInterval } = feedTimers ?? {};
  return { scheduleInterval, clearScheduledInterval };
}

const admitSubscriber = ({ req, res, deps }: { req: Request; res: Response; deps: SettingsEventsDeps }): Promise<Admission | null> => admitSubscription({ deps: {
  rejectForeignWorkspace: () => rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId }),
  get settingsReady() { return deps.settingsReady; },
  principal: () => getAuthedPrincipal(res),
  report: err => console.error("[settings] change feed admission failed", describeErrorForLog({ err })),
  includePreview: () => req.query.themePreview === "1",
  authorize: ({ principalId, includePreview }) => authorizeChangeFeed({ authorize: deps.authorize, principalId, workspaceId: deps.workspaceId, includePreview }),
  json: (body, status) => { res.status(status).json(body); },
} });

function runChangeFeed(required: Admission & { req: Request; res: Response; deps: SettingsEventsDeps; timers: Required<FeedTimers> }): Promise<void> {
  const { req, res, deps, principal, includePreview, timers } = required;
  const viewer: ChangeFeedViewer = { workspaceId: deps.workspaceId, principalId: principal.id };
  const resolveNamespace = createNamespaceResolver({ deps });
  let previewFeed: ReturnType<typeof createThemePreviewFeed>;
  return settingsEventsRoute.open({ workspaceId: deps.workspaceId, initialAccess: required.access,
    lastEventId: req.headers["last-event-id"]?.toString(), afterRevision: req.query.afterRevision, ports: {
      writeHead: () => { res.writeHead(200, sseWriteHeadHeaders({ httpVersionMajor: req.httpVersionMajor })); },
      write: ({ frame }) => { res.write(frame); }, end: () => { res.end(); },
      onClose: ({ close }) => { req.on("close", close); res.on("close", close); },
      schedule: ({ work, ms }) => {
        // One tiny site-local marker bridges saves from the separate agent-daemon process.
        // Theme events have their own type and never advance the settings ledger's Last-Event-ID.
        previewFeed ??= createThemePreviewFeed({ isReservedPath: isReservedThemePreviewPath,
          read: () => deps.themesDir ? readThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath }) : null,
          emit: ({ frame }, _options = {}) => { res.write(`event: theme-preview-refresh\ndata: ${JSON.stringify(frame)}\n\n`); },
        }, { resumeRevision: typeof req.query.themeRevision === "string" ? req.query.themeRevision : undefined });
        return timers.scheduleInterval(work, ms);
      },
      clear: ({ timer }) => timers.clearScheduledInterval(timer),
      readHead: () => deps.settingsRepo.maxRevisionSeq(),
      readRevisions: (input) => deps.settingsRepo.listRevisionsSince(input),
      collect: ({ revisions }) => collectChangedNamespaces({ revisions, viewer, resolveNamespace }),
      reauthorize: () => authorizeChangeFeed({ authorize: deps.authorize, principalId: principal.id, workspaceId: deps.workspaceId, includePreview }),
      previewTick: () => previewFeed(),
      report: ({ phase, error }) => console.error(phase === "head" ? "[settings] change feed could not read the revision head" : phase === "poll" ? "[settings] change feed poll failed" : "[settings] change feed re-authorization failed", error),
      headFailureText: "Live settings updates stopped because the server could not read the latest settings change. Reload the page to reconnect.",
    },
  });
}

export const registerAdminSettingsEventsRoute = ({ app, deps }: { app: Express; deps: SettingsEventsDeps }, _optional: Record<string, never> = {}): void => {
  app.get(settingsEventsRoute.path, asyncRoute({ handler: async (req, res) => {
    // Resolved per request, not at registration: a test that swaps the global timers after the
    // route is registered must still be the one this stream schedules on.
    const timers = resolveFeedTimers({ feedTimers: deps.feedTimers });
    const admission = await admitSubscriber({ req, res, deps });
    if (!admission) return;
    await runChangeFeed({ ...admission, req, res, deps, timers });
  } }));
};
