import assert from "node:assert/strict";

/** The slice of Express 4's private router this helper reads. */
interface RouterStackApp {
  _router: {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: unknown, res: unknown) => Promise<unknown> }>;
      };
    }>;
  };
}

/**
 * The route's own (LAST) handler, past any route-level middleware such as
 * `rejectOversizedJsonBody` -- the multi-layer counterpart of `extractRouteHandler`
 * (`src/server/__tests__/helpers/http-test-server.ts`), which only returns a route's first layer.
 * Same single narrow purpose as that helper: deliberately violating Express's own routing /
 * body-parser contracts (`req.params.<name>` always set for a matched route, `req.body` always
 * assigned) so each handler's defensive `?? ""` / `?? {}` fallback actually executes.
 */
export function lastRouteHandler(
  app: unknown,
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string
): (req: unknown, res: unknown) => Promise<unknown> {
  const layer = (app as RouterStackApp)._router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer?.route, `no ${method.toUpperCase()} route registered for path "${path}"`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}
