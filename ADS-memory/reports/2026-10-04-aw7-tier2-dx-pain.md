# AW-7 Tier 2: building the content-analyzer plugin, and where it hurt

Date: 2026-10-04. Sample: the `content-analyzer` built-in (SEO score, readability, reading time,
word count, table of contents, alt-text and heading checks). It is the first plugin whose code runs
only over the plugin ABI, in a fresh Node worker per call.

Raw log: `ADS-memory/.local-artifacts/aw7-tier2/dx-pain.md` (A = analyzer, B = host, C = admin card).
Shared contracts: `ADS-memory/.local-artifacts/aw7-tier2/BRIEF.md`.

## What shipped

| Piece | Where | Commit |
|---|---|---|
| Pure scorer, TipTap adapter, summary, worker entry, manifest | `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/` | 7630f822e, 09615d90b |
| Tier-2 host: probe + one fresh worker per call, never imported in-process | `features/plugin-runtime/tier2/`, `server/runtime/plugin-tier2/` | cef9e6f17 |
| Admin "Content analysis" card in the post editor | `apps/admin/src/features/content-analysis/` | bb5d2fefa |
| `PLUGIN_PREVIEW` route, analyzer registered in both roots, admin path fix | `routes/plugins/preview.ts`, `composition/app.ts`, `deps.ts` | d63e7c8bf |
| Agent tool computes a fresh result for tier-2 plugins | `features/plugin-runtime/capability-tool-registrations.ts` | a64162856 |

## The big gaps (fix these before a third party writes a Tier-2 plugin)

1. **A Node worker is not a sandbox.** It isolates crashes and heap, not fs/network/env. ADR-024 §4's
   process sandbox (`utilityProcess` or equivalent) is still owed. Until then the tier label is a
   promise about isolation, not about security.
2. **Sideloads cannot be tier-2.** `routes/plugins/install.ts` `validatePackage` refuses any manifest
   that is not tier-3. That is correct while the worker is not a security boundary, but it means the
   only Tier-2 plugin possible today is a compiled-in one.
3. **Tier used to be only a label.** Before slice B, every tier was imported in-process. The tier-2
   seam now goes through `loadPlugin()`'s `importModule` option, so integrity and `sdkRange` still run
   first (CIC U-001).
4. **No plugin admin UI surface.** `adminSurfaces` is parsed and then ignored (`manifest.ts`), and
   ADR-025's sandboxed iframe surface is unbuilt. The editor card had to be core admin code with the
   plugin id hard-coded (C1), its 58 strings x 21 locales live in core (C9), and its report shape is
   hand-mirrored in the admin (C3).
5. **No on-demand hook.** The only hook is `content.entry.beforeSave`, so "Analyze now" and the agent
   tool both dry-run the save filter (`HookRegistry.previewBeforeSave`). A `content.entry.analyze`
   (or generic command) hook would say what is meant.
6. **`ExtPatch` is scalar-only (A2).** Structured output (checks, TOC) is stored as a JSON string and
   re-parsed by every consumer. The capability tool now decodes JSON-object/array strings, but the
   manifest still cannot declare the shape, so nothing validates it. Want: a `json` field type with an
   optional JSON Schema, validated at the BR-06 boundary.
7. **`ContentEntryDraft` has no meta description (A1, B6, C10).** The meta-description check is always
   `skip`. The value lives in the seo feature's `PostRecord.seoExtJson`. Want: an additive SDK field
   filled through a seo-owned `readMetaDescription(post)` port. The preview route accepts
   `metaDescription` but does not forward it yet.
8. **Capability tools register at daemon boot.** Enabling a plugin needs a daemon restart before its
   agent tool exists (disable is honored per call). Same as tier-3, but more visible now.

## Host and toolchain rough edges

- **B1. Main-thread `module.register()` hooks do not reach a worker** spawned with `execArgv: []`
  (Node 24.2). The worker registers its own `@tovu/sdk` resolver before any plugin import.
- **B2/B3. Jini's TS worker bootstrap registers only `tsx/cjs/api`.** A dynamic `import()` of a `.ts`
  plugin fell to Node's native type stripping (no `.js` -> `.ts` mapping), and top-level `await` in a
  CJS-transformed worker entry is a hard error. Host bootstrap registers both CJS and ESM hooks; the
  Jini `typescriptBootstrap` should take an `esm: true` option. (Jini follow-up, not done tonight.)
- **B4. tsx rewrites dynamic `import()` with a CJS-interop unwrap**, so dev and a compiled build can see
  different module shapes, and the rewrite adds a coverage branch only an `__esModule` fixture hits.
- **B5. `loadPlugin()` skips its own module snapshot when a seam is injected**, so the tier-2 seam
  snapshots a site plugin itself and re-derives `pluginRoot` (loader keeps `derivePluginRoot` private).
  Want: loader passes the resolved import path to the seam.
- **B7. The SDK backing lived inline in the composition root**, so the worker could not reuse it.
  Extracted to `invocation-core-deps.ts`; `readDefinedPlugin` moved to `plugin-export.ts`.
- **B8. ~300-400 ms per worker on this Mac**, paid by the probe and every save/preview. Fine for an
  analyzer; a hot path would need a warm pool, which "fresh worker per call" forbids. Budget:
  `TOVU_PLUGIN_TIER2_TIMEOUT_MS` (default 5000, max 60000).
- **Coverage is off for TS worker entries.** V8 coverage does not follow into the worker, so logic
  had to be split out of `worker.ts` into testable modules; BRDA positions under tsx are unreliable,
  raw `NODE_V8_COVERAGE` offsets were needed (B4).
- **A3/A4.** `PluginRuntimeSource` lives in the composition layer, so built-ins export untyped
  literals; a built-in's worker entry must resolve under `tsx` (`.ts`) and in `dist/` (`.js`) — fixed
  locally, a `builtInEntryPath()` helper is due once a second tier-2 built-in exists.
- **A6.** Root `typecheck` excludes `__tests__`; slices used scoped tsconfigs to typecheck tests.

## Admin-side rough edges

- **C2.** `AdminPost` had no `ext` although the wire always sent it. Added.
- **C4.** No per-plugin "is enabled" read or change event; the Plugins screen toggles outside the
  fetch-query cache, so the card's query uses `staleTime: 0`.
- **C5.** No `api.previewPlugin` client; plugin-facing admin features hand-roll the path.
- **C6.** Every self-fetching child of `PostEditor` must be stubbed in two suites (shared fetch queue).
- **C7.** The editor's `bodyJson` starts with a `{type:"title"}` node; the analyzer skips it (09615d90b).
  Nothing in the SDK documents it.
- **C8.** HTML-format pages (`bodyHtml`) cannot be analyzed; the card is post-editor only.

## Found while finishing (2026-10-04, late)

- **The preview route never existed.** Slice B rotated out before writing it, and slice C's card called
  `/api/admin/v1/plugins/:id/preview` (unscoped). Built as
  `/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/preview` like every sibling; the admin client
  now calls the scoped path.
- **The analyzer was never registered.** Neither root listed `CONTENT_ANALYZER_RUNTIME_SOURCE`, so the
  plugin could not be enabled at all. Both roots now list it (disabled by default).
- **Route shadowing.** `.../plugins/:pluginId/preview` also matches `.../plugins/install/preview`; the
  first registration wins, so the preview route must stay after the install routes (an install
  integration test catches the wrong order).
- **Duplicate-tool risk avoided.** The agent reaches the analyzer through the existing
  `plugin_capability_content_analyzer` tool, which now runs fresh for tier-2 plugins through an
  injected preview port, rather than a second "analyze" tool competing in `search_tools`.
- **Generic code that belongs in Jini (flagged, not moved):** `analyze-content.ts` + `summary.ts`
  (zero Tovu imports, shaped for `@jini-ai/visibility/seo`), the report type + validator both sides
  need (C3), and the TS worker bootstrap fix (B2).

## Visual checks owed (dev server was stopped)

- Post editor, Content analysis card: hidden while the plugin is off; empty state (never analyzed);
  stored report on load; "Analyze now" in flight; fresh result; each error (not enabled, not found,
  hook failed, network); score/readability bands; checks list with every status; TOC; long titles.
  In at least English plus one RTL and one long-string locale (for example `ar`, `de`).
- Plugins screen: Content Analyzer listed as a built-in, tier-2, off by default; the enable toggle
  turns the card on in an open editor after reload; disable hides it again.
