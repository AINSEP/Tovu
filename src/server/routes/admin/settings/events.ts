import {
  collectChangedNamespaces,
  type ChangeFeedViewer,
} from "../../../../features/settings";
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
 * The query is now workspace-predicated (see `features/settings/ports.ts`) and the cursor is
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
 * `features/settings/change-feed.ts` deems visible to the subscribing principal. A client re-reads
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

/** How often the ledger is checked. Fast enough that a change feels immediate, slow enough that an
 *  idle tab costs ~1 indexed lookup/sec. */
const POLL_INTERVAL_MS = 1_000;

/** Comment frames keep proxies and load balancers from reaping an idle connection. */
const KEEPALIVE_INTERVAL_MS = 25_000;

/**
 * How often an open stream re-checks that its principal is still allowed to read
 * settings.
 *
 * A long-lived SSE connection outlives the single `authorize()` call that opened
 * it, so revoking a principal's `settings.read` did not stop the change
 * notifications already flowing to their open tab — the grant was effectively
 * pinned for as long as they kept the connection. Re-checking on a slow interval
 * rather than per tick keeps the cost near zero (one authorize per 30s per
 * stream, versus one per second) while bounding the revocation window.
 */
const REAUTHORIZE_INTERVAL_MS = 30_000;

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
     *
     * It is nonetheless client-supplied input naming a position in a ledger shared by every
     * workspace, so it is clamped INTO the ledger. An id past the head would otherwise park the
     * cursor in the future, and `seq > cursor` would then match nothing for as long as the tab
     * stayed open — a feed that is silently and permanently dead while still looking connected.
     */
    const resumeFrom = Number(req.headers["last-event-id"]);
    const head = await deps.settingsRepo.maxRevisionSeq();
    let cursor = Number.isFinite(resumeFrom) && resumeFrom >= 0 ? Math.min(resumeFrom, head) : head;

    /** The last id written to the wire — workspace-scoped, unlike `cursor`. See where it is emitted. */
    let lastEmittedId = cursor;

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
    /** True while a `tick` is mid-flight — see the guard at the top of `tick`. */
    let ticking = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer);
      clearInterval(keepaliveTimer);
      clearInterval(reauthorizeTimer);
    };

    /**
     * Re-runs the same authorization that opened the stream, and ends it the
     * moment that stops holding.
     *
     * Never tears the stream down on an ERROR — only on an explicit denial. A
     * transient failure in the authorizer would otherwise disconnect every open
     * tab at once, which is a worse outcome than a slightly delayed revocation;
     * the next interval re-checks anyway.
     */
    const reauthorize = async (): Promise<void> => {
      if (closed) return;
      try {
        const stillAllowed = await deps.authorize({
          principalId: principal.id,
          permission: "settings.read",
          workspaceId: deps.workspaceId,
          entityType: "setting-value",
        });
        if (closed || stillAllowed.allowed) return;
      } catch (error) {
        console.error("[settings] change feed re-authorization failed", error);
        return;
      }
      close();
      res.end();
    };

    /**
     * One poll. Never throws: a transient read failure must not tear down a subscription the client
     * would then reconnect anyway, and `cursor` is left untouched so the same window is re-examined
     * on the next tick rather than skipped.
     */
    const tick = async (): Promise<void> => {
      if (closed || ticking) return;
      // `setInterval` does not await an async callback, and one tick does two
      // repo round trips plus a definition lookup per visible revision. A tick
      // slower than the poll interval would otherwise have the next one start
      // mid-await: both read the same `cursor`, both query the same window, both
      // can emit the same frame, and the `cursor` write becomes a lost update.
      ticking = true;
      try {
        // Read the head BEFORE the page, so every row counted by it was already durable when the
        // query below ran. Reading it after would let a concurrent write inflate the head past rows
        // the query never had a chance to see, and the cursor advance would skip them.
        const ledgerHead = await deps.settingsRepo.maxRevisionSeq();
        const revisions = await deps.settingsRepo.listRevisionsSince({
          sinceSeq: cursor,
          limit: REVISION_PAGE_SIZE,
          workspaceId: deps.workspaceId,
        });

        const batch = await collectChangedNamespaces(revisions, viewer, resolveNamespace);
        // Advance even when nothing was visible, so writes this viewer cannot see are examined once
        // rather than on every tick forever.
        //
        // A SHORT page is what makes that true now that the query is workspace-filtered: fewer than
        // `REVISION_PAGE_SIZE` rows means the predicate ran out of matches before it ran out of
        // ledger, so everything up to `ledgerHead` has been examined and can be skipped past.
        // Advancing only to `batch.cursor` would leave the cursor parked behind a busy neighbour's
        // rows and re-walk them on every tick for the life of the connection.
        const examined = revisions.length < REVISION_PAGE_SIZE ? ledgerHead : batch.cursor;
        cursor = Math.max(cursor, examined, batch.cursor);
        if (closed || batch.namespaces.length === 0) return;

        // Emit the WORKSPACE-scoped position, not the internal `cursor`.
        //
        // `cursor` is advanced to the global ledger head so this connection can
        // skip past other tenants' rows, but the id is the one part of the frame
        // a subscriber can read. Emitting the global head would let a tab watch
        // its own event ids jump and count another workspace's write volume — a
        // metadata channel that only exists because the ledger is shared. The
        // workspace-scoped `batch.cursor` is a valid resume point: reconnecting
        // from it re-examines rows already examined, which the workspace
        // predicate makes cheap, and cannot skip anything.
        lastEmittedId = Math.max(lastEmittedId, batch.cursor);
        res.write(`id: ${lastEmittedId}\n`);
        res.write("event: settings-changed\n");
        res.write(`data: ${JSON.stringify({ namespaces: batch.namespaces })}\n\n`);
      } catch (error) {
        console.error("[settings] change feed poll failed", error);
      } finally {
        ticking = false;
      }
    };

    const pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    const keepaliveTimer = setInterval(() => {
      if (!closed) res.write(": keepalive\n\n");
    }, KEEPALIVE_INTERVAL_MS);
    const reauthorizeTimer = setInterval(() => void reauthorize(), REAUTHORIZE_INTERVAL_MS);

    // `close` fires on tab close, navigation, and `EventSource.close()` alike. Without this the
    // timers outlive the response and every reconnect leaks another pair.
    req.on("close", close);
    res.on("close", close);

    // An opening comment flushes headers immediately, so the client's `onopen` fires now rather
    // than whenever the first real change happens to arrive.
    res.write(": connected\n\n");
  });
};
