# `content/` — stock data that ships with the product

Everything here is **stock**: tracked in git, shipped in a release, and **read-only at runtime**.
Nothing in this tree holds a single `.ts` file — it is data that used to live inside `src/`, which
made it look like source code and made an upgrade look like a code change.

| Directory        | What it is                                     | Read by                                              |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `themes/`        | The stock theme catalog, plus `__marketplace__` (a local fixture standing in for a remote marketplace) and `__original-themes__` (pristine copies for "reset to original") | `builtInThemesDir()` — `src/server/deps.ts` |
| `templates/`     | Site templates (`starter/`), the seed content a brand-new site is built from | `readTemplate()` — `src/platform/site-dir/read-template.ts` |
| `agent-plugins/` | Agent Plugins bundled with the product         | `bundledAgentPluginsDir()` — `src/server/deps.ts`    |
| `public/`        | Static assets served at the site root (`/agent-icons/*`) | `src/server/app.ts`                          |

## `content/` vs `sites/`

They are the two halves of the 2026-08-27 split, and confusing them is the bug it was made to
prevent:

- **`content/` is stock.** Tracked. An upgrade REPLACES it. Never written to at runtime.
- **`sites/` is user data.** Gitignored, one folder per site, writable. An upgrade must never
  touch it.

`seedSiteThemes()` (`src/features/theme/seed-site-themes.ts`) is the one bridge: on a site's first
boot it copies `content/themes/` into `<site>/themes/`. From then on the site reads and writes only
its own copy — the Theme Studio's file editor, the agent theme tools, marketplace downloads and the
`__original-themes__/` resets all target `siteThemesDir()`, never this tree. That is why a site's
edited themes and their own backups survive an upgrade: they were never inside the package.

## Paths resolve two levels up, and that is load-bearing

Every reader resolves this tree package-relative via `import.meta.dirname` — never `process.cwd()`,
which is wrong the moment `tovu serve` is invoked from outside the checkout (CR-R04).

`src/server/` and `dist/src/server/` are each exactly two levels below their own root, so the one
expression `resolve(import.meta.dirname, "../../content/themes")` lands on `<repo>/content/themes`
under `tsx` and on `dist/content/themes` in the compiled tree. `npm run build` copies each directory
here to `dist/content/<name>/`, cleaning the target first so a file deleted from source cannot
survive in `dist/` forever. `src/server/__tests__/unit/stock-content-dirs.unit.test.ts` asserts both
halves of that.

Each of the four directories can still be relocated independently at runtime:
`TOVU_STOCK_THEMES_DIR`, `TOVU_BUNDLED_AGENT_PLUGINS_DIR`.
