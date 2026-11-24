import type { Express, Request, Response } from "express";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

type Env = Readonly<Record<string, string | undefined>>;

export interface DevCorsOptions {
  /** Overrides the env-derived dev check. */
  readonly isDev?: boolean;
  /** Exact origins that get CORS headers in dev. Defaults to {@link defaultDevCorsOrigins}. */
  readonly allowedOrigins?: readonly string[];
  /** Env the defaults above are resolved from. Defaults to `process.env`. */
  readonly env?: Env;
}

/**
 * Dev means the same thing it means for the local owner sign-in guard (`local-owner-signin.ts`):
 * an explicit `NODE_ENV=development` that is not also a production runtime. Anything unset or
 * unknown is NOT dev, so a server started without flags never reflects a browser origin.
 * @complexity O(1).
 */
export function isDevCorsEnabled({ env }: { env: Env }, _optional = {}): boolean {
  return env.NODE_ENV === "development" && resolveRuntimeMode({ env }) !== "production";
}

/**
 * The admin Vite dev server's own origins (`apps/admin/vite.config.ts` binds `TOVU_ADMIN_DEV_PORT`,
 * default 5173, over http or https depending on dev TLS). Only these — not every localhost port —
 * because any other local process (a malicious page served from a random port) is also "localhost".
 * @complexity O(1).
 */
export function defaultDevCorsOrigins({ env }: { env: Env }, _optional = {}): string[] {
  const port = env.TOVU_ADMIN_DEV_PORT?.trim() || "5173";
  return ["localhost", "127.0.0.1"].flatMap((host) => [`http://${host}:${port}`, `https://${host}:${port}`]);
}

/**
 * Dev-only CORS for an explicit origin allow-list. Outside dev nothing is mounted: no headers, and
 * OPTIONS requests reach normal routing instead of being answered 204 here.
 * @complexity O(1) per request.
 */
export function applyDevCors(app: Express, _optional: DevCorsOptions = {}): void {
  const env = _optional.env ?? process.env;
  if (!(_optional.isDev ?? isDevCorsEnabled({ env }))) return;
  const allowed = new Set(_optional.allowedOrigins ?? defaultDevCorsOrigins({ env }));

  app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (origin === undefined || !allowed.has(origin)) {
      next();
      return;
    }
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,PUT,PATCH,OPTIONS");
    // Preflight answered here only for an allowed dev origin; every other OPTIONS falls through.
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
}
