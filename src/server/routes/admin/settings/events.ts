import {
  collectChangedNamespaces,
  type ChangeFeedViewer,
} from "../../../../features/settings/change-feed";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { SettingsRouteRegistrar } from "./deps";

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
 * coordination to get wrong. The cost is one indexed `seq > ?` lookup per tick.
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
 * `features/settings/change-feed.ts` deems visible to the subscribing principal. A client re-reads
 * through the ordinary authorized `getSettingsEffective` path, so this endpoint cannot become a
 * way to obtain a value the caller could not already fetch. `settings.read` gates the subscription
 * itself, matching `get-effective.ts`.
 */

/** How often the ledger is checked. Fast enough that a change feels immediate, slow enough that an
 *  idle tab costs ~1 indexed lookup/sec. */
const POLL_INTERVAL_MS = 1_000;

/** Comment frames keep proxies and load balancers from reaping an idle connection. */
const KEEPALIVE_INTERVAL_MS = 25_000;

/** Ledger rows examined per tick. Bounds a client resuming after a long absence — the remainder is
 *  drained on the following ticks rather than loaded at once. */
const REVISION_PAGE_SIZE = 200;

export const registerAdminSettingsEventsRoute: SettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/settings/events", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    let principal: { id: string };
    try {
      await deps.settingsReady;
      principal = getAuthedPrincipal(res);
    } catch {
      res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" });
      return;
    }

    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "settings.read",
      workspaceId: deps.workspaceId,
      entityType: "setting-value",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'settings.read' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "settings.read", reason: authResult.reason },
      });
      return;
    }

    const viewer: ChangeFeedViewer = { workspaceId: deps.workspaceId, principalId: principal.id };

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Defeats nginx response buffering, which otherwise holds frames until the buffer fills —
      // indistinguishable from the feed being broken.
      "X-Accel-Buffering": "no",
    });

    /**
     * Resume point. `Last-Event-ID` is set by the browser automatically on `EventSource`'s own
     * reconnect, so a dropped connection replays the writes missed in the gap instead of silently
     * skipping them. A fresh subscriber starts at the current head — it has just loaded its values,
     * so replaying history would only make it re-read what it already has.
     */
    const resumeFrom = Number(req.headers["last-event-id"]);
    let cursor = Number.isFinite(resumeFrom) && resumeFrom >= 0 ? resumeFrom : await deps.settingsRepo.maxRevisionSeq();

    /** Namespace per settingId, cached for the connection's life: a settingId's namespace changes
     *  only via `renameDefinition`, which appends its own revision and so re-notifies anyway. */
    const namespaceBySettingId = new Map<string, string | null>();
    const resolveNamespace = async (settingId: string): Promise<string | null> => {
      const cached = namespaceBySettingId.get(settingId);
      if (cached !== undefined) return cached;
      const definition = await deps.settingsRepo.findDefinitionBySettingId({ settingId });
      const namespace = definition?.namespace ?? null;
      namespaceBySettingId.set(settingId, namespace);
      return namespace;
    };

    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer);
      clearInterval(keepaliveTimer);
    };

    /**
     * One poll. Never throws: a transient read failure must not tear down a subscription the client
     * would then reconnect anyway, and `cursor` is left untouched so the same window is re-examined
     * on the next tick rather than skipped.
     */
    const tick = async (): Promise<void> => {
      if (closed) return;
      try {
        const revisions = await deps.settingsRepo.listRevisionsSince({ sinceSeq: cursor, limit: REVISION_PAGE_SIZE });
        if (revisions.length === 0) return;

        const batch = await collectChangedNamespaces(revisions, viewer, resolveNamespace);
        // Advance even when nothing was visible, so writes this viewer cannot see are examined once
        // rather than on every tick forever.
        cursor = Math.max(cursor, batch.cursor);
        if (closed || batch.namespaces.length === 0) return;

        res.write(`id: ${cursor}\n`);
        res.write("event: settings-changed\n");
        res.write(`data: ${JSON.stringify({ namespaces: batch.namespaces })}\n\n`);
      } catch (error) {
        console.error("[settings] change feed poll failed", error);
      }
    };

    const pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    const keepaliveTimer = setInterval(() => {
      if (!closed) res.write(": keepalive\n\n");
    }, KEEPALIVE_INTERVAL_MS);

    // `close` fires on tab close, navigation, and `EventSource.close()` alike. Without this the
    // timers outlive the response and every reconnect leaks another pair.
    req.on("close", close);
    res.on("close", close);

    // An opening comment flushes headers immediately, so the client's `onopen` fires now rather
    // than whenever the first real change happens to arrive.
    res.write(": connected\n\n");
  });
};
