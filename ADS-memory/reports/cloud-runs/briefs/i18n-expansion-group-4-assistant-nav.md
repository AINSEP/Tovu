# Brief — i18n language expansion, Group 4 (Comments, AI Assistant, Assistant Dock, Nav)

**Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` in full first.** It is mandatory and this
brief assumes it. Run log slug: `i18n-expansion-group-4-assistant-nav`.

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

## Your four files

- `apps/admin/src/features/comments/comments-i18n.ts` (`COMMENTS_DICT`) — flat dictionary. One
  entry, `Spam: "Spam"`, is deliberately kept as the English loanword even in the `es:` block (see
  the comment above it) — use your judgment per language on whether "Spam" is also the natural
  loanword there (it usually is, across most languages' moderation UIs) or whether a native term
  reads better; either is fine, just be deliberate and consistent, don't leave it untranslated by
  accident.
- `apps/admin/src/features/ai-assistant/ai-assistant-i18n.ts` — exports `AI_ASSISTANT_DICT` only
  (no `t()` function in this file — that's correct, don't add one, the component consuming it
  indexes the dict directly). Flat dictionary, add 17 blocks. Read the file's header comment: five
  entries (`Protocols`, `Gateways`, `Configured`, `Not configured`, `Save`, `Saving…`) are
  intentionally duplicated from `@jini-ai/ui`'s own settings-dialog dictionary rather than shared —
  if you have access to that package's dictionary for a given language, match its wording for
  those five keys exactly; if you don't, translate them consistently with the rest of this file and
  note in your report which keys you couldn't cross-check.
- `apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts` — exports `ASSISTANT_DOCK_DICT`
  (flat, add 17 blocks) and a `createChatI18nAdapter(locale)` function — read that function but do
  not change its logic, it just wraps the dict; you're only adding dict data.
- `apps/admin/src/lib/admin-nav-i18n.ts` — **different shape from the others**: exports
  `translateAdminNavLabel(locale, label)` and `translateAdminNavGroups(locale, groups)`, backed by
  an `ADMIN_NAV_DICT` constant. Add 17 locale blocks to `ADMIN_NAV_DICT` — do not touch either
  function, they already route through `createDictionaryTranslator` generically and need no
  changes. This file's keys are the admin sidebar's own nav-taxonomy nouns (Content, People,
  Operations, Marketing, Studio, Pages, Posts, Media, ...) — these are proper UI category names,
  translate them as such (the way a real shipped product's sidebar would render them in that
  language), not as generic dictionary words.

## The 17 locale codes, exact spelling (must match exactly)

`id` (Bahasa Indonesia), `de` (Deutsch), `zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese,
Taiwan), `pt-BR` (Portuguese, Brazil), `ru` (Russian), `fa` (Farsi/Persian), `ar` (Arabic), `ja`
(Japanese), `ko` (Korean), `pl` (Polish), `hu` (Hungarian), `fr` (French), `uk` (Ukrainian), `tr`
(Turkish), `th` (Thai), `it` (Italian). The existing `es:` block in each file is done — do not
change it. There is no `en:` block — English is the dictionary key itself.

## Quality bar

- Write natural, professional software-UI language per locale, not a literal gloss.
- Reuse the same target-language term for a recurring English source string within a file, AND
  reuse `admin-nav-i18n.ts`'s vocabulary for a nav-category word if the same English word appears
  in one of your other three files as a heading (e.g. if "Comments" is a nav item AND a page
  heading, use the same translation both places, within each language).
- Arabic (`ar`) and Farsi (`fa`) are right-to-left — write correct RTL-script text content only, no
  markup/layout changes (separate, already-logged gap, not your concern).
- Only translate human-facing UI copy — not identifiers or machine-readable codes.

## Testing — do NOT add new tests, do NOT run the full suite

Pure data change. No new tests, ever, per locale — standing repo policy. After finishing each file,
run its existing scoped test(s) only, from `apps/admin/`:

```
npx vitest run src/features/comments/__tests__/rules.unit.test.ts src/features/comments/__tests__/Comments.unit.test.tsx
npx vitest run src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx src/features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts
npx vitest run src/components/__tests__/AssistantDock.unit.test.tsx src/components/__tests__/AssistantDock.hooks.unit.test.tsx
npx vitest run src/__tests__/unit/nav-wiring.unit.test.ts src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts
```

If one fails, it's a syntax error in your edit — fix it, don't work around it.

## Persisting your work

Follow RUN-PROTOCOL.md exactly: run log first, incremental commits (one per file finished), push to
`refactor/jini-admin-extraction`, fallback branch `i18n-expansion-group-4-overnight` if rejected.
Never gate a commit behind green tests.
