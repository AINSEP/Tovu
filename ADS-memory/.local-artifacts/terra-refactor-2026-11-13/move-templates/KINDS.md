# Move kinds (8)

Kind is assigned PER FILE by `scripts/classify.py` from the d1 backlog label (`opus-backlog.files.tsv`, survey 11-11) plus source signals read from the terra clone; a feature's `kind` in CLASSIFY.tsv is the kind holding most of its lines, and `kind_mix` lists all. One job = one SLICE: the files of one feature that share a kind, capped (files / lines in brackets below). A feature with several kinds runs several slices, leaf kinds first: REPOINT, DELETE, HARDEN (Jini side), MOVE, DEDUPE, UI, SPLIT, SERVER.

Totals over the 1,296 backlog files: SPLIT 342 files / 97k lines, MOVE 318 / 41k, UI 140 / 36k, SERVER 144 / 29k, HARDEN 83 / 14k, DEDUPE 108 / 8.5k, DELETE 148 / 6.7k, REPOINT 13 / 0.2k.

Signals the script computes per file (`CLASSIFY-files.tsv`): survey label, target pkg/subpath, `.tsx`/React hooks (`ui`), `express` import or `server/inbound/` path (`server`), `className=` count, `console.*`, `process.env`, SQL text, `tovu` text, Node built-ins, npm imports not declared by the target Jini package (`new_deps`), target `core` (`d2`), Tovu value imports into files that STAY (`stay_imports` = ports needed), features it imports (`tovu_deps`), prod importers, survey tier, churn since the survey commit.

---

## 1. REPOINT — Tovu file is a re-export or exact copy of a published Jini export
- Detect: label `SHIM` (or `JINI-SHIM`); non-comment content is only `export … from "@jini-ai/…"`, or a body twin with similarity 1.0; every Jini name is in the package `exports`.
- Goes: nothing (or a doc-only Jini commit that moves a why-comment onto the Jini declaration). Stays: nothing; importers are repointed, the file deleted.
- Files: the shim, its importers (static, `await import()`, `import("…").Type`; found by `scripts/census.py`, never by `rg` alone), comment lines giving a live path to the file, baselines that list it: every hit of `rg -F <repo-relative path>` over `*.json`/`*.mjs`/`*.cjs`/`*.yml` (W0: `deploy-targets/__tests__/vendor-exceptions.json`, not only `write-path-inventory.baseline.json`/`coverage-integrity-baseline.json`).
- Risks: namespace imports or export-surface tests (`import * as`, enumerating exports), module mocks, baseline gates, why-comment with no Jini home. Each is a STOP in the template.
- Tier: script (census + rewrite), Sonnet when a why-comment or baseline must move. Cost scales with EDITED FILES (importers), not source lines: a 20-line shim with 54 importers is a full Sonnet job. Worked examples: d1 `terra-lane.terra-prompt.md` (32 of 37 rows already landed), W0 `sheets/repoint-observability.md`.

## 2. DELETE — dead file, or a pass-through/barrel folded into its caller
- Detect: label `DELETE`; dossier `prodReach` dead-root/dead-cluster, 0 prod importers, or pass-through (`ALL-PASS-THROUGH`, `BARREL`); survey note names the fold ("inline", "fold", "repoint"). Reclassify a DELETE row to DEDUPE/MOVE when the file has any statement other than a re-export (function body, constant, wrapper), unless the survey note lists that statement as dead or the sheet gives it a home (`tovu_file_after: keep only`, `moved_bodies`). The classifier/filler prints `non_reexport_statements: N` per file (W0: both DELETE rows had N > 0).
- Goes: nothing (or tests that only exercise Jini code, relocated to the Jini package). Stays: the caller absorbs the one call it forwarded; a host binding the file also held stays, either in a reduced file (`keep only`) or moved next to its one caller (`moved_bodies`).
- Files: the file, its tests (delete if they test only it; repoint if they test the target), importers.
- Risks: path-loaded roots (vite entries, `spawn`/`new URL` literals, workflows) look dead to import scans; dynamic `import()` targets; a "dead" file still named in a baseline. The census includes path literals.
- Tier: script when 0 importers and no fold; Sonnet when a fold or repoint is needed.

## 3. MOVE — pure code moves to a Jini package/subpath; Tovu imports it
- Detect: label `MOVE`/`MOVE-AFTER`, not React, not Express, `stay_imports` ≤ 3 (each is a port), no `d2`, no `new_deps`. MOVE-AFTER: the named precondition (another file or a Jini surface) must already be in Jini.
- Goes: the file (verbatim + listed edits), its pure tests (to vitest), a new subpath if the code needs an optional peer or another runtime (E01). Stays: Tovu-only constants, env names, product wording, injected as values.
- Files: Jini new file + test + `index.ts` or `package.json` exports/`jini.entries` + README + changeset; Tovu importers, deleted file + test.
- Risks: Tovu text in the header; leaf vs barrel import (cycle `index → moved → index`); `universal` entry reaching `node:`; optional peers loaded through a barrel; positional args (convert in the move); arg-lane churn in importers.
- Tier: Sonnet sheet. Worked example: pilot E01 (email-template).

## 4. DEDUPE — Jini already exports the same behaviour; Tovu keeps only its binding
- Detect: label `DEDUPE` / `DEDUPE-UNVERIFIED`; dossier twin (body/norm-body/beh ≥ 0.6, module twin, same-name with `verdict` exact/superset).
- Goes: nothing, or a test-text neutralisation in Jini. Stays: Tovu's arguments (hrefs, labels, keys) and its why-comment.
- Files: the Tovu file (body → one call to Jini, or deleted with importers repointed, or a type-only file whose interface `extends` the Jini one and narrows fields), its tests.
- Risks: "same" code that differs (entity tables, error wording, return shape, side effects such as font recovery, extra filtering). The sheet must list every behaviour difference; any difference = failing test first; a difference the Jini side lacks makes it a HARDEN. UNVERIFIED rows always get the behaviour diff step and one real caller check (11-10 hard rule). Bundle size for public bundles (site-chat iife).
- Tier: Sonnet sheet (behaviour diff is in the template). Worked example: pilot E03 (RemixIcon override).

## 5. HARDEN — Jini survivor first gains what Tovu has, then Tovu dedupes or deletes
- Detect: label `DEDUPE-AFTER-HARDENING` / `DELETE-AFTER-PARITY`; legacy twins (`legacy-twins.jsonl`), `wire-drift.jsonl` rows (routes/permissions the Jini twin names differently). Needs at least one parity row: when the only differences are Tovu product policy or a narrower Tovu type, it is a DEDUPE `type-narrowing`/binding, not a HARDEN (W0: `contracts/core/tool-metadata`).
- Goes: the missing behaviour into the existing Jini module (failing Jini test first), plus any Tovu-only rule that is generic. Stays: product policy as injected options.
- Files: Jini module + tests + changeset (`patch`/`minor`); Tovu file deleted or reduced, importers repointed, Tovu tests moved or repointed.
- Risks: behaviour change on BOTH sides; wire drift (route paths, permission names, cookie/header names) visible to saved data or clients; security-sensitive parity (owner decided 11-10: retire Tovu `admin/features/security` for Jini `admin/security` after porting Tovu-only behaviour).
- Tier: Sonnet sheet for ≤ 600 lines with an explicit parity list; Opus otherwise (it writes the parity list).

## 6. SPLIT — MIXED file: the generic half moves, Tovu keeps the product half and binds ports
- Detect: label `MIXED`; survey note names the functions per side ("MOVE: x → pkg", "STAY-PRODUCT: y", "Host contract: …"); `stay_imports` > 0 (each becomes a port); `sql` > 0 (SQL stays, injected as a reader).
- Goes: named functions/types, re-shaped to `(required, optional = {})` with Tovu specifics as ports. Stays: SQL, key formats, env, product rules, the binding call in composition.
- Files: Jini new/extended module + tests + changeset; Tovu file reduced, composition binding (`deps.ts` etc.), test split by what each test exercises.
- Risks: the split line is a judgment call; ports multiply (owner: smallest change); shared composition files are hot (arg lanes edit them: guard by exact text, never blob); tests that fake both halves.
- Tier: Sonnet sheet for ≤ 2 files / ≤ 600 lines / ≤ 3 ports; Sonnet sheet + Opus review when the survey note already maps every function; Opus otherwise. Worked example: pilot E02 (provider-revision-watch).

## 7. UI — React component/hook moves to `@jini-ai/ui` or a domain `*/react` subpath
- Detect: `.tsx` or React hooks; target pkg `ui`/`ui-kit` (direct) vs `admin`/`chat`/`user-management`/`cms` (kit injected: flag `kit-inject`); `className=` count (CSS rename size).
- Goes: component/hook, its pure tests, i18n keys (host passes `t`). Stays: Tovu i18n dictionaries, product copy, app CSS (renamed selectors), route hrefs.
- Files: Jini component + index + tests + changeset; Tovu importers, `styles.css`, unit tests and e2e pins that select classes, deleted files.
- Risks: class renames (counted per file, the new text contains the old), agent handles (`agentHandle` ids are a wire contract), kit injection outside `ui`, admin complexity 9/9, a Chrome look is owed after landing.
- Tier: Sonnet sheet for ≤ 900 lines with ≤ 4 ports; Opus otherwise. Worked example: pilot E04 (CodeView wrap).

## 8. SERVER — framework-free decision moves; Express wiring stays in Tovu
- Detect: `express` import or `apps/website/src/server/inbound/` path.
- Goes: the pure decision/handler body as a plain function, or a route module that registers on the `{ app: Server }` contract (after the server-port design merges into Jini). Stays: `app.set/use`, `req/res` adaptation, env names, product wording, host signals.
- Files: Jini module + tests + changeset; Tovu route/middleware file (same exported Tovu API where possible, so composition files stay untouched).
- Risks: request/response shape drift (status codes, headers, cookie names are wire contracts), body limits, auth order, the framework-signature arg-rule exemption (open with the owner), huge handler files (public-http 9k lines in 15 files: split for the size gate first).
- Tier: Opus until the server-port contract has landed and 3 worked sheets exist; then Sonnet sheet + Opus review per route group. Worked example: pilot E05 (trust-proxy).

---

## Not a kind: cross-feature prerequisites (Opus, once each)
Cycle cuts C1–C5 + 18 type-only back edges + 3 admin edges + 2 Jini module cycles (d1 backlog item 1); server-port O1–O7 into Jini (design d2); desktop navigation adapter; `console-tee`; keyed serializer onto `createKeyedLock`; positional public APIs; `node:test` context tests. These unblock features; they are not templated.
