# Brief — i18n language expansion, Group 5 (Operations: database, integrations, recovery, workspace)

**Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` in full first.** It is mandatory and this
brief assumes it. Run log slug: `i18n-expansion-group-5-operations`.

**A `<<SUBAGENT_DISPATCH>>` marker precedes this brief in your dispatch message — that means you
skip `AI-Dev-Shop/AGENTS.md`'s interactive bootstrap. Do NOT skip this brief or RUN-PROTOCOL.md.**

## What this is

Tovu's admin app (`apps/admin`) already has Spanish i18n shipped across every feature, plus a
shared architecture (just landed on this branch, commit `300406e`) that makes adding a language a
pure data change: no component code, no new tests, no per-language logic branches anywhere.

Your job: extend **17 named languages** into **4 specific files** (your disjoint slice — five other
cloud agents are doing five other disjoint file groups in parallel, each independently committing
to this same branch; do not touch files outside your list).

## Read these files first — they are the whole contract

- `apps/admin/src/lib/i18n-common.ts` — the shared cross-feature dictionary, already populated with
  all 17 languages. Your files do NOT need to repeat these words — they fall back automatically.
- `apps/admin/src/lib/dictionary-translator.ts` — the shared lookup every file's `t()` routes
  through. You are only adding data.
- `apps/admin/src/lib/template-i18n.ts` — `interpolate()`, used throughout your files' template
  constants below.

## Your four files

- `apps/admin/src/features/database/database-i18n.tsx` — has `DATABASE_DICT` (flat, add 17 blocks)
  **plus one more constant**: `PLAN_READY_FRAGMENTS` (`Record<locale, {before, after}>` — the
  sentence splits around an embedded `<code>{planId}</code>` element; add all 17 locales, matching
  where the `<code>` element should sit in each language's sentence — look at the `es:` entry for
  the pattern).
- `apps/admin/src/features/integrations/integrations-i18n.tsx` — has `INTEGRATIONS_DICT` (flat, add
  17 blocks) **plus two more constants**: `DELETE_WEBHOOK_FRAGMENTS` (`Record<locale, {before,
  after}>`, splits around an embedded webhook label) and `ACTIONS_FOR_WEBHOOK_TEMPLATE`
  (`Record<locale, string>`, a `{label}`-token template) — add all 17 locales to both.
- `apps/admin/src/features/recovery/recovery-i18n.tsx` — has `RECOVERY_DICT` (flat, add 17 blocks)
  **plus five more constants**: `SINCE_DISCARD_FRAGMENTS` (`{before, after}` around an embedded
  `<strong>{createdAt}</strong>`), `UNKNOWN_DISCARD_COUNT_PREFIX` (`Record<locale, string>`, a
  prefix sentence fragment), `BASELINE_UNAVAILABLE_TEXT` (`Record<locale, string>`, a complete
  static sentence with no interpolation at all), `RESTORE_PLAN_READY_FRAGMENTS` (`{before, after}`
  around an embedded `<code>{planId}</code>`, same shape as `database-i18n.tsx`'s
  `PLAN_READY_FRAGMENTS` above — reuse the same wording pattern in each language for both, they're
  near-duplicate sentences about a "plan" being ready), and `RESTORE_DONE_FRAGMENTS`
  (`{before, middle, after}` around two embedded values, a `<code>` id and a passed-through status
  node) — add all 17 locales to every one of these five.
- `apps/admin/src/features/workspace/workspace-i18n.ts` (`WORKSPACE_DICT`) — flat dictionary only.
  (Confirm this is still true when you open it — things may have shifted since this brief was
  written.)

## The 17 locale codes, exact spelling (must match exactly)

`id` (Bahasa Indonesia), `de` (Deutsch), `zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese,
Taiwan), `pt-BR` (Portuguese, Brazil), `ru` (Russian), `fa` (Farsi/Persian), `ar` (Arabic), `ja`
(Japanese), `ko` (Korean), `pl` (Polish), `hu` (Hungarian), `fr` (French), `uk` (Ukrainian), `tr`
(Turkish), `th` (Thai), `it` (Italian). The existing `es:` block in each file/constant is done — do
not change it. There is no `en:` block — English is the dictionary key itself.

## Quality bar

- Write natural, professional software-UI language per locale, not a literal gloss. For the
  fragment constants (`{before, after}` etc.), the embedded dynamic value's position in the
  sentence may legitimately differ by language — follow each language's own natural word order,
  same as the `es:` entry already does relative to English.
- Reuse the same target-language term for a recurring English source string within a file.
- Arabic (`ar`) and Farsi (`fa`) are right-to-left — write correct RTL-script text content only, no
  markup/layout changes (separate, already-logged gap, not your concern).
- Only translate human-facing UI copy — not identifiers or machine-readable codes.

## Testing — do NOT add new tests, do NOT run the full suite

Pure data change. No new tests, ever, per locale — standing repo policy. After finishing each file,
run its existing scoped test(s) only, from `apps/admin/`:

```
npx vitest run src/features/database/__tests__/Database.unit.test.tsx src/features/database/__tests__/use-timeline-section.unit.test.ts src/features/database/__tests__/use-restore-points-section.unit.test.ts src/features/database/__tests__/use-migrate-forward-section.unit.test.ts
npx vitest run src/features/integrations/__tests__/rules.unit.test.ts src/features/integrations/__tests__/Integrations.unit.test.tsx src/features/integrations/__tests__/IntegrationDeliveries.unit.test.tsx
npx vitest run src/features/recovery/__tests__/rules.unit.test.ts src/features/recovery/__tests__/Recovery.unit.test.tsx src/features/recovery/__tests__/use-restore-flow.unit.test.ts src/features/recovery/__tests__/use-recovery.unit.test.ts
npx vitest run src/features/workspace/__tests__/rules.unit.test.ts src/features/workspace/__tests__/Workspace.unit.test.tsx
```

If one fails, it's a syntax error in your edit — fix it, don't work around it.

## Persisting your work

Follow RUN-PROTOCOL.md exactly: run log first, incremental commits (one per file finished), push to
`refactor/jini-admin-extraction`, fallback branch `i18n-expansion-group-5-overnight` if rejected.
Never gate a commit behind green tests.
