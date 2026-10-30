import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { resolveWorkspaceOrigin, toAbsoluteUrl } from "@jini-ai/cms/seo";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { resolveActiveTheme } from "#src/features/theme/active-theme";
import { readPreviewSwitcher, choosePreviewTheme } from "#src/features/theme/preview-switcher";
import { decoratePreviewPage } from "#src/features/theme/preview-switcher-html";
import type { RouteDeps } from "#src/server/routes/types";
import { setRequestRenderTheme } from "./render-theme-override.js";

const COOKIE = "tovu_theme_preview";
const EXCLUDED = /^\/(?:admin|api|theme-assets|theme-explore|theme-preview|m|site-chat|agent-icons|assets)(?:\/|$)/;

function isPageRequest({ request }: { request: Request }, _options = {}): boolean {
  return ["GET", "HEAD"].includes(request.method) && !EXCLUDED.test(request.path);
}

type PreviewPage = Omit<Parameters<typeof decoratePreviewPage>[0], "html">;

function queryValue({ request }: { request: Request }, _options = {}): string | undefined {
  return request.query.theme === undefined ? undefined : String(request.query.theme);
}

function requestChoice({ request, config, activeThemeId }: {
  request: Request; config: PreviewPage["config"]; activeThemeId: string;
}, _options = {}) {
  const delivery = request.get("x-tovu-static-export") === "1" ? "static" as const : "live" as const;
  const variant = delivery === "static" ? /^\/_themes\/([A-Za-z0-9_-]+)(\/.*)?$/.exec(request.path) : null;
  const choice = choosePreviewTheme({ config, activeThemeId, query: variant?.[1] ?? queryValue({ request }),
    cookie: delivery === "live" ? parseCookie(request.headers.cookie ?? "")[COOKIE] : undefined });
  return { delivery, variant, choice };
}

function stripVariantPrefix({ request, path }: { request: Request; path: string }, _options = {}): void {
  const queryStart = request.url.indexOf("?");
  request.url = path + (queryStart === -1 ? "" : request.url.slice(queryStart));
}

async function preparePreviewPage({ request, response, deps }: { request: Request; response: Response; deps: RouteDeps }, _options = {}): Promise<PreviewPage | undefined> {
  await deps.siteTitleReady;
  const active = resolveActiveTheme(deps, await resolveActiveThemeId(deps));
  if (!active || typeof active === "string") return undefined;
  const activeThemeId = active.manifest.id;
  const config = await readPreviewSwitcher({ ...deps, activeThemeId });
  if (!config.enabled) return undefined;
  const { delivery, variant, choice } = requestChoice({ request, config, activeThemeId });
  if (variant && !config.themes.some(theme => theme.themeId === variant[1])) {
    response.sendStatus(404); return undefined;
  }
  if (variant) stripVariantPrefix({ request, path: variant[2] ?? "/" });
  setRequestRenderTheme({ response, themeId: choice.themeId });
  persistChoice({ request, response, choice, delivery });
  const origin = await resolveWorkspaceOrigin({ originRegistry: deps.originRegistry, workspaceId: deps.workspaceId, runtimeMode: deps.seoDeps.runtimeMode }, {});
  return { config, activeThemeId, currentThemeId: choice.themeId, path: request.path,
    origin: origin ? toAbsoluteUrl({ origin, path: "/" }, {}) : undefined, preview: choice.preview, delivery };
}

/** Public preview adapter: choices stay in res.locals; the real page/product routes still render.
 * The send seam covers every theme tier and export without a new renderer. */
export function applyThemePreviewSwitcher({ app, deps }: { app: Express; deps: RouteDeps }, _options = {}): void {
  app.use(async (req, res, next) => {
    if (!isPageRequest({ request: req })) return next();
    try {
      const page = await preparePreviewPage({ request: req, response: res, deps });
      if (res.headersSent) return undefined;
      if (page) decorateResponse({ response: res, page });
      next();
    } catch (error) { next(error); }
    return undefined;
  });
}

function decorateResponse({ response, page }: { response: Response; page: PreviewPage }, _options = {}): void {
  const send = response.send;
  response.send = function (body: unknown): Response {
    if (typeof body === "string" && String(response.getHeader("content-type")).includes("text/html")) {
      response.vary("Cookie");
      if (page.preview) response.set("Cache-Control", "private, no-store");
      body = decoratePreviewPage({ ...page, html: body });
    }
    return send.call(this, body);
  };
}

function persistChoice({ request, response, choice, delivery }: {
  request: Request; response: Response; choice: ReturnType<typeof choosePreviewTheme>; delivery: "live" | "static";
}, _options = {}): void {
  if (delivery === "static") return;
  const options = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: request.secure };
  if (choice.reset) response.clearCookie(COOKIE, options);
  else {
    if (choice.cookie !== undefined) response.cookie(COOKIE, choice.cookie, options);
  }
}
