# CRITIQUE R2 — THEMING-PLAN.md (merged A + B)

plancritic (Opus 5.5, software-architect persona), 2026-10-17, read-only. Target: `ADS-memory/reports/2026-10-17-admin-themes/THEMING-PLAN.md`.

## Verdict: **CHANGES NEEDED (small)** — 5 MUST edits to the plan text, no rethink

Every R1 MUST is applied, and I checked each one in the text. A1 storage: §P3 storage and P4a. A2 history: §3 recovery and §4. A3 no Jini extraction: P4 reuse. A4 plain folders, render-blocking bootstrap, no boot screen: P3. A5 knobs write `settings.css`: P5. A6 no preview document: §4. A7 one checker on write and serve: P3, §3. A8 seed after B, plus the upgrade rule: P3. X1: P2 done criteria. B1: P0. B2: P1 restraint. S1–S6 are also in.

All six owner requirements are covered:

| Requirement | Where |
|---|---|
| Live switch | P3 |
| Live edit | P3, but see M1 |
| Theme's own media assets | P4b, plus Media copy in P5 |
| AI edits | P4a, but see M4 |
| Backups like site themes | P4 reuse, §3 |
| Jini owns the token system | P1, P3, but see M5 |

The 6 additions mostly hold up:
- **Existing-site seeding:** needed. `seed-site-themes.ts` gates only on presence.
- **Explicit Classic fallback:** trivial, keep.
- **Reconnect hash check:** small, keep.
- **Font self-hosting for Classic:** needed. `classic/admin.css:1` is a Google Fonts `@import`, which the checker rightly rejects.

Two additions are overbuild: **duplicate private-token rewriting** (M3) and **inline-SVG normalisation** (M2). One is unnecessary: **inactive staging** (S1).

## MUST edits

| # | Edit to THEMING-PLAN.md | Why (verified) |
|---|---|---|
| M1 | **P3 loading and §3 caching:** put the package hash in the URL **path**, not the query. Use `/api/admin/v1/workspaces/:ws/admin-themes/:id/r/:pkgHash/<path>`. The server ignores `:pkgHash` and serves the live bytes (still `private, no-cache` + ETag). The CSS href and every relative `url()` then change together whenever any file changes. Delete "Asset-only changes also invalidate the active package loading generation" and replace it with this mechanism. | With `?v=` only on the CSS, a replaced image at the same path keeps the same URL. Chrome then reuses its in-document image cache, so the "swap the background" edit doesn't show live. The plan names the risk but gives no mechanism. This is not A's immutable revision tree: no snapshots, it's just a cache key. |
| M2 | **§3 token-only boundary and P3 validation:** allow `url("data:image/svg+xml,…")` and `data:image/png` inside custom-property values, capped at about 4 KB each. Keep rejecting SVG **files** as assets. Delete "normalize … inline SVG image URLs … use permitted local image assets". Keep the font self-hosting. | Classic and Glass chevrons are data-URI SVGs (`classic/admin.css:338,407`, `glass/admin.css:86,176`). Images rendered from CSS cannot run script. The SVG risk is a served, navigable `.svg` file, which uploads already reject. Converting chevrons to PNG files is extra work and loses quality on DPR 2 screens. |
| M3 | **§3 boundary, P1 and P4b:** theme-private intermediates use one fixed prefix, **`--theme-*`** (for example `--theme-blur`, `--theme-background-image`), not `--<id>-*`. Selector scoping by `data-admin-theme` already prevents collisions. Rename Glass's `--glass-*` during P1's input-only conversion. In P4b, replace "rewrites selectors **and private token namespaces/references**, updates manifest bindings" with "rewrites the theme id in selectors and the manifest". | Id-prefixed privates turn Duplicate into a rename across the CSS and the manifest's `cssVariable` bindings, and a partial rename breaks silently. The assistant also has to know the id to write a valid token. A fixed prefix keeps the checker simple: allow `--jini-theme-*` and `--theme-*`. |
| M4 | **P1 scope:** add a **navigation-rail material input**, `--jini-theme-rail-{bg,backdrop}` (it can share one role entry), defaulting to the panel inputs. Add it to the trimmed new-role list. | Owner's own example: "make the sidebar a bit more transparent." Neither Jini `variables.css` nor the Tovu themes has a rail/sidebar input; the only one is `overlay-bg-navigation`, which is for the mobile scrim. Today the rail reads the shared panel material, so a token-only edit would also change cards and dialogs. Plan A flagged this and the merge dropped it. |
| M5 | **P3 Jini runtime and file list:** put the runtime in **`@jini-ai/ui/theme`**, framework-agnostic and beside `applyAdminTheme`/`acquireFont`: `createAdminThemeRuntime({ catalog, root, document }, { storage })` covering the applier, loader, switch and edit-reload. It exports the bootstrap logic that Tovu's `index.html` mirrors. Jini admin `react/shell/use-admin-theme.ts` may get an optional thin hook. Remove `packages/admin/src/react/shell/*` as the required owner, and move `admin-theme-manifest.ts` to `packages/ui/src/core/theme/`. | Tovu does not use Jini's AdminShell theme hook. `App.tsx:1,7` imports Tovu's own `admin-themes/use-admin-theme.hooks`, and Jini's hook (`shell/use-admin-theme.ts`) is built around the inline-palette `applyAdminTheme`. Routing the runtime through the shell would push Tovu to adopt AdminShell, or leave two orchestrators. Jini UI already owns `theme/apply.ts`, the font leases and the `node` checker subpath. That keeps the owner's "Jini owns the token system" with one owner. |

## SHOULD

| # | Edit |
|---|---|
| S1 | **P3 switch/edit:** drop "stage candidate sheets inactive" for same-theme edits. Append the new link after the old one and remove older links once it loads. Document order already makes the newest sheet win, whatever order the loads finish in. Keep the stale-completion guard only for **theme switches**, where the candidate sheets are scoped to a different `data-admin-theme` and stay inert until the flip. |
| S2 | **P3 size:** change M to **L**, or split it. P3a (seed, served folder, loader, live switch/edit, bootstrap) is the owner-visible prototype. P3b covers the checker on serve, upgrade replace/preserve, font self-hosting and reconnect. As written, P3 has about 15 new or changed owners across two repos plus a Jini release. |
| S3 | **P3 storage:** don't seed an empty `settings.css` in P3. Create it on the first knob write in P5, and keep the loader tolerant of it being missing. |

## Size after edits

P0 S · P1 M (+ rail input) · P2 S–M · P3 **L** (or P3a M + P3b S–M) · P4 M · P5 S. The order stays as written: P0 → P1 (∥ P4a) → P2 → P3 → P4b → P5.

## Owner questions

There are no new ones. The 4 from R1 stand, with the defaults now built into the plan (§6): theme edits are site-wide; no per-edit undo for now; approve "Classic wins" after one P2 Chrome review; reuse `theme.edit`. None blocks P0–P2.
