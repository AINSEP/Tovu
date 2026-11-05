/** Site-serving intake fence. The parent suggests idle; only this process can prove it. */
import type { RequestHandler } from "express";
import { SITE_SLEEP_EXIT_CODE } from "../../../assistant/daemon-exit-codes.js";

/** Inject the ledger, the shared finalizer and the existing graceful stop. Uncertainty is busy.
 * Any HTTP request holds intake until finish or close. Disconnected handlers that keep working
 * remain protected by their finalizer, ledger or domain-job owner.
 * @returns Middleware to mount before every route and a private-channel idle operation.
 * @example const park = createSiteIdlePark({ hasActiveRuns, hasBackgroundWork, activeCount, stop }); app.use(park.middleware);
 * @complexity O(1) request state; an eligible probe uses up to two bounded existence queries.
 */
export function createSiteIdlePark({ hasActiveRuns, hasBackgroundWork, activeCount, stop }: {
  hasActiveRuns: () => Promise<boolean>; hasBackgroundWork: () => Promise<boolean>; activeCount: () => number;
  stop: (input: { exitCode: number }) => void;
}, _optional = {}) {
  let requests = 0;
  let fenced = false;
  let probing = false;
  const hasOpenWork = () => activeCount() !== 0 || requests !== 0;
  const middleware: RequestHandler = (_req, res, next) => {
    if (fenced) { res.status(503).json({ error: "This site is restarting. Try again in a moment." }); return; }
    requests++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      requests--;
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  return { middleware,
    /** Skip storage for known requests/watches, then check background owners and the ledger.
     * Recheck watches/holds and fence without yielding. A request that
     * arrives during the query must still veto shutdown; never insert an await after these checks.
     * Failures leave intake open, so the next maintenance pass can try again.
     */
    async stopIfIdle(_required = {}, _options = {}): Promise<{ idle: boolean }> {
      if (fenced || probing) return { idle: false };
      probing = true;
      try {
        if (hasOpenWork()) return { idle: false };
        if (await hasActiveRuns()) return { idle: false };
        if (await hasBackgroundWork()) return { idle: false };
        if (hasOpenWork()) return { idle: false };
        fenced = true;
        stop({ exitCode: SITE_SLEEP_EXIT_CODE });
        return { idle: true };
      } catch { fenced = false; return { idle: false }; }
      finally { probing = false; }
    },
  };
}
