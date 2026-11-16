# Audit-2 B-row executable sheets (planning, 2026-11-16)

Written against Tovu `integ/wave-b` 10378809 and Jini `integ/wave-b` ab8711ed by an unattended planning run (docs only, no source edited, nothing executed). Branch `plan/audit2-sheets-b`. Sheets live in `sheets/audit2/`; each has a `.census.txt` sidecar where an importer census was taken (planning-time script output, to be re-run by the executor). Every blob guard in the sheets was checked to exist as a git object in one of the two integ/wave-b trees.

| id | kind | sheet | slices | tier | blockers | status | est executor tokens |
|---|---|---|---|---|---|---|---|
| B01 | MOVE | `move-B01-publish-transfer.md` | 1 (2 commits: Jini, Tovu) | Sonnet + Opus review of the arg-shape conversions | after wave B merge (C3/C4/C5 importer lines in composition/routes); creates `cms/publish` + `cms/publish/node` | READY (after wave B merge) | 140k |
| B02 | SPLIT/MOVE | `split-B02-publish-apply-engine.md` | S1-S5 (S5 = 5a + 5b) | S1/S3 Sonnet+Opus review; S2/S4 Sonnet; S5 Opus | row 140 framework must land in `cms/publish` under current file names; B01; apply-loop/applyReport (~375 lines), raw contributors and buildPublishContentImportHooks exceed the size gate and need an Opus split first | PARTIAL: S1, S3(after split draft), S4 specified; S2 and S5 design only | S1 90k, S2 120k, S3 80k, S4 60k, S5 290k |
| B03 | SPLIT | `split-B03-publish-peers.md` | P3 -> P1 -> P2 -> P4 (order fixed in the sheet) | Opus draft, Sonnet execute | B02 S1-S4, row 140, C5 (HttpClientPort/vault contracts already in core), audit A01 for P4 | PARTIAL: P1-P3 specified to declaration level; P4 blocked | P1 120k, P2 40k, P3 130k, P4 60k |
| B04 | SPLIT/MOVE | `split-B04-theme-engine.md` | T1-T5 | T1/T3 Sonnet; T2 Sonnet + Opus review; T4/T5 Opus | row 162 (`theme-files`, `render-contract`), new deps handlebars/liquidjs (coordinator), admin SPA alias repoint | PARTIAL: T1-T3 READY after wave B merge; T4 blocked, T5 design only | T1 70k, T2 90k, T3 45k, T4 110k, T5 250k |
| B05 | MOVE | `move-B05-newsletter-campaign.md` | 1 | Sonnet + Opus review of `types.ts` split | C3 `DataModuleDecl` in core (else split), barrel policy for `features/newsletter/index.ts` | PARTIAL (headers and positional-export check by rule, not verbatim) | 150k |
| B06 | HARDEN | `harden-B06-yauzl-special-entry-refusal.md` | 1 (2 commits: Jini, Tovu) | Sonnet; Opus reviews the Jini diff first (SECURITY, 7 points in the sheet) | Jini commit startable now; Tovu commit after R-BARRELS (same file; rows 1421-1424, 2085) | READY (Tovu half after R-BARRELS) | 70k |
| B13 | DELETE | `delete-B13-plugin-forwarders.md` | 2 (S1 plugin DTO, S2 agent installer) | Sonnet | S1 after R-BARRELS (rows 2080, 2210); S2 after R-BARRELS + C4/C6/C11 (`agent-daemon-scope.ts`), harness binding key rename required | READY (after those lanes) | 45k |
| B26 | SPLIT | `split-B26-plugin-host-helpers.md` | S1 module importer, S2 access lowering, S3 widget partials (independent) | Sonnet (S1 + Opus read of containment) | Tovu edits after R-BARRELS (host-binding.ts, pages.ts, plugin-runtime.ts, host-tool-binding.ts); Jini side startable now | READY (Tovu after R-BARRELS); S2/S3 low ROI, skippable | S1 70k, S2 35k, S3 40k |
| B09 | SPLIT | `split-B09-root-key-provisioning.md` | S1-S3 | S1 Sonnet; S2 Opus | row 57 keyring/sealer parity (no sheet yet), ports | PARTIAL: S1 specified, S2/S3 design | S1 50k, S2 200k, S3 60k |
| B12 | HARDEN | `harden-B12-form-delivery-source-gone.md` | 1 (2 commits) | Sonnet | after wave B merge (C3 touches `form-delivery.ts`); red-first test written in the sheet | READY (after wave B merge) | 45k |

## Not reached (budget)
B06, B07, B08, B10, B11, B13-B33 have no sheet from this run. Next in value order: B06 (yauzl special-entry refusal, security, after R-BARRELS), B07 (vault rotate verify-before-persist, startable now, security), B08 (per-feature publish contributors, after B02), B10/B15 (theme lifecycle/render helpers, after B04).

## What the sheets decided that other plans must honour
- Row 140's framework (planner, type-registry, content-hash, seed-hash, run-repo, file-tree-policy, report-contract, ui/contract, ...) must land in `packages/cms/src/publish/` with its CURRENT file names and export names, so B02/B03 files keep their relative imports. B01 creates the directory and the two entries; row 140 only appends `export *` lines.
- `composite-blob-source.ts` moves with B03 (needs `PeerBlobSource`); `content-references.ts` waits for row 140 + the entry-refs extractor.
- B04 T1 also moves `theme-layout.ts` and `static-asset-contract.ts` (rows 162/B15 files) and removes the `@tovu/theme-layout` alias from the admin SPA; mark them in `CLASSIFY-files.tsv`.
- Product strings stay Tovu values passed in: `data-tovu-island`, `.tovu-lineage.json`, `tovu_migrations` table prefix, the `"tovu-peer"` history kind, "Tovu instance" peer wording, `TOVU_PUBLISH_CONTENT_DEV_HOSTS`.
- Open for the owner: two new npm deps for B04 T5 (handlebars, liquidjs) versus injected template validators; barrel policy for `features/newsletter/index.ts` after B05.
