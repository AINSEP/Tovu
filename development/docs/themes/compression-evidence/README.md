# Theme screenshot compression evidence

Pixel-level before/after crops backing the `fuel` theme's screenshot conversion
(`content/themes/static/fuel/screenshots/index.png` -> `index.jpg`, quality 85,
709,913 -> 113,705 bytes, -84%). Committed 2026-08-12 alongside that change so the
"no visible quality loss" claim has evidence on disk instead of only a report.

Both crops are 3x-zoomed 300x300/200x500 regions pulled from the original PNG
(recovered from git history, commit `3d36d44`) and the shipped JPEG, chosen as the
two spots JPEG artifacts are most likely to show:

- `fuel-gradient-before-png.png` / `fuel-gradient-after-jpg-q85.png` — a flat gradient
  patch with no detail to hide 8x8 DCT blocking or banding.
- `fuel-text-before-png.png` / `fuel-text-after-jpg-q85.png` — the highest-contrast
  large text on the page ("EMBER"), where ringing/haloing around sharp edges would be
  most visible.

Visual verdict: indistinguishable at this zoom level in both spots. No blocking,
banding, or ringing artifacts found.

Only 2 of the theme set's 9 `index.png` screenshots (`fuel`, `tailark-quartz-dark`)
were converted to JPEG — the other 7 are flat, text-heavy UI screenshots where JPEG
came out the same size or *larger* than PNG at every quality tested (50-85), so they
stay PNG-only. See `Themes.tsx`'s `ThemeCardPreview` doc comment for the full
reasoning and the fallback chain (`index.jpg` -> `index.png` -> placeholder).

**Tooling note for future image work in this repo:** `sips` is the only image tool
available on this machine. It has no real PNG optimizer — a plain
`sips -s format png` re-encode made every PNG tested *larger*, not smaller — and its
WebP output silently no-ops (echoes success, produces no file). Install
`pngquant`/`oxipng`/`cwebp` before attempting further image compression here.
