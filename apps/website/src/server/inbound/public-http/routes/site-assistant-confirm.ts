import type { FrontendSessionOwner } from '@jini-ai/daemon';
/** One human-only reply route. No model tool or admin exchange can reach this visitor store. */
import type { Express, Request, Response } from "express";
import { type VisitorConfirmations, VISITOR_TOOL_REFUSAL } from "#src/assistant/visitor-services";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";

export const SITE_ASSISTANT_CONFIRM_PATH = "/api/site-assistant/confirm";
interface ConfirmRoutePorts {
  readonly confirmations: VisitorConfirmations;
  readonly resolveOwner?: (args: { req: Request }) => Promise<FrontendSessionOwner | null>;
  readonly enabled: () => Promise<boolean>;
  readonly allowsOrigin: (required: { origin: string }) => Promise<boolean>;
  readonly limiter: RateLimiter;
  readonly reportError: (error: unknown) => void;
}

/** Closed, bounded reply shape: only a visitor click's nonce and literal boolean are accepted. */
function confirmationBody({ value }: { value: unknown }, _options = {}): { challengeId: string; allow: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 2 || typeof body.allow !== "boolean") return null;
  if (typeof body.challengeId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(body.challengeId)) return null;
  return { challengeId: body.challengeId, allow: body.allow };
}

/** Fetch metadata alone is spoofable; every confirmation must match the trusted public Origin. */
async function allowsRequestOrigin({ req, ports }: { req: Request; ports: ConfirmRoutePorts }, _options = {}): Promise<boolean> {
  const origin = req.get("origin");
  if (origin === "null") return false;
  if (!origin) return false;
  return ports.allowsOrigin({ origin });
}

/** Same-origin JSON plus the human-only bearer; malformed/stale/forged/replayed IDs share a refusal.
 * Origin fallback uses trusted configuration, never Host. @complexity O(1) and bounded I/O.
 */
async function handle({ req, res, ports }: { req: Request; res: Response; ports: ConfirmRoutePorts }, _options = {}): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const budget = await ports.limiter.check({ key: resolveClientIp(req) });
  if (!budget.allowed) { res.status(429).json({ error: VISITOR_TOOL_REFUSAL }); return; }
  if (!await ports.enabled()) { res.status(404).json({ error: VISITOR_TOOL_REFUSAL }); return; }
  const body = confirmationBody({ value: req.body });
  const sameOrigin = await allowsRequestOrigin({ req, ports });
  if (!body || !req.is("application/json") || !sameOrigin) { res.status(400).json({ error: VISITOR_TOOL_REFUSAL }); return; }
  const accepted = await confirmForRequest({ req, ports, body });
  res.status(accepted ? 200 : 400).json(accepted ? { accepted: true } : { error: VISITOR_TOOL_REFUSAL });
}

/** Mount without opening a listener; route tests inject the entire trust and delivery boundary. */
export function registerSiteAssistantConfirm({ app, ports }: { app: Express; ports: ConfirmRoutePorts }, _options = {}): void {
  app.post(SITE_ASSISTANT_CONFIRM_PATH, (req, res) => {
    void handle({ req, res, ports }).catch(error => {
      ports.reportError(error);
      res.status(400).json({ error: VISITOR_TOOL_REFUSAL });
    });
  });
}

async function confirmForRequest({ req, ports, body }: { req: Request; ports: ConfirmRoutePorts; body: { challengeId: string; allow: boolean } }): Promise<boolean> {
  const owner = await ports.resolveOwner?.({ req });
  return ports.confirmations.confirm({ ...body, ...(owner ? { owner } : {}) });
}
