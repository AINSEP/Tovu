import { computeIndexableEntries, type IndexableEntry } from "#src/features/seo/index";
import type { SeoRouteRegistrar } from "#src/server/inbound/admin-http/routes/seo/deps";

/**
 * @file `GET /llms.txt` — public, unauthenticated (owner decision TM-TOVU-2026-08-31, per
 * `development/docs/ai-first-docs-checklist.md` "Do now" item 1). Follows the llmstxt.org
 * convention: an H1 title, a one-line blockquote summary, then H2-labeled sections of
 * `- [title](url): description` links — a machine-readable index a coding-agent tool (Cursor,
 * Claude Code, Windsurf, Copilot, Cline, Aider) can fetch in one request to learn the shape of the
 * whole site before reading further. Registered ahead of the site's `/:slug` catch-all, same as
 * `registerSeoRobotsRoute`/`registerSeoSitemapRoute` (`robots.ts`/`sitemap.ts` in this
 * directory) — see `modules/seo.ts`'s file header for the ordering requirement.
 *
 * 2026-09-04 rewrite: the checklist originally scoped this to a hand-curated `CURATED_DOCS` list
 * (Phase 2 note: "needs an explicit 'which pages count as docs' tag or convention — not built
 * yet"). That list drifted the moment a page was published, renamed, or unpublished outside it, so
 * this now derives the index from `computeIndexableEntries` (`features/seo/sitemap.ts`) — the same
 * publish/visibility/`noindex` filter `sitemap.xml` is built from (INV-04/05) — instead of
 * maintaining a second, hand-authored notion of "which pages count." Every published, publicly
 * visible, non-`noindex` post/page is listed; a members/paid/tiers-gated or draft page can never
 * leak here, same guarantee `sitemap.xml` gives. This is a deliberate, disclosed behavior change,
 * not silent drift — see `__tests__/llms.route.test.ts`'s file header for what it replaces.
 */

const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

const LLMS_TXT_SUMMARY =
  "Tovu is a content platform you own outright: one portable SQLite database, your themes, and " +
  "your plugins live together in a single folder on a machine you control — no lock-in, no " +
  "per-seat pricing, nothing that phones home.";

/**
 * Pure render: `IndexableEntry[]` -> the CommonMark body (llmstxt.org shape, see file header).
 * Sorted by resolved title — display order only, orthogonal to `computeIndexableEntries`'
 * inclusion/visibility rules — so the index reads as a stable, human-scannable list rather than
 * database insertion order. A page with no resolved description (no override, no site default, no
 * derivable excerpt — `SeoMeta.description` is optional) is still listed, just without the
 * trailing `: description` — never a fabricated one.
 *
 * @complexity O(n log n) in `entries.length` (the sort); the render itself is O(n).
 */
function renderLlmsTxt(entries: readonly IndexableEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.meta.title.localeCompare(b.meta.title));
  const lines = ["# Tovu", "", `> ${LLMS_TXT_SUMMARY}`, "", "## Pages", ""];
  for (const entry of sorted) {
    const description = entry.meta.description ? `: ${entry.meta.description}` : "";
    lines.push(`- [${entry.meta.title}](${entry.meta.canonical})${description}`);
  }
  return `${lines.join("\n")}\n`;
}

export const registerLlmsTxtRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/llms.txt", async (_req, res) => {
    try {
      await deps.seoReady;
      const entries = await computeIndexableEntries(
        { postRepo: deps.postRepo, settingsRepo: deps.settingsRepo, media: deps, originRegistry: deps.originRegistry },
        deps.workspaceId
      );
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("text/markdown").send(renderLlmsTxt(entries));
    } catch {
      res.status(500).type("text/plain").send("internal error");
    }
  });
};
