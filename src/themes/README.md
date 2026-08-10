# `src/themes/`

Built-in themes, discovered once at server boot from this directory (`builtInThemesDir()`, `src/server/deps.ts`). The full authoring guide — schema reference, request-path trace, slots/embeds/regions, worked example, and known gaps — lives at **`development/docs/themes/theme-authoring-guide.md`**. Read that before building or editing a theme; this file is just an orientation map.

## Layout

Each theme lives one folder deep under one of four tier subfolders (a fifth, `code`, is a declared type value with no implementation — do not build against it):

```
static/<id>/        complete HTML/CSS/JS pages, no templating language — 7 themes, everything live today
declarative/<id>/    JSON block trees, no executable code — 1 theme, reference-only
templated/<id>/      LiquidJS templates, sandboxed — 1 theme
handlebars/<id>/     Handlebars templates, sandboxed — directory exists, currently empty (the render
                     pipeline, security allowlist, and worker isolation are fully implemented and
                     tested; no one has authored a theme here yet)
```

`<id>` must match the folder name (`theme.json`'s `id` field is validated against it).

## Before you write a `theme.json` field and expect it to do something

Not every field in an existing theme's `theme.json` is read by the loader. `modes`, `defaultMode`, `pages`, and `slots` are written by every static theme but consumed by nothing in `src/` — see the guide's §3 for the verified field-by-field breakdown of what's actually functional vs. documentary-only.

## Don't assume nested menus render, or that every theme embeds the CMS menu

Static-theme navs render only top-level menu items (`static-render.ts`'s `renderMenuLinks` — no static theme ships submenu CSS). And not every static theme wires `data-embed-type="menu"` into its nav — one currently hardcodes its links instead, so CMS menu edits don't reach it. See the guide's §6.3/§8 for exactly which theme and why.

See `development/docs/themes/theme-authoring-guide.md` for everything else, including a minimal worked example of a new static theme.
