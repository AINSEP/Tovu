### A24. Islands Architecture

**What it is:** Server-render the entire page as static HTML, then selectively hydrate only the interactive components ("islands"). The majority of the page ships zero JavaScript.

**Why it matters:** Minimal JavaScript bundle. Fast initial paint. Progressive enhancement — the page is readable before any JS loads. Interactive components are isolated and can hydrate lazily.

**When to use for Tovu:** The public-facing site rendered by Astro is the natural fit. Content pages are mostly static — the reading experience needs no JS. Interactive islands (search, comments, AI assistant) hydrate independently and lazily.

**When NOT to use:** The admin UI is inherently interactive and state-heavy. Islands architecture would be fighting against the grain for an editor with real-time collaboration, drag-and-drop, and live previews.

```astro
---
// Server-only: runs at build time or on server
const { content } = Astro.props;
---
<html>
<body>
  <!-- Static — zero JavaScript shipped -->
  <Header />
  <article>
    <h1>{content.title}</h1>
    <div set:html={content.body} />
  </article>

  <!-- Interactive island: hydrates immediately on load -->
  <SearchBar client:load />

  <!-- Interactive island: hydrates when scrolled into view (lazy) -->
  <AIAssistant client:visible contentId={content.id} />

  <!-- Interactive island: hydrates only when user interacts -->
  <ShareMenu client:idle />

  <!-- Static — zero JavaScript -->
  <Footer />
</body>
</html>
```

---

