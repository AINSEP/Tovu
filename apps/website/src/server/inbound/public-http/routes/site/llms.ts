import type { PostRepoPort } from "#src/features/post/index";
import type { SeoRouteRegistrar } from "#src/server/inbound/admin-http/routes/seo/deps";

/**
 * @file `GET /llms.txt` — public, unauthenticated (owner decision TM-TOVU-2026-08-31, per
 * `development/docs/ai-first-docs-checklist.md` "Do now" item 1). Follows the llmstxt.org
 * convention: an H1 title, a one-line blockquote summary, then H2-labeled sections of
 * `- [title](url): description` links — a curated index a coding-agent tool (Cursor, Claude
 * Code, Windsurf, Copilot, Cline, Aider) can fetch in one request to orient itself before
 * reading further. Registered ahead of the site's `/:slug` catch-all, same as
 * `registerSeoRobotsRoute`/`registerSeoSitemapRoute` (`robots.ts`/`sitemap.ts` in this
 * directory) — see `modules/seo.ts`'s file header for the ordering requirement.
 *
 * The checklist explicitly scoped this to a hand-curated list (Phase 2: "needs an explicit
 * 'which pages count as docs' tag or convention" — not built yet). `CURATED_DOCS` below is
 * that hand-maintained list; add a page here when it should be discoverable this way.
 */

const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

interface CuratedDocEntry {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

/** Hand-maintained until a real "this page is a doc" tag/convention exists (see file header). */
const CURATED_DOCS: readonly CuratedDocEntry[] = [
  { slug: "documentation", title: "Documentation", description: "Everything written about Tovu so far, in the order it makes sense to read it" },
  { slug: "quickstart", title: "Quickstart", description: "From nothing to a published post in five steps" },
  {
    slug: "how-tovu-works",
    title: "How Tovu Works",
    description: "Tovu's core model — your content, themes, and plugins all live in one folder you own",
  },
  {
    slug: "how-themes-work",
    title: "How Themes Work",
    description: "The three theme tiers, and how much trust each one requires",
  },
  {
    slug: "how-plugins-work",
    title: "How Plugins Work",
    description: "What a plugin can touch, and how it stays sandboxed from your content and your database",
  },
  {
    slug: "plugin-api",
    title: "The Plugin API",
    description: "The hook surface plugins subscribe to, and the namespaced ext field they write into",
  },
];

const LLMS_TXT_SUMMARY =
  "Tovu is a content platform you own outright: one portable SQLite database, your themes, and " +
  "your plugins live together in a single folder on a machine you control — no lock-in, no " +
  "per-seat pricing, nothing that phones home.";

/**
 * Drops any curated entry that isn't currently a published post/page — mirrors `buildSitemap`'s
 * own INV-04/05 discipline (`features/seo/sitemap.ts`): a curated slug that was renamed,
 * unpublished, or never created in this environment is silently omitted rather than linked as a
 * dead 404, so the list self-heals instead of drifting stale.
 *
 * @complexity O(n) in `CURATED_DOCS`'s fixed, small size — one indexed `findBySlug` lookup per
 *   entry, no nested iteration.
 */
async function resolveLiveDocs(deps: { postRepo: PostRepoPort; workspaceId: string }): Promise<CuratedDocEntry[]> {
  const live: CuratedDocEntry[] = [];
  for (const entry of CURATED_DOCS) {
    const post = await deps.postRepo.findBySlug({ workspaceId: deps.workspaceId, slug: entry.slug });
    if (post && post.status === "published") live.push(entry);
  }
  return live;
}

/** Pure render: `CuratedDocEntry[]` -> the CommonMark body (llmstxt.org shape, see file header). */
function renderLlmsTxt(entries: readonly CuratedDocEntry[]): string {
  const lines = ["# Tovu", "", `> ${LLMS_TXT_SUMMARY}`, "", "## Docs", ""];
  for (const entry of entries) {
    lines.push(`- [${entry.title}](/${entry.slug}): ${entry.description}`);
  }
  return `${lines.join("\n")}\n`;
}

export const registerLlmsTxtRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/llms.txt", async (_req, res) => {
    try {
      await deps.seoReady;
      const entries = await resolveLiveDocs({ postRepo: deps.postRepo, workspaceId: deps.workspaceId });
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("text/markdown").send(renderLlmsTxt(entries));
    } catch {
      res.status(500).type("text/plain").send("internal error");
    }
  });
};
