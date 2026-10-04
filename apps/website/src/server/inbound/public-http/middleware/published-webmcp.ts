import type { Express, Request, Response, NextFunction } from 'express';
import { injectPublishedWebMcp } from '#src/features/webmcp/published-html';

/** A single response seam covers static-theme, templated and HTML-format pages,
 * product pages and the local app used by static export. No route renderer needs
 * a WebMCP dependency. Requests for assets/admin/APIs never read this policy. */
export function applyPublishedWebMcp(
  { app, readEnabled }: { app: Express; readEnabled: () => Promise<boolean> },
  _optional: Record<string, never> = {},
): void {
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD'].includes(req.method) || /^\/(?:admin|api|theme-assets|assets)(?:\/|$)/.test(req.path)) {
      next(); return;
    }
    let enabled = false;
    try { enabled = await readEnabled(); } catch { /* Policy read failure disables tools, not the page. */ }
    const send = res.send;
    res.send = function (body: unknown): Response {
      const type = String(res.getHeader('content-type') ?? '');
      if (typeof body === 'string' && res.statusCode < 400 && (type.includes('text/html') || (!type && /^\s*(?:<!doctype html|<html\b)/i.test(body)))) {
        body = injectPublishedWebMcp({ html: body, enabled });
      }
      return send.call(this, body);
    };
    next();
  });
}
