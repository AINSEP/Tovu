/**
 * @file Host override for `@jini-ai/ui`'s `RemixIcon` component (Defect 2, 2026-08-04 visual audit).
 *
 * ROOT CAUSE, confirmed live (`document.fonts` entry for `"remixicon"` reported `status: "error"`,
 * and every `.ri-*` glyph rendered blank/empty-square): `RemixIcon.tsx`'s own default stylesheet
 * loader (`ensureRemixIconStylesheet`, `Jini/packages/ui/src/react/components/RemixIcon.tsx`)
 * resolves its CSS via `new URL('./remixicon-font/remixicon.css', import.meta.url)`. That pattern
 * needs a real ES module `import.meta.url` to resolve against — it works in `apps/admin` (a normal
 * ESM SPA build) but this bundle is built `lib`/`iife` (`vite.config.ts`, ADR-054), and Vite/Rollup
 * cannot emit a real asset URL for an `import.meta.url`-relative reference in IIFE output. Its
 * fallback is to inline the referenced CSS as a `data:text/css;base64,...` `<link href>` instead —
 * confirmed live in the built bundle. That CSS's own `@font-face { src: url("./remixicon.woff2") }`
 * is ALSO relative, but a `data:` URI stylesheet has no real location for "relative" to resolve
 * against, so the font request never even fires (`document.fonts` shows `status: "error"` with zero
 * matching entries in `performance.getEntriesByType('resource')` — not a 404, an unattempted fetch).
 * No font loads, so every `.ri-*` icon's `content: "\eaXX"` private-use codepoint renders as tofu.
 *
 * FIX: `RemixIcon.tsx` already ships a host-override escape hatch for exactly this — it skips its
 * own injection if `document.head` already contains something marked `data-jini-remixicon` (a
 * `<link>` OR a `<style>`) by the time the first `RemixIcon` mounts. This module supplies that
 * override as a plain `<link rel="stylesheet">`, the same shape the package's own default uses, just
 * pointed at a REAL, separately-served, separately-cached pair of files instead of an
 * `import.meta.url`-relative reference that cannot resolve under this bundle's `iife` output.
 *
 * REJECTED FIRST ATTEMPT, for the record: inlining the font as a base64 data: URI (via a Vite
 * `?inline` CSS import) also fixed the glyphs, but added ~380KB (+212KB gzip) to a script
 * `render.ts` injects on EVERY page of a public site for anonymous visitors — ADR-054's first-paint
 * requirement is about `defer`, not bandwidth, so that cost does not just disappear because the
 * script is non-blocking.
 *
 * This version instead ships both `apps/site-chat/public/remixicon.css` AND
 * `apps/site-chat/public/remixicon.woff2` as plain static files. Vite's `publicDir` copies them to
 * `dist/` UNCHANGED (no hashing, no processing, no JS-bundle involvement at all), and
 * `src/server/middleware/site-chat-static.ts`'s `express.static(distDir)` mount (the same mechanism
 * that already serves `site-assistant.js`/`.css`) serves them at `/site-chat/remixicon.css` and
 * `/site-chat/remixicon.woff2` with zero server-side changes. Because both files sit in `dist/`
 * together, `remixicon.css`'s own `@font-face { src: url("./remixicon.woff2") }` resolves correctly
 * on its own — no path rewriting needed, unlike an earlier version of this fix that inlined the CSS
 * text into the JS bundle and had to string-replace that url by hand. Net JS bundle delta: this
 * module's own ~15 lines of wiring code; the font and its CSS never enter the bundle at all, and are
 * fetched by the browser as two ordinary cacheable static assets, same as `RemixIcon.tsx`'s own
 * default `<link>` does when its `import.meta.url` resolution actually works (`apps/admin`).
 *
 * `remixicon.css`/`remixicon.woff2` here are copied verbatim from
 * `Jini/packages/ui/src/react/components/remixicon-font/` (RemixIcon v4.9.1, `@jini-ai/ui@0.1.2`,
 * 2026-08-04) — not re-derived, for the same reason `widget.css`'s own header gives for copying
 * admin's design tokens verbatim: `@jini-ai/ui`'s package.json `exports` map does not expose this
 * asset path publicly, so importing it by reaching past the package boundary into `src/` would be
 * coupling this public bundle to Jini's internal file layout. Re-copy from that path (and from
 * `public/`, not `src/`, in THIS repo) if RemixIcon is ever upgraded and a needed glyph is missing.
 *
 * Installed synchronously at module load, before `main.tsx` calls `createRoot(...).render(...)` —
 * `RemixIcon`'s own injection runs from a `useEffect` on first mount, so this only has to win a race
 * against React's commit phase, not against anything earlier. Runs before every render call site,
 * not just the first `RemixIcon` render, since nothing here depends on React at all.
 */
const REMIXICON_STYLESHEET_MARKER = "data-jini-remixicon";
const REMIXICON_CSS_URL = "/site-chat/remixicon.css";

export function installRemixIconOverride(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`[${REMIXICON_STYLESHEET_MARKER}]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.setAttribute(REMIXICON_STYLESHEET_MARKER, "");
  link.href = REMIXICON_CSS_URL;
  document.head.appendChild(link);
}
