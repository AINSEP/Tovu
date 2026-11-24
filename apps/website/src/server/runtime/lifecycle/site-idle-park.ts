/** Site-serving intake fence: the express adapter and the restart copy over `@jini-ai/server`'s idle park. */
import type { RequestHandler } from "express";
import { createIdlePark } from "@jini-ai/server/shutdown/idle-park";
import { SITE_SLEEP_EXIT_CODE } from "@tovu/contracts/daemon-exit-codes";

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
  const park = createIdlePark({ hasActiveRuns, hasBackgroundWork, activeCount, stop, exitCode: SITE_SLEEP_EXIT_CODE });
  const middleware: RequestHandler = (_req, res, next) => {
    const release = park.admit();
    if (!release) { res.status(503).json({ error: "This site is restarting. Try again in a moment." }); return; }
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  return { middleware, stopIfIdle: park.stopIfIdle };
}
