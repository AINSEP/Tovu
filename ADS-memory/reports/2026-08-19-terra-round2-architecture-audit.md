# Terra Round 2 — Architecture / Pattern / Bug Audit

**Auditor:** Codex `gpt-5.6-terra`, reasoning effort `xhigh`, codex-cli 0.147.0
**Dispatched:** 2026-08-19T18:00:50Z · **HEAD:** e9faf6be · **Result:** turn.completed, 0 errors
**Packet:** ADS-memory/.local-artifacts/external-audit/packets/20260819T173500Z-audit-packet-round2-architecture.md
**Raw offload (GITIGNORED, may be `git clean`ed):** ADS-memory/.local-artifacts/external-audit/offloads/20260819T180050Z-round2-arch/codex/

**Why this round existed:** Round 1 was ESM-only (Terra's own scope statement: "reviewed every
`require()`/`require.resolve()` site"). The user asked for architectural violations, pattern
deviations, and logic bugs. This round explicitly excluded ESM ground.

**Score: 8.0/10 — FAIL** (below the 8.5 floor), on the single finding below.

---

## Coordinator verification of ARCH-001 (independently confirmed before acting)

| Terra's claim | Verified? | Evidence |
|---|---|---|
| Staging dirs exist | YES | `.tovu-migrate-staging-basic-14cece79e115`, `.tovu-migrate-staging-basic-44b2198fd799` |
| They are COMMITTED, not local scratch | YES | `git ls-files` -> **60 tracked files** |
| Both declare `"id": "basic"` | YES | both `theme.json` -> `basic` (hence 3 total "basic" entries) |
| Added by commit `39096e15` | YES | `39096e15` Leona Burime, Aug 18 — the ESM root-flip commit |

**Provenance correction:** prior session handoffs listed the duplicate-"basic" symptom as a
restricted path belonging to another session's in-progress theme work, and told future sessions
not to chase it. That is WRONG. These directories were swept into the user's OWN ESM-flip commit
by a broad `git add`. All fix-target files are clean in the working tree. It is safe to fix.

**`mui-marketing` is NOT a bug** — Terra checked and cleared it: absent `apiVersion` makes the
loader expect `pages/index.html`, so it is invalid and filtered by `validThemeIds`.

---

## Terra's report (verbatim)

## Finding ARCH-001

- Severity: medium
- Confidence: high
- File: [src/features/theme/theme.ts:869](/Users/la/Programming/Tovu/src/features/theme/theme.ts:869)
- What is wrong: discovery treats every direct child directory as a theme. That includes the committed `.tovu-migrate-staging-basic-*` scratch directories, which each declare `"id": "basic"`.
- Why it is wrong: migration deliberately leaves staging output for failed/dry-run inspection ([migrate-theme.ts:32](/Users/la/Programming/Tovu/src/features/theme/migration/migrate-theme.ts:32), [284](/Users/la/Programming/Tovu/src/features/theme/migration/migrate-theme.ts:284)), but `discoverAllBuiltInThemes` only excludes engine/catalog names ([theme.ts:934](/Users/la/Programming/Tovu/src/features/theme/theme.ts:934)). `loadTheme` marks those directories invalid for folder/id mismatch ([theme.ts:677](/Users/la/Programming/Tovu/src/features/theme/theme.ts:677)), yet retains manifest id `basic`; the admin list exposes all discovered themes ([list.ts:83](/Users/la/Programming/Tovu/src/server/routes/admin/themes/list.ts:83)) and several consumers resolve by first matching id. This explains the three `basic` entries. The staging directories were accidentally added in commit `39096e15`.
- Concrete fix: exclude `.tovu-migrate-staging-*` in `discoverThemes` (and reject it in static-asset resolution), remove the committed staging directories, add an ignore rule, and add a discovery test proving scratch output is neither listed nor resolvable.

`mui-marketing` is not a recursive-scanning defect: it is a direct child of `themes/static`, so current discovery intentionally sees it. Its absent `apiVersion` makes the loader expect `pages/index.html` ([theme.ts:610](/Users/la/Programming/Tovu/src/features/theme/theme.ts:610)); it is therefore invalid and filtered by `validThemeIds`. I did not count it as a separate finding.

Overall score: **8.0/10 — FAIL** (below the 8.5 floor).

Out-of-scope fatal warnings: none beyond the staging-directory issue above, which is reported because it affects discovery behavior.

## Solid coverage

- RouteDeps extraction: sampled five groups and their historical diffs—Navigation `85c74499`, Analytics `60888d61`, ChangeSet `e4399465`, DatabaseRecovery `dda7a6c7`, PluginRuntime `4136d3f2`. Each diff only relocated the same fields into an intersected interface; neither composition root’s runtime construction changed. Current wiring remains present in [deps.ts:710](/Users/la/Programming/Tovu/src/server/deps.ts:710), [747](/Users/la/Programming/Tovu/src/server/deps.ts:747), [811](/Users/la/Programming/Tovu/src/server/deps.ts:811), and [855](/Users/la/Programming/Tovu/src/server/deps.ts:855).
- Theme v2 assets: checked `fuel`, `portfolite`, and `tailark-dusk`. Their pages use `css/theme.css` and `scripts/` (for example [fuel index:8](/Users/la/Programming/Tovu/src/themes/static/fuel/render/pages/index.html:8)); the renderer rewrites those exact v2 paths ([static-asset-contract.ts:74](/Users/la/Programming/Tovu/src/features/theme/static-asset-contract.ts:74)), and the server exposes static theme roots ([app.ts:1104](/Users/la/Programming/Tovu/src/server/app.ts:1104)). No dangling runtime asset reference found in those three themes.
- Widgets spot-check: the shared narrow `WidgetsRouteDeps` composer avoids a back-edge to `RouteDeps` and the sampled mutation route uses it consistently.