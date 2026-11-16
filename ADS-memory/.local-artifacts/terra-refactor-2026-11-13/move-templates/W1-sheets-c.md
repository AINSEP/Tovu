# W1 move sheets, group C (features 29-40) — 2026-11-16

Planning only; nothing executed. Sheets written from Tovu `b28d38c6` / Jini `b7666092` (both `refactor/terra`); all 53 path-plus-blob guards were re-checked against those HEADs (0 mismatches). Skeletons came from `scripts/make-sheet.py`. Executors get `cat T-<KIND>.md sheets/<sheet> COMMON.md`. None of these 12 features was done in W0.

| # | Feature | Sheet | Kind (re-kinded from) | Slices | Tier (sheet / exec) | Untangle overlap | Status | Est. executor tokens |
|---|---|---|---|---|---|---|---|---|
| 29 | admin/features/analytics | `sheets/delete-admin-analytics.md` | DELETE, Tovu-only fold (KIND-SUSPECT: real bodies) | 1 | Opus-filled / Sonnet | no | **BLOCKED** Q-WH | ~35k |
| 30 | admin/features/members | `sheets/dedupe-admin-members.md` | DEDUPE (from SPLIT + DEDUPE-UNVERIFIED) | 1 | Opus-filled / Sonnet | no | READY | ~45k |
| 31 | admin/features/sites | `sheets/ui-admin-sites.md` | UI: DELETE + UI + 2 hook MOVEs (from UI/DEDUPE/HARDEN labels) | 4 | Opus-filled / Sonnet | no | READY (4 jobs) | ~150k |
| 32 | admin/features/users | `sheets/dedupe-admin-users.md` | DEDUPE (from SPLIT + DEDUPE) | 1 | Opus-filled / Sonnet | no | READY | ~50k |
| 33 | admin/features/publish-content | `sheets/split-admin-publish-content.md` | STAY (from SPLIT; no Jini contract exists) | 0 | n/a | no | **BLOCKED** Q-PC + W3 SCC | 0 |
| 34 | admin/features/database | `sheets/ui-admin-database.md` | SPLIT `useCursorPages` + 6 convention files | 2 | Opus-filled / Sonnet | no | slice 2 READY; slice 1 **BLOCKED** Q-WH | ~50k |
| 35 | admin/integrations/jini-admin | `sheets/split-admin-jini-admin.md` | SPLIT (media-ports only); 5 files STAY-WIRING; ModulePanel STAY (not dead) | 1 | Opus-filled / Sonnet | yes (C2:264, C7:52-54; not on slice 1's files) | READY | ~55k |
| 36 | website/features/media-generation | `sheets/split-media-generation.md` | SPLIT: slice 1 MOVE | 3 | slice 1 Opus-filled / Sonnet; 2-3 Opus fill owed | yes (C3:460 on tool-registrations.ts; slice 3 **execute after wave B merge**) | slice 1 READY; 2-3 **PARTIAL** | ~40k (+45k +60k) |
| 37 | admin/features/media | `sheets/dedupe-admin-media.md` | DEDUPE (from SPLIT) | 1 | Opus-filled / Sonnet | no (C2:182-184 on other files) | READY | ~50k |
| 38 | admin/features/consent | `sheets/split-admin-consent.md` | SPLIT: slice 1 MOVE | 4 | slice 1 Opus-filled / Sonnet; 2-4 Opus owed | yes (C2:158 CookieConsent.tsx; slice 1 is text-guarded, 2-4 **execute after wave B merge**) | slice 1 READY; 2-3 **BLOCKED** Q-I18N / Q-AS; 4 **PARTIAL** | ~35k (+3×~50k) |
| 39 | website/features/asset-transfer | `sheets/split-asset-transfer.md` | SPLIT, contract needed | 0 now | Opus | no | **BLOCKED** Q-AT + W3 (theme, media-import) | 0 (~50k later) |
| 40 | admin/features/themes | `sheets/ui-admin-themes.md` | UI: DEDUPE + HARDEN + Opus SPLIT; visuals STAY | 3 | Sonnet / Sonnet / Opus | yes (C2:257-260; slice 2 **execute after wave B merge**) | **PARTIAL** (triage only) | ~30k + 35k + ~3×60k |

READY now: 9 executor jobs (members 1, sites 4, users 1, database slice 2, jini-admin 1, media 1), plus media-generation slice 1 and consent slice 1 = 11 jobs, ~545k Sonnet.

## Owner questions
- **Q-WH** (analytics, database slice 1; members/users side-stepped): the survey says "inline" the `*-port.hooks.ts` / `*-dependencies.hooks.ts` files, but `development/docs/architecture/wired-hooks-convention.md` requires that three-file split, and nothing moves to Jini. Which wins? Recommendation: keep the convention and mark these files STAY.
- **Q-PC** (publish-content): is site-to-live "publish content" a generic Jini capability or Tovu product? Recommendation: Tovu product, STAY.
- **Q-I18N** (consent dictionary): may Jini ship translated default dictionaries next to its components? Recommendation: yes, for chrome copy that names no product.
- **Q-AS** (consent autosave): DEDUPE onto panel-kit `useStandingDraftAutosave` (recommended) or a new primitive?
- **Q-AT** (asset-transfer): a node-only `@jini-ai/cms/media/staging` with three file ports, after W3? Recommendation: yes, after W3; STAY until then.

## Findings for the coordinator
- Re-kinds: 3 labelled SPLITs are really DEDUPE onto existing Jini twins (members, users, media). Both DELETE-labelled port/fake sets (analytics, database) are the wired-hooks convention, not dead code. jini-admin `ModulePanel.tsx` is used by a test and a commented-out mount, so it is not dead.
- New helper `scripts/wrap-call-args.py` converts positional calls to `(required)` object calls, refusing on a count mismatch. The admin-media sheet uses it.
- Rule-5 debt seen in Jini (left alone): `packages/ui/src/features/panel-kit/index.ts` re-exports `buildAgentListHandles` from `@jini-ai/agentic`, and `packages/admin/src/media/html-attributes.ts` imports `@jini-ai/cms/widgets/markers`.
- Follow-ups: admin/lib `api.setSitesHome` has no callers after sites slice 1. Jini forms/comments cursor-page hooks are DEDUPE candidates onto `useCursorPages`. Admin-media `diffMediaMetadata`/`parseOptionalPixelSize`/`filterMediaByTab` twins need a W2 behaviour diff.
