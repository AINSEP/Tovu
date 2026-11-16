# W1 sheets, Group B (features 15-28 of PLAN.md's W1 list) — PARTIAL
Run 2026-11-16, unattended, from Tovu `b28d38c6` / Jini `b7666092` (both `refactor/terra`). Docs only; no source edits. Skeletons: `scripts/make-sheet.py <feature> --kind all`. Untangle overlap: rows of `../untangle/sheets/*.repoint.tsv` naming a feature file.
None of features 15-28 is a W0 item (observability, headless-browser, routing, tool-metadata are #2, #6, #11 and outside this group); email-templates `render.ts` is the W0/E01 render move and is skipped inside #20.
Stopped at the context budget after 6 features filled to some degree; 8 features have triage sheets only (`NOT FILLED`).

| # | feature | kind (sheet) | slices | tier | untangle overlap | status | est. executor tokens |
|---|---|---|---|---|---|---|---|
| 15 | website/cli/commands | MOVE + SPLIT (`split-commands.md`) | MV-commands-1, SP-commands-1 | Sonnet | yes (C5:240, SP only; after wave B) | READY (both) | 60k + 70k |
| 16 | website/contracts/core/events | re-kind: binding layer, needs HARDEN on infra (`move-events.md`) | DL x2, MV x1 (all invalid as labelled) | Opus | yes (C3:284-291; after wave B) | BLOCKED: Q-events (which outbox port is the contract) | - |
| 17 | website/platform/db/kernel | MOVE (`move-kernel.md`) | MV-kernel-1 ready; MV-kernel-2/3, SP x4 not filled | Sonnet / Opus | yes (C3:307,310, C3t:74; not for MV-kernel-1) | PARTIAL: MV-kernel-1 READY | 60k (MV-kernel-1) |
| 18 | admin/features/observability | re-kind MOVE -> SPLIT-with-values + UI fold (`move-admin-observability.md`) | SP-1, UI-fold-1 | Sonnet+review | no | BLOCKED: precondition (admin has no `@jini-ai/diagnostics` dep; lockfile) | - |
| 19 | website/contracts/core/entry-refs | MOVE + DEDUPE (`move-entry-refs.md`) | 1 MV, 3 DD | Sonnet+review | no | NOT FILLED | ~120k |
| 20 | website/features/email-templates | SPLIT (`split-email-templates.md`) | SP-1 (render.ts skipped: W0/E01) | Opus | no | NOT FILLED (MOVE-AFTER E01) | ~90k |
| 21 | website/platform/db/migration | likely STAY (`split-migration.md`) | 1 | Opus | no | BLOCKED: Q-migration | - |
| 22 | website/features/plugin-runtime | MOVE (`move-plugin-runtime.md`) | ~6 | Sonnet / Opus | no | NOT FILLED (2 KIND-SUSPECT DELETE rows) | ~300k |
| 23 | website/features/web | SPLIT (`split-web.md`) | DL-web-1 ready; DD-web-1, SP-web-1 not filled | Sonnet | yes (C11:202, C3:464 on tool-registrations; not DL-web-1) | PARTIAL: DL-web-1 READY | 30k (DL-web-1) |
| 24 | website/features/skills | SPLIT (`split-skills.md`) | 2 | Opus | no | NOT FILLED (CORE-CONTRACT-NEEDED) | ~120k |
| 25 | website/platform/site-dir | SPLIT (`split-site-dir.md`) | ~6 | Opus / Sonnet | yes (C3t:284, duplicate-pglite-store) | NOT FILLED | ~350k |
| 26 | website/server/runtime/services | MOVE (`move-services.md`) | 2 | Sonnet | no | BLOCKED: Q-services (hosted-MCP rejection) | - |
| 27 | website/features/object-storage | SPLIT (`split-object-storage.md`) | 2 | Sonnet+review | no | NOT FILLED | ~110k |
| 28 | website/features/member-login | SPLIT (`split-member-login.md`) | 4 (one HARDEN, security) | Opus / Sonnet | yes (C3:387, C4:194; after wave B) | NOT FILLED | ~160k |

## Executable now (no overlap, no decision)
MV-commands-1, MV-kernel-1, DL-web-1. SP-commands-1 after the C5 repoint lands.

## Re-kinds (KIND-SUSPECT or wrong label)
- events: both DELETE rows hold real code (KIND-SUSPECT right); `toEnqueueOnlyOutbox` has 0 production callers, only tests; the feature is a cms<->infra outbox-port adapter layer, not a move.
- admin observability: `recent-errors-rules.ts` is not pure (Tovu wire type + repo-layout anchors + Tovu-path test fixtures) -> SPLIT-with-values; the DELETE hook is a Tovu-only UI fold.
- web: `web-page.ts` DELETE -> DEDUPE/binding (product user agent).
- db/kernel: `key-dependent-data.ts` MOVE-AFTER -> SPLIT (hard-coded product table).
- migration: MIXED -> likely STAY (drizzle schema is product; new dep otherwise).

## Owner/coordinator questions
1. Q-events: one Jini outbox port after C3 (recommended: the core-contract shape; infra adopts it; in-memory bus/outbox move to infra).
2. Coordinator: add `@jini-ai/diagnostics` to `apps/admin/package.json` (lockfile) before admin observability can move.
3. Q-migration: confirm `manifest.ts` stays in Tovu.
4. Q-services: does the hosted-MCP pilot rejection block the two hosted-federation helpers?
