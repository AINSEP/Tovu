import { publishVisitorPage } from '#src/features/theme/visitor-publication';
import type { Express, Request, Response, NextFunction } from 'express';
import { injectPublishedWebMcp } from '#src/features/webmcp/published-html';

/** A single response seam covers static-theme, templated and HTML-format pages,
 * product pages and the local app used by static export. No route renderer needs
 * a WebMCP dependency. Requests for assets/admin/APIs never read this policy. */
export function applyPublishedWebMcp(
  { app, readEnabled, allowsVisitorPublication, workspaceId }: { app: Express; workspaceId?: string; readEnabled: () => Promise<boolean>; allowsVisitorPublication?: (args: { path: string }) => Promise<boolean> },
  _optional: Record<string, never> = {},
): void {
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD'].includes(req.method) || /^\/(?:admin|api|theme-assets|assets)(?:\/|$)/.test(req.path)) {
      next(); return;
    }
    let enabled = false;
    // The export marker is scoped to the crawl request, just like the visitor-chat opt-out.
    // Disable before injection; the same owner also removes native form-tool annotations.
    try { enabled = req.get('x-tovu-static-export') !== '1' && await readEnabled(); } catch { /* Policy read failure disables tools, not the page. */ }
    const send = res.send;
    res.send = function (body: unknown): Response {
      const type = String(res.getHeader('content-type') ?? '');
      if (typeof body === 'string' && res.statusCode < 400) {
        const htmlType = type.includes('text/html') || (!type && /^\s*(?:<!doctype html|<html\b)/i.test(body));
        if (htmlType) {
          body = injectPublishedWebMcp({ html: body, enabled });
          // Most HTML (and all assets/API responses) needs no publication lookup. Defer the
          // authoritative content read until the rendered document actually contains the widget.
          if (allowsVisitorPublication && req.get('x-tovu-static-export') !== '1' && (body as string).includes('tovu-site-assistant-root')) {
            const html = body as string;
            void allowsVisitorPublication({ path: req.path }).catch(() => false).then(allowed => {
              const published = allowed ? publishVisitorPage({ html, path: req.path, workspaceId }) : html;
              send.call(this, published);
            }).catch(next);
            return this;
          }
        }
      }
      return send.call(this, body);
    };
    next();
  });
}
