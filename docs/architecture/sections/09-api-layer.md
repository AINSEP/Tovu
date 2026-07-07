## 9. API Layer

Routes are defined as pure data structures, then mounted by whichever HTTP adapter the user chose. The core never imports Hono, Express, or Fastify.

```typescript
// packages/api/src/routes.ts

export function defineTovuRoutes(tovu: Tovu): RouteDefinition[] {
  return [
    // Content API
    {
      method: 'GET',
      path: '/api/content/:type',
      middleware: [authenticate, requirePermission('content.read')],
      handler: async (req) => {
        const items = await tovu.resolve(TOKENS.content).findMany(
          req.params.type,
          parseQuery(req.query),
        );
        return { status: 200, body: items };
      },
    },
    {
      method: 'POST',
      path: '/api/content/:type',
      middleware: [authenticate, requirePermission('content.create')],
      handler: async (req) => {
        const created = await tovu.resolve(TOKENS.content).create(
          req.params.type,
          req.body,
        );
        return { status: 201, body: created };
      },
    },
    // ... more routes
  ];
}

// packages/http-hono/src/adapter.ts — mounts the pure route definitions on Hono
import { Hono } from 'hono';
import { defineTovuRoutes } from '@tovu/api';

export function createHonoApp(tovu: Tovu): Hono {
  const app = new Hono();
  const routes = defineTovuRoutes(tovu);

  for (const route of routes) {
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    app[method](route.path, async (c) => {
      // Adapt Hono's context to Tovu's Request interface
      const tovuReq = adaptHonoRequest(c);

      // Run middleware chain
      for (const mw of route.middleware) {
        const result = await mw(tovuReq);
        if (result?.earlyReturn) return c.json(result.body, result.status);
      }

      const result = await route.handler(tovuReq);
      return c.json(result.body, result.status);
    });
  }

  return app;
}
```

The same `defineTovuRoutes` function is used by `@tovu/http-express`, `@tovu/http-fastify`, and `@tovu/http-bun`. Each adapter only needs to implement the translation from its framework's request/response types to Tovu's internal `Request` interface.

---

