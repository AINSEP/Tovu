# W1 sheets, group D (features #12, #13, #19, #27 left by groups A/B) — 2026-11-16, PARTIAL
Unattended planning run from Tovu `b28d38c6` / Jini `b7666092` (both `refactor/terra`); branch `plan/w1-sheets-d` = `plan/w1-sheets-b` + `plan/w1-sheets-a`. Docs only, no source edits, no tests run. Result: 3 of 4 features filled to zero-judgment sheets; #13 headless left (context budget, never half-filled).

| # | feature | kind (sheet) | slices | tier | untangle overlap | status | est. executor tokens |
|---|---|---|---|---|---|---|---|
| 12 | website/platform/mail | re-kinded: DELETE keep-only x3 + DEDUPE delete-and-repoint (`sheets/delete-mail.md`) | Job1 DL-mail-1+DL-mail-3, Job2 DL-mail-2, Job3 DD-mail-1 | Sonnet | yes: C5:335-337 (smtp.nodemailer.ts, index.ts), C11:145-147, C5:287, C3/C4/C6 on routes/types.ts -> **after wave B**; DL-mail-1 needs C5 landed | READY after wave B | 45k + 30k + 35k |
| 13 | website/contracts/headless | SPLIT + MOVE + DEDUPE (skeletons `sheets/{split,move,dedupe}-headless.gen.md` only) | 3 | Sonnet / Opus (plugin-host 96 lines MIXED) | yes: C3:451 (plugin-host.ts AuthorizeFn) | **LEFT** (context budget) | - |
| 19 | website/contracts/core/entry-refs | DEDUPE + MOVE + re-kinded SPLIT (`sheets/move-entry-refs.md`) | DD-entry-refs-1, MV-entry-refs-1, SP-entry-refs-1 | Sonnet; SP + Opus review | edited files only (C3 on widgets/deps.ts, type-registry.ts, html-document-store*.ts, routes/types.ts; C4 app.ts) -> **after wave B** | READY after wave B | 40k + 45k + 60k (+15k Opus) |
| 27 | website/features/object-storage | DELETE (forwarder fold) + SPLIT, target changed to `@jini-ai/cms/media` (`sheets/split-object-storage.md`) | DL-object-storage-1, SP-object-storage-1 | Sonnet; SP + Opus review | none | READY now | 20k + 60k (+15k Opus) |

Ready now (no overlap): DL-object-storage-1, SP-object-storage-1. After wave B: all mail and entry-refs slices. Executor total for ready sheets ≈ 395k Sonnet + 30k Opus review.

## Re-kinds / target changes
- mail: nothing moves to Jini — every generic body is already in `@jini-ai/platform/mail`. SPLIT rows become DELETE keep-only (SMTP wrapper class whose 12 tests are byte-for-byte twins of Jini `smtp.test.ts`; the `toJiniMailer`/`toTovuMailer` alias re-export); `mail-status.ts` keeps only the Tovu `MailProviderControl` port; `ports.ts` `MailerPort` is Jini `PositionalMailer` -> delete-and-repoint (+4 stale write-path-inventory baseline entries removed).
- entry-refs: `repo.memory.ts` DEDUPE-UNVERIFIED -> MOVE (Jini twin is only a test fixture); `extractor.ts` MOVE -> SPLIT because of a `console.warn` (Jini gets an injected `report`; Tovu keeps an `extractHtmlEntryRefs` binding that prints the identical warning). The survey's "host supplies ref-key naming" is not needed: the `*TermId`/`*RefId`/`*Id` convention is Jini's own widget registry's.
- object-storage: media-store target `@jini-ai/platform` -> `@jini-ai/cms/media` (rule 5: the result is a cms `BlobStorePort`; local disk store injected as a port). Tovu keeps `createMediaBlobStore`/`readMediaStoreEnv` signatures, so deps.ts, the 457-line unit test, the barrel identity test and the s3 overlay `.mjs` tests are untouched.

## Owner/coordinator notes
1. No owner decision needed for #12, #19, #27.
2. Coordinator: DL-mail-1's FILE_AFTER already carries C5:335/336's new specifier; mark those two C5 rows consumed when the mail job lands (or run mail after wave B as planned).
3. `write-path-inventory.baseline.json` lists `src/platform/mail/ports.ts` entries at lines 52-72 of a 20-line file (already stale); DD-mail-1 removes them — the cloud `--check` should be compared against the parent.

## Lessons
1. Several "MIXED/SPLIT" rows are now leftovers of earlier moves (wrappers/aliases over code already in Jini): check the Jini barrel first; they are DELETE keep-only, not SPLIT.
2. A survey target package can break rule 5 (platform cannot import cms): pick the package that already owns the RETURN type, and inject the other side's piece as a port.
3. Keeping the Tovu exported name+signature as a thin binding avoids repointing namespace/identity tests and path-literal `.mjs` imports (object-storage), at the cost of one small Tovu file.
