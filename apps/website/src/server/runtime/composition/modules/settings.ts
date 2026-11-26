import { settingsClearRoute } from "@jini-ai/cms/admin-http/routes/settings/clear";
import { settingsGetEffectiveRoute } from "@jini-ai/cms/admin-http/routes/settings/get-effective";
import { settingsGetRawRoute } from "@jini-ai/cms/admin-http/routes/settings/get-raw";
import { settingsListDefinitionsRoute } from "@jini-ai/cms/admin-http/routes/settings/list-definitions";
import { settingsRegisterDefinitionsRoute } from "@jini-ai/cms/admin-http/routes/settings/register-definitions";
import { settingsResetRoute } from "@jini-ai/cms/admin-http/routes/settings/reset";
import { settingsSetRoute } from "@jini-ai/cms/admin-http/routes/settings/set";
import { registerSettingsEventsRoute } from "@jini-ai/cms/admin-http/routes/settings/events";
import { authorizeChangeFeed } from "@jini-ai/cms/admin-http/routes/settings/preview-feed-access";
import { createThemePreviewFeed, readThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { collectChangedNamespaces } from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { asyncRoute } from "#src/platform/express/async-route";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import type { Express } from "express";
import type { SettingsRouteDeps, SettingsRouteRegistrar } from "#src/server/inbound/admin-http/routes/settings/deps";
import {
  CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, SETTINGS_WRITE_FENCE, createTovuSettingsService, resolveUserLayerReadTarget, toWriteServiceDeps,
} from "#src/server/inbound/admin-http/routes/settings/shared";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteRegistration, ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `settings` server module (SPEC-007 Phase 5 admin
 * settings HTTP surface, ADR-028 Settings Layered Ledger).
 *
 * `SettingsRouteDeps` (new this pass, `apps/website/src/server/inbound/admin-http/routes/settings/deps.ts`) is a genuine
 * `Pick<RouteDeps, ...>` narrowing — see that file's header for the confirmed field set, and for
 * why `shared.ts`'s pre-existing `toWriteServiceDeps` helper was retyped from `RouteDeps` to this
 * same narrow type rather than left untouched: it already only ever reads fields
 * `SettingsRouteDeps` includes, so the retype is pure narrowing, needed so the 5 registrars below
 * (now typed `SettingsRouteRegistrar` instead of the generic `RouteRegistrar`) can still call it.
 *
 * Owns all 5 pre-existing registrations (register-definitions, get-effective, set, clear, reset) —
 * moved here verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior
 * change, same relative order.
 *
 * SPEC-007 `SETTINGS_GET_RAW`/`SETTINGS_LIST_DEFINITIONS` (api.spec.md, drift-audit gap): added
 * `registerAdminSettingsGetRawRoute`/`registerAdminSettingsListDefinitionsRoute` — now 7
 * registrations total, no new `SettingsRouteDeps` fields required (both read from fields the
 * existing 5 registrars already use).
 *
 * `registerAdminSettingsEventsRoute` (8th) is the SSE change feed. It is the only registration here
 * that holds its response open, and the only one that reads the revision ledger — see its own file
 * header for why a cross-process poll of `setting_revisions` is what an in-process emitter cannot
 * be. It needs no new `SettingsRouteDeps` fields.
 *
 * K1 (RT-K1-adm-settings): the seven JSON routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/settings/*`) mounted behind the admin ports in `"direct"` mode
 * (the settings routes never consulted the publishing-credential override) with the fixed
 * `routes/settings` 500 copy. `RouteDeps` is read only here: each mount gets readiness, the ledger,
 * Tovu's protected-namespace fence and the host-composed settings service (comments-provider
 * refusal, site-title bounds, mail-cache invalidation — `createTovuSettingsService`). The SSE change
 * feed (`events.ts`) is still hand-written.
 */
/** The unexpected-failure options every settings route had (`sendAdminFailure`'s operation + copy). */
const SETTINGS_MOUNT = {
  authorization: "direct" as const,
  failure: { operation: "routes/settings", message: "The settings request could not finish." },
};

/** The port fields plus readiness, the ledger and Tovu's protected-namespace fence. `authorize` is
 *  read per request, as the hand-written routes read `deps.authorize`. */
function settingsBaseDeps({ deps }: { deps: SettingsRouteDeps }, _optional: Record<string, never> = {}) {
  const authorize: AdminJsonRoutePortDeps["authorize"] = (params) => deps.authorize(params);
  return { workspaceId: deps.workspaceId, authorize, settingsReady: deps.settingsReady, settingsRepo: deps.settingsRepo, writeFence: SETTINGS_WRITE_FENCE };
}

/** Base deps plus the host-composed settings service, built per request like the old handlers did. */
function settingsServiceDeps({ deps }: { deps: SettingsRouteDeps }, _optional: Record<string, never> = {}) {
  return { ...settingsBaseDeps({ deps }), settingsService: () => createTovuSettingsService({ deps }) };
}

/** Reads also get the cross-principal read policy (second grant check + its permission name). */
function settingsReadDeps({ deps }: { deps: SettingsRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    ...settingsServiceDeps({ deps }),
    resolveReadTarget: (input: { requestedPrincipalId: string | undefined; callerPrincipalId: string }) => resolveUserLayerReadTarget({ deps, input }),
    crossPrincipalReadPermission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION,
  };
}

export const registerAdminSettingsRegisterDefinitionsRoute: SettingsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const writeDeps = { ...settingsBaseDeps({ deps }), writeServiceDeps: () => toWriteServiceDeps(deps) };
  mountAdminJsonRoute({ errors, app, spec: settingsRegisterDefinitionsRoute, deps: writeDeps }, SETTINGS_MOUNT);
};

export const registerAdminSettingsGetEffectiveRoute: SettingsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: settingsGetEffectiveRoute, deps: settingsReadDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsGetRawRoute: SettingsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: settingsGetRawRoute, deps: settingsReadDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsListDefinitionsRoute: SettingsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: settingsListDefinitionsRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsSetRoute: SettingsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: settingsSetRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsClearRoute: SettingsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: settingsClearRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsResetRoute: SettingsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: settingsResetRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export function createSettingsModule(deps: SettingsRouteDeps): ServerModuleHandle<RouteRegistration> {
  return {
    name: "settings",
    registerRoutes: ({ errors, app }, _options = {}) => {
      registerAdminSettingsRegisterDefinitionsRoute({ errors, app, deps });
      registerAdminSettingsGetEffectiveRoute({ errors, app, deps });
      registerAdminSettingsGetRawRoute({ errors, app, deps });
      registerAdminSettingsListDefinitionsRoute({ errors, app, deps });
      registerAdminSettingsSetRoute({ errors, app, deps });
      registerAdminSettingsClearRoute({ errors, app, deps });
      registerAdminSettingsResetRoute({ errors, app, deps });
      registerAdminSettingsEventsRoute({ app, deps });
    },
  };
}

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

/**
 * The timers this stream schedules on, falling back to the globals.
 * @complexity O(1).
 */
function resolveFeedTimers({ feedTimers }: { feedTimers: FeedTimers | undefined }, _options: Record<string, never> = {}): Required<FeedTimers> {
  const { scheduleInterval = setInterval, clearScheduledInterval = clearInterval } = feedTimers ?? {};
  return { scheduleInterval, clearScheduledInterval };
}

export const registerAdminSettingsEventsRoute = ({ app, deps }: { app: Express; deps: SettingsEventsDeps }, _optional: Record<string, never> = {}): void =>
  registerSettingsEventsRoute({
    workspaceId: deps.workspaceId,
    resolveTimers: () => {
      const timers = resolveFeedTimers({ feedTimers: deps.feedTimers });
      return { schedule: ({ work, ms }) => timers.scheduleInterval(work, ms), clear: ({ timer }) => timers.clearScheduledInterval(timer as IntervalHandle) };
    },
    settingsRepo: { findDefinitionBySettingId: input => deps.settingsRepo.findDefinitionBySettingId(input) },
    readHead: () => deps.settingsRepo.maxRevisionSeq(), readRevisions: input => deps.settingsRepo.listRevisionsSince(input),
    collect: collectChangedNamespaces,
    reauthorize: ({ principalId, workspaceId, includePreview }) => authorizeChangeFeed({ authorize: deps.authorize, principalId, workspaceId, includePreview }),
    createPreviewFeed: createThemePreviewFeed,
    readPreview: () => deps.themesDir ? readThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath }) : null,
    isReservedPath: isReservedThemePreviewPath,
    report: ({ phase, error }) => console.error(phase === "head" ? "[settings] change feed could not read the revision head" : phase === "poll" ? "[settings] change feed poll failed" : "[settings] change feed re-authorization failed", error),
    headFailureText: "Live settings updates stopped because the server could not read the latest settings change. Reload the page to reconnect.",
    mount: ({ path, handle }) => { app.get(path, asyncRoute({ handler: (req, res) => handle({
      admission: {
        rejectForeignWorkspace: () => rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId }),
        get settingsReady() { return deps.settingsReady; },
        principal: () => getAuthedPrincipal(res),
        report: err => console.error("[settings] change feed admission failed", describeErrorForLog({ err })),
        includePreview: () => req.query.themePreview === "1",
        authorize: ({ principalId, includePreview }) => authorizeChangeFeed({ authorize: deps.authorize, principalId, workspaceId: deps.workspaceId, includePreview }),
        json: (body, status) => res.status(status).json(body),
      },
      request: {
        httpVersionMajor: () => req.httpVersionMajor, lastEventId: () => req.headers["last-event-id"]?.toString(),
        afterRevision: () => req.query.afterRevision, themeRevision: () => req.query.themeRevision,
        writeHead: (status, headers) => { res.writeHead(status, headers); },
        write: ({ frame }) => { res.write(frame); }, end: () => { res.end(); },
        onClose: ({ close }) => { req.on("close", close); res.on("close", close); },
      },
    }) })); },
  });
