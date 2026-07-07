### A25. React Server Components

**What it is:** React components that run exclusively on the server. They can access databases directly, never ship to the client bundle, and stream HTML progressively. Client components (interactive) are opt-in via `'use client'`.

**Why it matters:** Zero client bundle cost for server components. Direct database access without an API layer for data fetching. Streaming — content appears as it is ready rather than waiting for the full page.

**When to use for Tovu:** The Next.js starter (`@tovu/create-tovu-next`) uses RSC via the App Router. The admin dashboard benefits from RSC for the data-heavy parts (content lists, analytics summaries) while keeping `'use client'` for the editor and interactive components.

```tsx
// Server Component — runs on server only, no client bundle cost
// Can query DB directly, can be async
export default async function ContentPage({ params }: { params: { id: string } }) {
  // Direct DB access — no useEffect, no loading state, no API call
  const content = await db.contents.findUnique({ where: { id: params.id } });
  const [related, analysis] = await Promise.all([
    findRelatedContent(content),
    analyzeContent(content.body)
  ]);

  return (
    <div>
      <h1>{content.title}</h1>
      <AISummary analysis={analysis} /> {/* Also a Server Component */}

      {/* 'use client' boundary — this ships to browser */}
      <ContentEditor content={content} />

      {/* Streams in after the above — doesn't block initial render */}
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments contentId={content.id} /> {/* Server Component, loads async */}
      </Suspense>
    </div>
  );
}
```

---

