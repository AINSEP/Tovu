import { escapeHtml } from "@jini-ai/core/text";
import type { LandingPageInput, LandingTheme } from "@jini-ai/devops/backup/site/static-download-landing";

/** @file This host's exported landing page: the root `index.html` of every static download and repository commit.
 * The markup, CSS and unprefixed class names (`card`, `badge`, `open`, ...) are the shipped static-site HTML and are
 * byte-pinned (`__tests__/static-download-landing.pin.test.ts`); renaming them would change every new export.
 * Jini's portable layout builds the page list and calls this through the injected `renderLanding` port. */

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f5f2;--card:#fff;--ink:#1c1b19;--muted:#6b6760;--line:#e4e1da;--accent:#2d5bd7;--badge:#e7efff}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1d1b;--ink:#f1efe9;--muted:#a19d95;--line:#33312d;--accent:#8fb0ff;--badge:#24314f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:1080px;margin:0 auto;padding:48px 24px 64px}
header{margin-bottom:32px}
.eyebrow{margin:0 0 4px;color:var(--muted);font-size:13px;letter-spacing:.06em;text-transform:uppercase}
h1{margin:0;font-size:clamp(28px,5vw,40px);line-height:1.15;overflow-wrap:anywhere}
.meta{margin:8px 0 0;color:var(--muted)}
.note{margin:16px 0 0;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--muted);font-size:14px}
.themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}
.card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;min-width:0}
.card.active{border-color:var(--accent)}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
h2{margin:0;font-size:19px;line-height:1.3;overflow-wrap:anywhere}
.badge{flex:none;padding:2px 10px;border-radius:999px;background:var(--badge);color:var(--accent);font-size:12px;font-weight:600;white-space:nowrap}
.count{margin:4px 0 14px;color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.open{display:inline-block;align-self:flex-start;margin-bottom:14px;padding:8px 14px;border-radius:8px;background:var(--accent);color:var(--card);font-weight:600;text-decoration:none}
ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
li a{display:block;padding:9px 0;border-bottom:1px solid var(--line);color:var(--ink);text-decoration:none}
li:last-child a{border-bottom:0;padding-bottom:0}
li a:hover span{color:var(--accent);text-decoration:underline}
li span{display:block;overflow-wrap:anywhere}
li small{display:block;margin-top:1px;color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:480px){main{padding:28px 16px 40px}.themes{grid-template-columns:1fr}}
`.trim();

/** One theme card: name, active badge, page count, open-home button and every page link. */
function themeCard({ theme }: { theme: LandingTheme }, _options = {}): string {
  const count = `${theme.pages.length} ${theme.pages.length === 1 ? "page" : "pages"}`;
  const home = theme.pages[0];
  return `<article class="card${theme.active ? " active" : ""}"><div class="card-head"><h2>${escapeHtml({ text: theme.title })}</h2>`
    + (theme.active ? `<span class="badge">Active theme</span>` : "") + `</div>`
    + `<p class="count">${count} · sites/${escapeHtml({ text: theme.folder })}/</p>`
    + (home ? `<a class="open" href="${escapeHtml({ text: home.href })}">Open ${escapeHtml({ text: home.label === "/" ? "home page" : home.title })}</a>` : "")
    + `<ul>${theme.pages.map(page => `<li><a href="${escapeHtml({ text: page.href })}"><span>${escapeHtml({ text: page.title })}</span><small>${escapeHtml({ text: page.label })}</small></a></li>`).join("")}</ul></article>`;
}

/**
 * Root index.html of a static download: works from file:// and in Quick Look with no script.
 * Every name and title is escaped; hrefs are plain relative paths to delivered files.
 * @complexity O(total listed pages), no effects.
 * @example staticLandingPage({ siteName: "My Site", themes });
 */
export function staticLandingPage({ siteName, exportedWords, themes }: LandingPageInput, _options = {}): Buffer {
  const site = escapeHtml({ text: siteName });
  const meta = [exportedWords ? `Exported ${exportedWords}` : "", `${themes.length} ${themes.length === 1 ? "theme" : "themes"}`].filter(Boolean).join(" · ");
  return Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${site} — static copy</title><style>${STYLE}</style></head><body><main>`
    + `<header><p class="eyebrow">Static copy</p><h1>${site}</h1><p class="meta">${escapeHtml({ text: meta })}</p>`
    + `<p class="note">Quick Look can't follow links — open this file in your browser.</p></header>`
    + `<section class="themes">${themes.map(theme => themeCard({ theme })).join("")}</section></main></body></html>\n`);
}
