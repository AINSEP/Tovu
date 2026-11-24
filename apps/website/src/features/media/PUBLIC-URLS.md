# Public media URLs

Which `/m/...` URL a visitor, a page or an exported site may use for a media asset, and
which one it may not. Companion to `INFO.md` (the media subsystem overview).

## The public URL of a picture

A raster image (JPEG, PNG, WebP, GIF) has exactly one public URL: its **public rendition**.

```
/m/<id-or-slug>/public.v<version>/image.webp?v=<first-12-of-sha256>
```

- `<id-or-slug>` is the asset's current slug when it has a valid one, otherwise its id
  (`mediaUrlKey` in `@jini-ai/cms/media/site/public-path`). A retired slug keeps resolving.
- `public.v<version>` is the core `public` transform at its latest registered version
  (today `public.v1`, a WebP re-encode). Older versions are served only if already generated.
- The last segment (`image.webp`, or any `<name>.<ext>` an older page still carries) is
  cosmetic: the route never reads it. `?v=` is a cache-buster for replaced source bytes.
- The re-encode strips EXIF and GPS metadata. That is why this is the only public route for a
  picture.

Callers never build this string by hand. `resolveMediaPublicUrls`
(`features/media/tool-registrations.ts`) and `mediaPublicPath` produce it; the assistant tools
`media_*` return it as the asset's `url`.

## Why `/m/<slug>/original` returns 404 for a picture

`GET /m/<id-or-slug>/original` is deliberately **404 for raster images** (owner decision,
A010; pinned by "an IMAGE asset 404s here" in `server/__tests__/media-original-video-route.test.ts`).

- The raw upload can carry EXIF, GPS position and camera serials. Raw originals stay private.
- The public rendition above is the sanitized copy. Pointing an `<img>` at `/original` would
  bypass that sanitizing, so the route refuses instead of serving it.
- A 404 here is not a missing asset and not a bug. Use the public rendition URL.

`/original` (and `/original.<ext>`) is public only for byte-passthrough kinds that have no
re-encode step: video, audio and sanitized SVG. The admin-only original preview lives under
the authenticated admin API, not under `/m/`.

## Quick reference

| Asset kind | Public URL | `/original` |
|---|---|---|
| Raster image | `/m/<key>/public.v<n>/image.<ext>` | 404 |
| Video, audio | `/m/<key>/original.<ext>` | served (Range supported) |
| SVG | `/m/<key>/original.svg` (sanitized) | served |
| Document | none (not public) | 404 |
