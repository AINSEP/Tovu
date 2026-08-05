# Admin dock's RemixIcon font is never emitted, only its CSS

Filed as a finding, not fixed — out of scope for the dispatch that found it (public-widget
Defect 2 fix; the admin dock is a separate workstream's surface, per that dispatch's own
constraints). Flagging per an explicit request to write this up rather than let it evaporate
into a chat message.

## Symptom

The admin assistant dock's composer footer (attach icon, runtime-picker chevron, send icon)
renders empty squares instead of RemixIcon glyphs — visually similar to the public-widget
Defect 2 bug (`ADS-memory/reports/refactors/...` handoff chain, same visual audit), but with a
**different root cause**. Confirmed live, not assumed to be the same bug just because the
symptom looks alike.

## Evidence

Driven headless (Playwright, real login through `/admin/`, FAB click to open the dock — see
constraints below for why not the Playwright MCP tools):

```
document.fonts entry: {"family":"remixicon","status":"error"}
```

Network trace for the two remixicon requests the page actually makes:

```
GET /admin/assets/remixicon-D9cWxkfR.css   -> 200, content-type: text/css
GET /admin/assets/remixicon.woff2          -> 200, content-type: text/html, size: 407 bytes
```

The second response's `content-type`/size are the tell: `text/html` at 407 bytes is not a font
file, it is `admin-static.ts`'s SPA index.html fallback. The literal, unhashed path
`/admin/assets/remixicon.woff2` does not exist in the built output — checked directly:

```
$ ls apps/admin/dist/assets/ | grep -i remix
remixicon-D9cWxkfR.css
```

Only the CSS got emitted as a real, hashed asset. The referenced font binary
(`remixicon.woff2`, `@jini-ai/ui`'s `packages/ui/src/react/components/remixicon-font/`) never
made it into `apps/admin/dist/assets/` at all. The admin SPA has no dedicated 404 for unmatched
asset paths (by design — `admin-static.ts` falls back to `index.html` for client-side routing),
so the missing-asset request silently 200s with HTML instead of failing loud, which is why this
was easy to miss without checking `document.fonts` or the response content-type directly.

## Why this is a different bug from the public-widget Defect 2

The public widget (`apps/site-chat`) failed because `RemixIcon.tsx`'s `new
URL('./remixicon-font/remixicon.css', import.meta.url)` pattern cannot produce a working
runtime URL under an `iife`/`lib`-mode build — Vite's fallback there was to inline the CSS as a
`data:` URI, whose own internal relative `@font-face` url then had nothing real to resolve
against, so the font *request never fired at all*.

`apps/admin` is a normal ESM SPA build, where that same `import.meta.url` pattern works and
correctly resolves to a real emitted `<link>` (confirmed: the CSS itself loads at 200 from a
real hashed path). The admin failure is downstream of that — Vite/Rollup emitted the CSS asset
but not the binary font asset the CSS's own `@font-face` references. Not yet investigated:
whether this is a `vite build` asset-inlining-limit edge case (a woff2 just over/under some
threshold behaving unexpectedly), an `assetFileNames` collision, or something specific to how
`RemixIcon.tsx`'s dynamic `new URL(...)` reference is being statically analyzed for admin's
build target versus a normal static `import`. Needs its own repro before anyone fixes it.

## Suggested next step

Whoever owns the admin dock's UI/build should reproduce with a bundle analyzer or
`vite build --debug` on `apps/admin`, confirm whether the woff2 is silently dropped or silently
misnamed, and only then decide the fix. Given the public-widget fix that was shipped alongside
this finding (a host-side `data-jini-remixicon` override pointing at a real, separately-served
static asset pair — see `apps/site-chat/src/remixicon-override.ts`), the same override pattern
would likely also fix admin with much less investigation than chasing the build-config bug,
if that turns out to be simpler than a real diagnosis of the missing-asset build defect.
