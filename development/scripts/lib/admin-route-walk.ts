/**
 * admin-route-walk.ts — the Express 4 router-stack walk shared by the route gates.
 *
 * Both `check-admin-api-routes.ts` (does every admin client URL resolve?) and
 * `check-route-tool-parity.ts` (does every admin route have a chat tool?) boot the hermetic
 * `createApp()` and read `app._router.stack`. Walking the live stack, rather than grepping source,
 * also sees routes registered through `@jini-ai/http-kit` helpers that a literal
 * `app.<verb>("/api/admin...")` grep misses.
 *
 * Pure: no app import here, so the walk is unit-testable on a fake stack. Relies on Express 4's
 * `Layer` shape (`route`, `handle.stack`, `regexp`, `keys`).
 */

export interface RouterLayer {
  match(p: string): boolean;
  path?: string;
  regexp?: RegExp;
  keys?: readonly { name: string | number }[];
  route?: { path: unknown; methods: Record<string, boolean> };
  handle: { stack?: RouterLayer[] };
}

export type Resolution = "ok" | "wrong-method" | "no-route";

export interface RegisteredRoute {
  /** Upper-case HTTP verb, or `ALL` for an `app.all(...)` route. */
  readonly method: string;
  readonly path: string;
}

/** Does `method url` reach a route handler? `wrong-method` = the path matches but not the verb. */
export function resolveRoute(stack: readonly RouterLayer[], method: string, url: string): Resolution {
  let pathSeen = false;
  for (const layer of stack) {
    if (!layer.match(url)) continue;
    if (layer.route) {
      if (layer.route.methods[method.toLowerCase()] || layer.route.methods._all) return "ok";
      pathSeen = true;
    } else if (layer.handle?.stack) {
      const rest = url.slice((layer.path ?? "").length) || "/";
      const inner = resolveRoute(layer.handle.stack, method, rest.startsWith("/") ? rest : `/${rest}`);
      if (inner === "ok") return "ok";
      if (inner === "wrong-method") pathSeen = true;
    }
  }
  return pathSeen ? "wrong-method" : "no-route";
}

/**
 * Best-effort mount path of a nested router layer. Express 4 keeps only the compiled regexp
 * (`layer.path` is set per request, at match time), so this reverses `path-to-regexp`'s
 * non-terminal form: `^\/api\/x\/(?:([^\/]+?))\/?(?=\/|$)` with keys `[ws]` becomes `/api/x/:ws`.
 */
export function mountPathOf(layer: RouterLayer): string {
  if (!layer.regexp) return "";
  let src = layer.regexp.source.replace(/^\^/, "").replace(/\\\/\?\(\?=\\\/\|\$\)$/, "").replace(/\$$/, "");
  const keys = [...(layer.keys ?? [])];
  src = src.replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, () => `:${String(keys.shift()?.name ?? "param")}`);
  src = src.replace(/\\\//g, "/");
  return src === "/" ? "" : src;
}

/** Every `(method, path)` the stack routes, in registration order, nested routers flattened. */
export function listRoutes(stack: readonly RouterLayer[], prefix = ""): RegisteredRoute[] {
  const out: RegisteredRoute[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        const full = `${prefix}${typeof p === "string" ? p : String(p)}`;
        for (const [verb, on] of Object.entries(layer.route.methods)) {
          if (on) out.push({ method: verb === "_all" ? "ALL" : verb.toUpperCase(), path: full });
        }
      }
    } else if (layer.handle?.stack) {
      out.push(...listRoutes(layer.handle.stack, `${prefix}${mountPathOf(layer)}`));
    }
  }
  return out;
}
