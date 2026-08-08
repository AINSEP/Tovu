# Brief — i18n language expansion, Group 3 (People: users, roles, members, appearance, plugins)

**Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` in full first.** It is mandatory and this
brief assumes it. Run log slug: `i18n-expansion-group-3-people`.

**A `<<SUBAGENT_DISPATCH>>` marker precedes this brief in your dispatch message — that means you
skip `AI-Dev-Shop/AGENTS.md`'s interactive bootstrap. Do NOT skip this brief or RUN-PROTOCOL.md.**

## What this is

Tovu's admin app (`apps/admin`) already has Spanish i18n shipped across every feature, plus a
shared architecture (just landed on this branch, commit `300406e`) that makes adding a language a
pure data change: no component code, no new tests, no per-language logic branches anywhere.

Your job: extend **17 named languages** into **5 specific files** (your disjoint slice — five other
cloud agents are doing five other disjoint file groups in parallel, each independently committing
to this same branch; do not touch files outside your list).

## Read these files first — they are the whole contract

- `apps/admin/src/lib/i18n-common.ts` — the shared cross-feature dictionary (Save, Cancel, Delete,
  ...), already populated with all 17 languages. Your files do NOT need to repeat these words —
  they fall back automatically.
- `apps/admin/src/lib/dictionary-translator.ts` — the shared lookup every file's `t()` routes
  through. You are only adding data.
- `apps/admin/src/lib/template-i18n.ts` — `interpolate()` and `pickPlural()`, used by
  `users-i18n.ts` and `roles-i18n.ts` below.

## Your five files

- `apps/admin/src/features/users/users-i18n.ts` — has `USERS_DICT` (flat, add 17 blocks) **plus
  one more constant**: `PASSWORD_RESET_NOTICE_TEMPLATE` (`Record<locale, string>`, a template with
  a `{username}` token — add all 17 locales here too).
- `apps/admin/src/features/roles/roles-i18n.ts` — has `ROLES_DICT` (flat, add 17 blocks) **plus
  three more constants, none of which interpolate anything (no dynamic value, just per-locale
  text/objects)**: `ROLES_DESCRIPTION_PARTS` (`Record<locale, {prefix, linkLabel, suffix}>`),
  `ROLE_DELETE_BODY_PARTS` (`Record<locale, {prefix, suffix}>`), `POLICY_DELETE_BODY_PARTS`
  (`Record<locale, {prefix, suffix}>`) — add all 17 locale entries to each of these three too.
- `apps/admin/src/features/members/members-i18n.ts` (`MEMBERS_DICT`) — flat dictionary only.
- `apps/admin/src/features/appearance/appearance-i18n.ts` (`APPEARANCE_DICT`) — flat dictionary only.
- `apps/admin/src/features/plugins/plugins-i18n.ts` (`PLUGINS_DICT`) — flat dictionary only.

(Confirm the "flat dictionary only" files really have no template functions when you open them —
things may have shifted since this brief was written.)

## The 17 locale codes, exact spelling (must match exactly)

`id` (Bahasa Indonesia), `de` (Deutsch), `zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese,
Taiwan), `pt-BR` (Portuguese, Brazil), `ru` (Russian), `fa` (Farsi/Persian), `ar` (Arabic), `ja`
(Japanese), `ko` (Korean), `pl` (Polish), `hu` (Hungarian), `fr` (French), `uk` (Ukrainian), `tr`
(Turkish), `th` (Thai), `it` (Italian). The existing `es:` block in each file/constant is done — do
not change it. There is no `en:` block — English is the dictionary key itself.

## Quality bar

- Write natural, professional software-UI language per locale, not a literal gloss. Translate full
  sentences by meaning, following the target language's own grammar and word order — this matters
  especially for `ROLES_DESCRIPTION_PARTS`, whose `prefix`/`linkLabel`/`suffix` split exists
  precisely because word order around the embedded link differs by language; look at how the
  existing `es:` entry splits the sentence before writing the other 17.
- Reuse the same target-language term for a recurring English source string within a file.
- Arabic (`ar`) and Farsi (`fa`) are right-to-left — write correct RTL-script text content only, no
  markup/layout changes (separate, already-logged gap, not your concern).
- Only translate human-facing UI copy — not identifiers or machine-readable codes.

## Testing — do NOT add new tests, do NOT run the full suite

Pure data change. No new tests, ever, per locale — standing repo policy. After finishing each file,
run its existing scoped test(s) only, from `apps/admin/`:

```
npx vitest run src/features/users/__tests__/rules.unit.test.ts src/features/users/__tests__/use-users.unit.test.ts src/features/users/__tests__/Users.crud.unit.test.tsx src/features/users/__tests__/Users.unit.test.tsx
npx vitest run src/features/roles/__tests__/rules.unit.test.ts src/features/roles/__tests__/use-roles.unit.test.ts src/features/roles/__tests__/Roles.unit.test.tsx
npx vitest run src/features/members/__tests__/Members.unit.test.tsx
npx vitest run src/features/appearance/__tests__/rules.unit.test.ts src/features/appearance/__tests__/Appearance.unit.test.tsx
npx vitest run src/features/plugins/__tests__/Plugins.unit.test.tsx
```

If one fails, it's a syntax error in your edit — fix it, don't work around it.

## Persisting your work

Follow RUN-PROTOCOL.md exactly: run log first, incremental commits (one per file finished), push to
`refactor/jini-admin-extraction`, fallback branch `i18n-expansion-group-3-overnight` if rejected.
Never gate a commit behind green tests.
