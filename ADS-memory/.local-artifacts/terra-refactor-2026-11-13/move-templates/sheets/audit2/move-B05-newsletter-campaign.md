# MV-newsletter-campaign-1: newsletter campaign domain -> `@jini-ai/cms/newsletter` (template T-MOVE)

Row: audit2 B05. Written 2026-11-16 against Tovu `integ/wave-b` 10378809 / Jini `integ/wave-b` ab8711ed. **Status PARTIAL**: file guards, census and mapping are final; two steps need a decision/precondition the executor must verify (below) and the header rewrites are specified by rule, not verbatim (1.7k lines, 9 files).
untangle_overlap: **YES -> execute after wave B merge.** C3 (`DataModuleDecl` into core) decides `types.ts`'s one db import; C5 (`core/contracts/mail`) is already present in Jini (`packages/core/src/contracts/mail.ts:7` `OutboundEmail`, `mail/ports.ts:12` `MailerPort`), so the mail imports are resolvable today; C4 does not touch these files. The census lists only 2 outside importers (both tests) plus the in-feature siblings that STAY (`agent-tools, confirmation, data-module-manifest, delivery/*, deps-builders, index, repo*.ts, send-pipeline, subscriptions, tool-registrations, unsubscribe`): those import the moved files by `./x.js` and are rewritten to `@jini-ai/cms/newsletter`.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
Tier: Sonnet 5.5 high + Opus review of the `types.ts` split. est. executor tokens: ~150k. Two commits (Jini, Tovu).

## Target
`packages/cms/src/newsletter/` -> `@jini-ai/cms/newsletter` (universal; none of the 9 files imports `node:`; verify with `rg -n "from ['\"]node:" <files>` printing nothing). New isolation domain `newsletter`, entry + README + changeset exactly as B01 J-3/J-4/J-7 (mechanical copy of that pattern; `jini.entries` `"./newsletter": "universal"`).

```
id: MV-newsletter-campaign-1
feature: website/features/newsletter (campaign domain)
tovu_files:
  - apps/website/src/features/newsletter/campaign-write-service.ts | blob 17459c006414aeacca27abb863cec2646b1f34a7 | delete
  - apps/website/src/features/newsletter/campaign.ts | blob bf4ec9a73aec0b5f5cd035a9ba9e3af1e2b39448 | delete
  - apps/website/src/features/newsletter/errors.ts | blob aa0dc540b67da4d7e06222f8be2c5473fffd5d6c | delete
  - apps/website/src/features/newsletter/hooks.ts | blob c5a1923e4a03e9e929f91fd2ffb192ec085f6806 | delete
  - apps/website/src/features/newsletter/launch-gate.ts | blob f28cdda68b997951fc2ccfe99fbab204951138cf | delete
  - apps/website/src/features/newsletter/lists.ts | blob 2186f660c0709394a8ffddc0518084363e5a550e | delete
  - apps/website/src/features/newsletter/ports.ts | blob 157a6d598d38df9c6acf98a24d5c2d90307c3304 | delete
  - apps/website/src/features/newsletter/repo.memory.ts | blob 3fd8336f1cec0c324d91fbf04eed22340ae89d77 | delete
  - apps/website/src/features/newsletter/types.ts | blob 2609a95e7765515213340e67d35a82e95105c55f | delete
jini_guards:
  - packages/cms/src/newsletter must not exist; packages/cms/package.json blob = value after the previous cms slice (record it in the report)
  - rg -n "createCampaignWriteService|InMemoryNewsletter|NewsletterMailerPort|launchGate" packages/*/src prints nothing (executor derives the exported names with `rg -n "^export" <9 files>` and checks each)
symbol_map: every exported name keeps its name; specifier ./x.js (in-feature) / #src/features/newsletter/x -> @jini-ai/cms/newsletter
leaf_import_rewrites:
  - hooks.ts, launch-gate.ts, ports.ts: `../../platform/mail/index.js` -> `@jini-ai/core/contracts/mail` (names: OutboundEmail, MailerPort — both exported there; verify the subpath with `rg -n "contracts/mail" packages/core/package.json`; if absent use the deep `@jini-ai/core/contracts` entry that exports them, else STOP)
  - ports.ts: `export type { MailerPort } from "../../platform/mail/index.js";` is a forwarder: DELETE (owner rule 19); the in-feature importers of `MailerPort` from `./ports.js` (census) import it from `@jini-ai/core/contracts/mail` instead
  - types.ts L20: `import type { DataModuleDecl } from "@jini-ai/db/data-modules";` — cms may NOT import `@jini-ai/db`. PRECONDITION (C3): `rg -n "DataModuleDecl" packages/core/src --glob '!**/__tests__/**'` must hit (the declared-schema type moved to core). Hit -> import it from `@jini-ai/core/contracts/storage` (or the exact core leaf the hit names). No hit -> split `types.ts`: the declaration(s) that use `DataModuleDecl` (executor: `rg -n "DataModuleDecl" types.ts`; expected one `export const ... : DataModuleDecl`/type alias near the "core-mediated own-tables (ADR-023 dataModule, p_newsletter__*)" section, L135+) STAY in Tovu in a new `features/newsletter/data-module-types.ts`, everything else moves. Any other `@jini-ai/db` use = STOP.
  - campaign-write-service.ts, lists.ts, campaign.ts, repo.memory.ts: `@jini-ai/core/primitives|records|list-page|contracts/events|contracts/server/verified-origin` unchanged (core, rule 5b); in-feature `./errors.js|./ports.js|./types.js|./campaign.js` unchanged (same directory)
header_rewrite: each file's `@file` block: remove ADR numbers, `p_newsletter__*` table prefix mentions (product table names -> "the host's own-tables"), `../features/plugins`, plan paths and Task numbers; keep every why (rule 12). Tovu table names/prefix STAY in Tovu (`data-module-manifest.ts`, `repo.sqlite.ts`, `repo.rows.ts` are not moved).
shape check: exported functions already take `(required, optional)`? executor lists any positional export with `rg -n "^export (async )?function \w+\((?!\{|required|input|deps)" -P <files>`; a positional export = STOP and report (convert in-place with callers only if <= 5 call sites, else SKIPPED).
values_injected: - (the 9 files carry no env, no product wording beyond comments; `launch-gate.ts` takes the mailer and origin check as ports already)
census: `python3 -I scripts/census.py . campaign-write-service,campaign,errors,hooks,launch-gate,lists,ports,repo.memory,types features/newsletter` (planning output: `move-B05-newsletter-campaign.census.txt`) plus `rg -n "features/newsletter/(campaign|errors|hooks|launch-gate|lists|ports|repo.memory|types)" apps development` for `#src` forms; allowed: the listed siblings, `features/mail-status/__tests__/delivery-visibility.unit.test.ts:10`, `features/site-backup/__tests__/import.fixture.ts:39`, and `index.ts` (re-export lines of the moved names are DELETED, not kept: its importers repoint).
importer_edits: scripted per specifier form as in B01 (`./x.js`, `../x.js`, `../../newsletter/x.js`, `#src/features/newsletter/x` -> `@jini-ai/cms/newsletter`); `features/newsletter/index.ts` is the one file where a re-export of a moved name exists: executor deletes those `export ... from "./x.js"` lines and repoints every importer of the barrel name that was moved (census `rg -n "from \"#src/features/newsletter(/index)?\"" apps` lists them; for each moved name used, import it from `@jini-ai/cms/newsletter`). If more than 12 files are affected: SKIPPED, report the count (Opus decides barrel policy).
tests (blobs; move-to-jini, node:test -> vitest as in B01 J-5):
  - features/newsletter/__tests__/campaign-write-service.test.ts | blob a4f0012eee29848a1a544835b12221f4bc3011b3 | move-to-jini
  - features/newsletter/__tests__/campaign.characterization.test.ts | blob ef41711573718e5a35d2f8334e71cffd24a5285d | move-to-jini
  - features/newsletter/__tests__/campaign.list-cursor.test.ts | blob 8ce93940a21c72b727edc7b162b57247a3918b79 | move-to-jini
  - features/newsletter/__tests__/campaign.test.ts | blob c7b6e3e8e6ede902ff1967321b3e86915c56f8db | move-to-jini
  - features/newsletter/__tests__/errors.test.ts | blob 228e03dfdbe3b86758323fbe8ab0cfcbeaa61fe6 | move-to-jini
  - features/newsletter/__tests__/hooks.test.ts | blob 226b3751cfb55639e587006a97b54f39cc56c6c1 | move-to-jini
  - features/newsletter/__tests__/launch-gate.test.ts | blob b837baf357a66ab2223f4b5c0225b999398088c3 | move-to-jini
  - features/newsletter/__tests__/lists.test.ts | blob bb03817a9a8b33a47011746512c0102b5b6d6b94 | move-to-jini
  - features/newsletter/__tests__/types.test.ts | blob eaefcca78a0054c93b92ce3bb515a003f8984948 | move-to-jini
changeset: @jini-ai/cms: minor | "New @jini-ai/cms/newsletter subpath: campaign domain (campaign model and write service, lists, errors, hooks, launch gate, ports, in-memory repo and types)."
jini_msg: "feat(cms): newsletter campaign domain under @jini-ai/cms/newsletter" | tovu_msg: "refactor(newsletter): use @jini-ai/cms/newsletter for the campaign domain"
extra_stops: a moved file's blob differs; `hooks.test.ts`/`launch-gate.test.ts` import a Tovu mail fake from `platform/mail` (then the test stays in Tovu, repointed); `types.test.ts` asserts the data-module declaration (stays in Tovu).
```

## Expected afterwards (batched cloud run)
Jini: vitest `packages/cms/src/newsletter/__tests__`, subpath-isolation/packaging contracts, complexity gates. Tovu: typecheck website, the remaining newsletter tests. RED-first: none (pure moves).
