### A23. Edge-First Architecture

**What it is:** Design for edge deployment from the start — compute runs at CDN nodes close to users worldwide. No centralized origin for the hot path. Static assets, database reads, and even AI inference happen at the edge.

**Why it matters:** Sub-50ms latency globally. Linear scale with no single bottleneck. Resilience — no single region failure takes down the system.

**When to use for Tovu:** The `@tovu/db-turso` and `@tovu/http-bun` adapters already support edge deployment. The pattern is most valuable for the public-facing site (content delivery) where read latency is user-visible. The admin UI is lower priority for edge deployment.

**When NOT to use:** Operations requiring strong consistency across writes, complex server-side sessions, or Node.js-specific APIs. The admin mutation path (create, publish, delete content) does not need edge deployment.

```typescript
// Cloudflare Workers — database and AI at the edge
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cache = caches.default;

    // Edge cache check first
    let response = await cache.match(request);
    if (response) return response;

    // SQLite at the edge (D1) — sub-millisecond read
    const content = await env.DB.prepare(
      `SELECT * FROM contents WHERE slug = ? AND status = 'published'`
    ).bind(url.pathname.slice(1)).first();

    if (!content) return new Response('Not Found', { status: 404 });

    // AI inference at the edge (Workers AI)
    const summary = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `Summarize in one sentence: ${content.body.slice(0, 1000)}`
    });

    response = new Response(renderHTML(content, summary), {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600'
      }
    });

    await cache.put(request, response.clone());
    return response;
  }
};
```

---

