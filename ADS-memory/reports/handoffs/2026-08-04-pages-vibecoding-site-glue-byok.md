# Handoff: SPEC-047 Pages Vibecoding + SPEC-048 Site Glue + BYOK fix/audit

Generated: 2026-08-04, ~18:40Z (11:40 local)
Source: Coordinator (Pipeline Mode), Claude Opus 5 (1M context), Claude Code on darwin
Branch: `refactor/jini-admin-extraction` in **both** `/Users/la/Programming/Tovu` and `/Users/la/Programming/Jini`

> **Save-location deviation, deliberate.** The `/handoff` skill defaults to
> `ADS-memory/.local-artifacts/handoff/`, which is **gitignored**. This session proved twice that
> gitignored artifacts evaporate and get re-bought, so this lives on a committed path instead.

---

## 0. WHICH SESSION IS THIS? (owner is running 3 terminals)

**This session owns:** Pages vibecoding (SPEC-047 / ADR-056), the Site Glue extensibility tier
(SPEC-048 / ADR-057), the BYOK Gemini bug fix, and the adversarial BYOK browser audit.

**This session does NOT own** — do not commit, revert, or "fix" these:

| Files | Owner |
|---|---|
| `apps/admin/src/lib/a2ui-action-poster.ts` (+ its test) | another session (A2UI / SPEC-046) |
| `Jini/packages/chat/src/react/components/A2uiSurfaceCard.tsx` (+ test, + `react/index.ts`) | another session |
| `development/e2e/site-assistant-*.spec.ts`, `site-assistant-fixtures.ts`, `site-assistant.globalSetup.ts` | another session |
| `development/playwright.a2ui.config.ts`, `development/e2e/a2ui-transport-contract.spec.ts` | another session |
| `apps/admin/dist-debug/` | unknown — probably the stray `:4530` process |

**Started from:** an owner question in three parts — "finish setting up vibecoding for Pages", "how do
I rate how extensible the Jini packages are", and "I was told I need a registry/glue folder — does
WordPress do this?" Everything below descends from those three.

---

## 1. Current State (one paragraph)

**NOTHING FROM THIS SESSION IS COMMITTED.** Three commits were pushed early — Tovu `15db8c6`
(checkpoint of the owner's in-flight SPEC-046 work), Jini `126e5e34` (its paired MCP-UI changes),
Tovu `02d43ec` (cloud-run protocol + briefs). Everything after that is uncommitted working-tree
state across both repos. Both features went **M0 → spec → ADR → partial implementation** in one
session. Four implementation/QA agents were dispatched; the owner then called a stop.

---

## 2. What Was Decided (owner decisions — do not re-litigate)

1. **D-3 token injection: APPROVED as specced.** Generation prompt receives literal theme-token
   values; generated CSS emits `var(--accent, #64a19d)` with literal fallbacks.
2. **Pages are HTML-only in v1.** `body_format` remains a real discriminator in the schema so
   doc-format Pages stay possible later with no migration, but v1 never creates or offers one.
3. **`plugin-runtime`'s move to Jini is DEFERRED — but the code is written as if it were already
   there.** Owner's standing instruction was *"do whatever is the best option for long term,
   scalability, extensibility, modularity"*, so deferring the move is a scheduling choice, not
   permission to write host-coupled code. Site Glue is product-neutral and port-shaped now, making
   the eventual extraction a `git mv` plus a strictness pass.
4. **Narrow v1 wiring, general contract.** Three call sites wired (content lifecycle, tool
   registration, outbox events); all six valid at schema validation; the other three reject at
   dispatch with `UNWIRED_CALL_SITE`. Deferred *wiring*, not deferred *design*.
5. **Auto-quarantine threshold: 3 failures / 5 minutes as an explicitly-marked PLACEHOLDER**
   (Coordinator decision while owner was away; needs owner sign-off).

### Standing rules confirmed or created this session

- **E2E specs are committed artifacts** in `development/e2e/*.spec.ts` — one concern per file, never
  the scratchpad. Every adversarial finding becomes a regression spec. (There is no `__tests__/e2e`
  in this repo; the owner's phrasing named the *principle*.)
- **Adversarial audits, not happy-path.** Zero findings means the audit was too gentle.
- Scoped test runs only; never a full-suite `npm test`.
- Jini must never name a consuming product in source **or comments** (guard rule R5).

---

## 3. Completed and VERIFIED (Coordinator ran these commands directly)

| Item | Evidence |
|---|---|
| **BYOK fix** | 98 scoped tests green across 4 runs; browser-verified (below) |
| **SPEC-047 REQ-1** parse5 parser | `npm --prefix packages/vibecoding run test` → **66/66**, typecheck + build clean |
| **REQ-2/3/4** schema + store | `node --import tsx --test src/features/post/__tests__/{pages-html-document-store,post.body-format}.test.ts src/db/__tests__/posts-body-format-migration.test.ts` → **21/21** |
| **`plugin-runtime` not broken** | `node --import tsx --test "src/features/plugin-runtime/__tests__/**/*.test.ts"` → **92/92** |
| **Site Glue slices 1-4** | `node --import tsx --test "src/features/site-glue/**/*.test.ts"` → **69/69, 0 fail** |

**FINAL BASELINE — all ten agents were `TaskStop`ped, then these were re-run. Everything is green:**

```
src/features/site-glue/**          →  69 tests, 69 pass, 0 fail
src/features/plugin-runtime/**     →  99 tests, 99 pass, 0 fail
post/db (3 files, see below)       →  21 tests, 21 pass, 0 fail
packages/vibecoding (Jini)         →  66 tests, 66 pass, 0 fail
```

Earlier in the session site-glue showed 2 failures; the agent fixed them before being stopped.
**Do not act on the stale "2 failing tests" note — there are none.**

### 3a. BYOK fix — what shipped

**Two bugs, both fixed.**

- **The stale error nothing could clear.** `Jini/packages/ui/src/features/execution/react/components/ExecutionTab.tsx:99-111` — the model-discovery `useEffect` excludes `apiKey` from its deps (to avoid hammering the provider on every keystroke), and its comment claimed an operator could "force a refresh via Test connection." **That claim was false**: line 212 called only `testConnection`, never `loadModels`. So the first failed discovery froze a red error permanently — no amount of typing, saving, or a green Test Connection would clear it. Fix: `onTestConnection` now also calls `loadModels(config.byok)`. **The false comment was rewritten**, not left accidentally true.
- **Missing empty-key guard, class-wide.** `Jini/packages/agent-runtime/src/providers/{model-catalog,connection-test}.ts` now reject an empty/whitespace `apiKey` **locally, before any network call**, for openai/senseaudio/anthropic/google (`aihubmix` exempt — public catalog). Previously an empty key was forwarded and the provider's confusing error surfaced instead.

Tovu's `node_modules/@jini-ai/{ui,agent-runtime}` are **symlinks** into the Jini checkout and both
packages were rebuilt, so the fix is already live for Tovu with no publish step.

### 3b. SPEC-047 REQ-1 — the parse5 parser (Jini)

`packages/vibecoding/src/html/node/{index.ts,parse5-region-parser.ts,__tests__/}`, plus `./html/node`
added to `package.json`'s `exports` and `jini.entries` (`"runtime": "node"`) with `parse5@8.0.1` as
that entry's one dependency. `.`, `./core`, `./html` stay dependency-free.

**CIC-2 was settled empirically — it is REACHABLE, and broader than ADR-056 assumed.** Two distinct
silent-loss mechanisms, confirmed by fixture probe against real parse5 8.0.1:
- *Node present but incompletely located* (missing `sourceCodeLocation.endTag`): a tag left open at
  EOF, any tagged **void element** (`<img>`, `<br>` — can never have a closing tag), and one copy of
  an adoption-agency-cloned node in misnested-formatting cases.
- *Node dropped from the tree entirely*: a tagged `<td>` outside a `<table>` is silently discarded by
  the HTML5 "in body" insertion rule, and **zero `onParseError` entries fire** — so
  `checkWellFormed`'s error stream alone cannot catch it. Mitigated with a raw-source
  occurrence-count cross-check.

**ADR-056 omits a load-bearing detail: fragment-parsing context.** `body_html` is inner-slot content,
so the implementation uses `parseFragment` with an explicit `<div>` context. **Under parse5's default
fragment context (`<template>`), the stray-`<td>` drop does not reproduce at all** — the wrong
context ships a parser that looks safe under test and is not. **Feed this back into ADR-056.**

**Consequence that lands on the Pages prompt, not the engine:** the refuse-on-missing-`endTag` rule
also fires on spec-legal HTML5 optional-end-tag grammar (`<p>`, `<li>`, `<td>`, `<tr>`, `<option>`).
`<section>`/`<div>`/`<article>` have no such grammar and are immune, so REQ-8's generation prompt
should steer regions to those wrappers.

**Trap worth remembering:** `parse5/dist/tree-adapters/default.js` resolves under
`moduleResolution: "Bundler"` at typecheck time but is **not a subpath Node serves at runtime** —
parse5's `exports` map only publishes its top level. Use the re-exported `DefaultTreeAdapterTypes`
namespace. A green `tsc` would have shipped a runtime failure.

Its own handoff is at **`/Users/la/Programming/Jini/ADS-memory/reports/findings/2026-08-04-req1-parser-HANDOFF.md`** — note that is **Jini's** workspace, not Tovu's.

### 3c. SPEC-047 REQ-2/3/4 — schema, type-safety, store (Tovu)

Files: `src/db/schema.ts`, `src/db/drizzle/0024_lethal_weapon_omega.sql` (+ snapshot/journal),
`src/features/post/{post.ts,repo.sqlite.ts,pages-html-document-store.ts}`, `src/headless/contracts.ts`,
`src/server/http/shared/post.ts`, `src/server/seed.ts`, and tests
`src/db/__tests__/posts-body-format-migration.test.ts`,
`src/features/post/__tests__/{pages-html-document-store,post.body-format}.test.ts`.

**CIC-1 is genuinely implemented and genuinely tested** — verified by reading the test file, not by
taking a report's word for it. `write()` issues `UPDATE … WHERE version = <captured at read()>` and
throws `PageConcurrentEditError` when zero rows match. The tests include:
- `"CIC-1: two readers, then two writers (read, read, write, write) — the second, stale writer is
  rejected, never silently applied"` — the real interleaving, not a happy path.
- recovery: after a rejection, a fresh `read()` yields a version that then writes successfully.
- a bonus hardening nobody asked for: the `WHERE` clause is **`bodyFormat`-scoped as well as
  version-scoped**, so a row converted to `doc` out-of-band after `read()` also rejects the write.

This matters because SPEC-047's REQ-4 as written was read → splice → *unconditional* UPDATE, which
loses writes silently and — if the earlier edit changed document length before the target region —
can splice into wrong offsets and corrupt content neither admin touched. **The unsafe version is the
one that looks obviously correct.**

REQ-3's Tiptap trap is closed at the write chokepoint: tests confirm `createPost` can never produce
`body_format:'html'` even if a caller smuggles it in, and `updatePost` cannot flip an existing row.

### 3d. Site Glue slices 1-3 (Tovu)

- **Slice 1 (done):** `src/features/site-glue/{manifest,capability-gate,ports}.ts` — `GlueCallSite`
  (6 members, 3 wired), `GlueCapability` (8), `GlueManifest`, `validateGlueManifest`,
  `resolveCallSiteDispatch`, `buildGlueCapabilityGate`, `GlueHostPort`. Zero host-module imports;
  product-neutrality verified against Jini's own comment-scanning guard. Schema-validation and
  dispatch are **two separate functions**, which is what makes "general contract, narrow wiring" real.
- **Slice 2 (done, and `plugin-runtime` verified green at 92/92):**
  `attachLoadedPlugin()` added at `loader.ts:196`; `loadPlugin()` itself **unchanged**, so the
  extraction is additive. The false comment in `hook-registry.ts` — which claimed `loader.ts` calls
  `.attach()` — is **fixed with a dated correction note** recording what was claimed, that it was
  false, and the `grep` that disproved it. Site Glue is named as the first production caller.
- **Slices 3 AND 4 (both done, green):** `attachment-points/{content-lifecycle,tool-registration,
  events}.ts` with unit + integration tests for each — the events adapter landed too, so **all three
  v1-wired call sites now have real adapters.** Fail-isolation works — tests confirm a throwing module is quarantined while siblings still
  register, glue-vs-core tool-id collisions are quarantined rather than silently overriding core, and
  a module's registrations succeed or fail **as a unit**. `src/assistant/tool-registrations.ts` is
  **unmodified**, so its existing fail-fast discipline was left intact as required.

### 3e. The adversarial BYOK audit (partially done)

Built `development/playwright.admin.config.ts` (hermetic, two-server) plus specs
`development/e2e/byok-model-discovery-self-heal.spec.ts` and `development/e2e/byok-ssrf-guard.spec.ts`.

**Browser-verified PASS:** the self-heal path — models request count went **1 → 2** (proving
`loadModels` genuinely re-fires), error hint count → 0, datalist populated. It verified the built
`dist/` actually contained the fix *before* testing, so it wasn't testing stale code. Also PASS:
the empty-key guard for OpenAI and Google, and the guard message reaching the DOM. No
`[object Object]`, blank errors, or stuck spinners found. No protocol-switch state bleed (per-provider
draft isolation is real) — though only the happy-path direction was checked.

Report: `ADS-memory/reports/findings/2026-08-04-byok-e2e-verification.md`.

---

## 4. Bugs Found (beyond the two that were fixed)

1. **Azure's real error is masked.** `src/server/routes/admin/assistant/list-models.ts:64-67` requires
   `baseUrl` non-empty and returns a generic 400 **before** dispatching on protocol — so an Azure user
   never sees `listProviderModels`' purpose-built *"Azure OpenAI deployment discovery is not supported
   from the inference endpoint."* Confirmed for the empty-`baseUrl` case; the `baseUrl`-filled half was
   never run. **Not fixed.**
2. **`entry_refs` never reaches `body_html`.** `extractEntryRefs` walks `bodyJson` Tiptap nodes only,
   so D-13's promise — "deleting a widget must not silently break pages" — does **not** cover
   html-format Pages. Scoped out of v1 deliberately; a live silent-breakage risk. **Not fixed.**
3. **Cross-protocol credential contamination (candidate).** A fake key persisted in localStorage from
   one protocol's test silently changed another protocol's result. Classified as test hygiene, but it
   is the same stale-state family as both fixed bugs. **Needs a real-user-reachability check.**
4. **Google header/query asymmetry (characterized, not acted on).** The completion call sends the key
   via `x-goog-api-key` (`connection-test.ts:233`); model listing sends it only as a `?key=` query
   param (`google.ts:43-47`). No evidence it is implicated; deliberately left alone.

### Four confidently-stated claims that failed verification this session

Worth internalizing — this is a repeated pattern in this codebase, and three of the four were
*behavioral* claims ("X calls Y"), which are harder to spot than wrong facts.

1. `ExecutionTab.tsx`'s "Test connection can force a refresh" — false, **and it was the bug**.
2. `hook-registry.ts:9`'s "`loader.ts` calls `.attach()`" — false; zero production callers.
3. Decision-log D-12's `media.upload_svg` at `src/identity/seed.ts:132` — neither permission nor path
   exists. Real precedent is `THEME_WRITE_PERMISSION = "theme.edit"`
   (`src/features/theme/agent-tools.ts:100`). This one had already propagated into a dispatch brief.
4. SPEC-047's claim that Drizzle's builder couldn't express the CHECK constraint — `check()` exists in
   `drizzle-orm@0.44.7`; the cited FTS precedent doesn't transfer (FTS5 is a virtual table).

Also corrected: `src/infra/db/schema.ts` is not a real path (it's `src/db/schema.ts`).

---

## 5. Big Architectural Finding: BYOK is not wired to anything

**OQ-1 is resolved, and the answer is that BYOK has no live tool-calling consumer.** Confirmed three
independent ways by two agents from different directions:

- `runAnthropicToolTurn` / `runOpenAiToolTurn` / `runAzureToolTurn` — **zero call sites in Tovu.**
- `runGoogleToolTurn` — exactly one, in the **public** site-assistant, which reads
  `env.GEMINI_API_KEY` (`site-assistant.ts:190`) and never touches the browser-local BYOK flow.
- `agent-daemon-server.ts`'s `createAgentExecutor` only spawns local CLI subprocesses — no `apiKey`,
  no `providerConfig`, no `executionMode` handling anywhere.

**Therefore the greyed-out "Use API · BYOK — not configured" row is telling the truth.** The cause is
`AgentRuntimePicker.tsx`'s `apiModeAvailable = false` prop default, which `AssistantDock.tsx` never
overrides — but wiring that prop would be *actively wrong*, lighting up a mode with nowhere to
dispatch to. **Deliberately not fixed.** Building it is a real feature (the daemon must accept
per-run provider config and call `@jini-ai/agent-runtime` directly), and tool-call normalization for
BYOK would have to be designed from scratch. **Owner decision.**

Consequence already absorbed: SPEC-047 REQ-6 scopes v1 Pages generation to the daemon/local-CLI path
and keeps the BYOK seam open rather than building it.

---

## 6. Known-Broken / Needs Attention Right Now

**1. RESOLVED — there are NO failing tests.** Mid-session, site-glue showed 2 reference-equality
assertion failures; the agent fixed them before being stopped. **Final baseline: 69/69.** The
paragraph below is kept only as a record of what was seen mid-flight — do not act on it.

<details><summary>superseded mid-session observation</summary>

`node --import tsx --test "src/features/site-glue/**/*.test.ts"` → 64 tests, 62 pass, 2 fail.
The named failure was `"a well-formed glue module registers successfully and calls the host port
exactly once"` in `__tests__/unit/tool-registration.unit.test.ts`, failing with
`AssertionError: Values have same structure but are not reference-equal` — a `deepStrictEqual` on an
object containing a function. **The agent was still actively working when this was measured** (count
moved 62 → 64 between two runs seconds apart), so this was an ordinary mid-TDD red, not a defect.

</details>

**2. Migration `0024_lethal_weapon_omega.sql` is a TABLE REBUILD and is HAND-EDITED.**
SQLite cannot add a CHECK in place, so drizzle-kit emits
`CREATE __new_posts` → `INSERT…SELECT` → `DROP TABLE posts` → `RENAME`. The generated `SELECT`
listed the two brand-new columns, which do not exist on the old table — it would fail with
"no such column: body_format" on any real database. The agent **hand-fixed** it to omit both so
existing rows take the new defaults (`body_format='doc'`, `body_html=NULL`), satisfying the CHECK's
`doc` branch since every existing row already has non-null `body_json`. The reasoning is sound and
documented in-file, and its unit test passes — **but it has not been run against a real database.**
Back it up first, and re-verify the hand edit survives any regeneration.

**3. Three of four agents never confirmed the stop.** `SendMessage` returns success whether or not a
message lands; that failed silently at least twice today. Everything in §3 was therefore verified by
the Coordinator running commands directly. `impl-glue-adapters` was demonstrably still working after
the stop was sent.

**4. Jini reports 67 guard violations** (`npx tsx scripts/guard.ts`), none in `packages/vibecoding` —
all in chat/mcp/renderers-react/sqlite/ui/http-kit/agent-runtime, i.e. files other agents and the
parallel session touched. **Not independently verified.** Check before committing in Jini; `npm run
guard` is expected to gate CI.

**5. Scratch to clean up:** `development/e2e/.audit-destructive-scratch/`,
`development/e2e/.explore-tmp.mjs`, `apps/admin/dist-debug/`.

**6. The owner's dev server is down.** `:3000` process is dead; `:5173` proxies there
(`apps/admin/vite.config.ts:57`), so the admin is broken. Deliberately not restarted — another
session may have stopped it. The hermetic Playwright config makes the audit independent of it.

---

## 6a. AGENT STOP RECORD — where each agent was when terminated

**All ten agents were terminated with `TaskStop` at ~18:45Z.** `SendMessage` stop requests were sent
first but do not force anything and demonstrably did not land for several agents; `TaskStop` is what
actually terminates. The final test baseline in §3 was taken **after** all stops, so it reflects a
quiet tree.

| Agent | Task | Stop position |
|---|---|---|
| `spec-047` | SPEC-047 | **Complete.** Spec written, reported, idle. |
| `spec-048` | SPEC-048 | **Complete.** Spec written, reported, idle. |
| `adr-047` | ADR-056 | **Complete.** Reported only after being chased — it went idle without reporting. |
| `adr-048` | ADR-057 | **Complete.** Reported, idle. |
| `byok-fix` | BYOK bugs | **Complete.** Fix + tests + findings note; actioned two follow-ups. |
| `impl-req1-parser` | REQ-1 parse5 | **Complete**, 66/66. Wrote its own handoff — to **Jini's** ADS-memory. |
| `impl-glue-slice1` | Site Glue slice 1 | **Complete**, contract frozen. |
| `impl-glue-adapters` | Site Glue slices 2-4 | **All three slices landed and green.** Was still writing when the owner asked whether agents had stopped — it fixed its own 2 red tests in that window. Nothing half-written. Never wrote a handoff file. |
| `impl-schema-store` | REQ-2/3/4 | **Complete and green** (21/21), including CIC-1's real interleaving test. Never wrote a handoff file. |
| `playwright-byok` | Adversarial audit | **Genuinely mid-task — the only one.** See below. |

### `playwright-byok` — the one with real unfinished work

Its own task list at termination:

```
#1 completed    Build hermetic playwright.admin.config.ts harness
#2 completed    Spec: model-discovery self-heal regression
#3 pending      Spec: empty-key guard zero-network        (spec file EXISTS on disk)
#4 in_progress  Attack + spec: SSRF guard battery         ← stopped here
#5 pending      Attack + spec: stale-state races
#6 pending      Attack + spec: key handling edge cases + leakage
#7 pending      Spec: hostile provider responses
#8 pending      Spec: credential persistence + multi-tab + contamination
#9 pending      Spec: Azure unsupported-path UX bug
#10 pending     Final adversarial report (spec vs one-off distinction)
```

**Landed on disk:** `development/playwright.admin.config.ts`, and three specs —
`byok-model-discovery-self-heal.spec.ts`, `byok-empty-key-guard.spec.ts`, `byok-ssrf-guard.spec.ts`.

> **CORRECTED 2026-08-04, next session.** The paragraph that stood here told you to assume the SSRF
> spec was incomplete or red. **That was wrong.** The Coordinator ran the full suite under
> `playwright.admin.config.ts`: **6/6 green in 1.2m**, including all three `byok-ssrf-guard`
> tests. The agent finished item #4 before the stop landed. Item #4 is **COMPLETE**, and the
> harness is verified working — do not rebuild it.
>
> `playwright.admin.config.ts` gained one change: the port triple is now derived from
> `BYOK_E2E_PORT_BASE` (default `6421`, i.e. unchanged behavior when unset), so concurrent audit
> runs cannot collide — `reuseExistingServer: false` makes a collision a hard failure, not a
> silent reuse.

**Resume point:** items #5-#10. (#4 is done — see the correction above.) Note the *earlier* narrative report
(`findings/2026-08-04-byok-e2e-verification.md`) was written **before** the adversarial escalation and
covers only the original four verification items — it is not the adversarial report item #10 asks for.

---

## 7. Not Started

**SPEC-047:** REQ-5 (`pages-vibecoding` tool domain), REQ-7 (fix-it loop via `correctionsFor`),
REQ-8 (literal theme-token injection — **should also encode the `<section>`/`<div>`/`<article>`
wrapper convention from §3b**), REQ-9 (`pages.edit_html` permission, admin-only, modeled on
`theme.edit`), REQ-10 (`PAGES_GENERATION_PER_PRINCIPAL` rate limit), REQ-11 (srcdoc preview).

**Site Glue:** slices 1-4 are DONE and green. Remaining: **slice 5** (control loop —
propose → validate-before-import → plain-language diff → approve via the change-set gateway →
revert via snapshot+rewind → auto-quarantine; **must** route `site_glue_activations` /
`site_glue_snapshots` writes through `core/gated-mutations` per GOV-ADR-001) and **slice 6**
(`apps/admin/src/sections/SiteGlue.tsx` admin UI, which can build against slice 5's contract rather
than its implementation). Slice 6's final rendering shape is blocked on the raw-source-visibility
owner decision (§8.3).

**Adversarial audit** (task list shows #4 SSRF in progress): hostile provider responses (malformed
JSON, empty array, 10k models, 12s+ timeout, 500, 429, never-completes, XSS in model ids); key edge
cases (whitespace-only, untrimmed, `&`/`#`/`?`/`%`/`+`/newline and whether a Gemini key can inject a
second query parameter, 10k chars, and whether `redactSecrets` fires on an error echoing the key);
localStorage tampering; multi-tab divergence; Azure-with-`baseUrl`-filled.

**Engine roadmap:** `@jini-ai/vibecoding` `./react` adapter, then the vision self-check tier.
Open questions still open: OQ-2 (vision self-check), OQ-5 (reusable sections), OQ-6 (import an
existing design).

---

## 8. Owner Decisions Pending

1. **Commit strategy** — nothing from this session is committed. Suggested split: (a) BYOK fix +
   tests, (b) specs/ADRs/recon/handoff docs, (c) partial implementation as `wip:`. Leave the parallel
   session's files alone.
2. **DRAFT → ACCEPTED sign-off** on ADR-056 and ADR-057.
3. **Raw-source visibility** for Site Glue's approval UI — does a technical owner get a raw-diff
   affordance, or is the plain-language summary the only surface? Blocks only the UI's rendering
   shape; the data model supports either.
4. **Auto-quarantine threshold** — currently the marked placeholder (3 failures / 5 min). Until a real
   number lands, a module failing *just below* it can degrade a call site indefinitely without
   tripping the safety net REQ-16 promises.
5. **Does BYOK-as-an-execution-mode get built at all?** (§5.)
6. **`__tests__/e2e` vs `development/e2e`** — the repo convention is the latter; moving would mean
   updating the Playwright configs' `testDir`.

---

## 9. Cloud Dispatch Is Broken (separate from everything above)

All four `RemoteTrigger` runs failed with **"An API error occurred"** *after* container setup, repo
clone, and Claude Code start all succeeded — so the model call itself failed, not the infrastructure.
Suspected capacity/quota. A deliberately minimal 3-command probe failed identically, which rules out
workload size. Diagnosis is in the routines UI (`https://claude.ai/code/routines/<trigger_id>`), which
the API cannot see — `list`/`get` only echo the job config back.

**Two triggers from 2026-08-03 have no schedule at all** (`run_once_at: null`,
`next_run_at: 0001-01-01T00:00:00Z`) and will never fire without an explicit `run` action:
- `trig_01ER4jP8nZ3cT74t2GexB88h` — vibecoding `./node` then `./react` adapters (Jini). **`./node` is
  now done locally**, so this brief is partly stale.
- `trig_01GGdm2aeybDEZbAq3bLdPLr` — attachment security claims + workspace-scoped uploads.

A cloud-run protocol was written and pushed at `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md`
(mandatory run log, 5-minute heartbeat push, every failed command with exit code + stderr), with
three briefs under `cloud-runs/briefs/`. Untested, since no cloud run ever reached its first turn.

---

## 10. Key Paths

| Path | What |
|---|---|
| `ADS-memory/specs/047-pages-vibecoding/spec.md` | 11 REQs |
| `ADS-memory/specs/048-extension-glue-tier/spec.md` | 18 REQs |
| `ADS-memory/reports/architecture/ADR-056-pages-vibecoding.md` | 9 decisions, DRAFT |
| `ADS-memory/reports/architecture/ADR-057-site-glue-tier.md` | 6 decisions, 5 CICs, 6-slice plan, DRAFT |
| `ADS-memory/reports/recon/pages-vibecoding-decisions.md` | the original 13 locked decisions (2 citations known false) |
| `ADS-memory/reports/recon/2026-08-04-spec-047-midpoint-findings.md` | parser/preview/OQ-1 evidence |
| `ADS-memory/reports/recon/2026-08-04-spec-048-phase1-recon.md` | plugin-system recon |
| `ADS-memory/reports/recon/2026-08-04-byok-root-cause.md` | both BYOK root causes |
| `ADS-memory/reports/findings/2026-08-04-byok-e2e-verification.md` | browser audit, PASS/FAIL table |
| `Jini/ADS-memory/reports/findings/2026-08-04-req1-parser-HANDOFF.md` | parser detail (**Jini repo**) |

---

## 11. Next Steps (ordered)

1. **Verify no agent is still writing**, then re-run the three suites in §3 to get a clean baseline.
2. **Fix the 2 site-glue test failures** (reference-equality assertions — trivial).
3. **Decide what to commit.** Nothing is committed. Keep the parallel session's files out.
4. **Feed §3b's fragment-context finding back into ADR-056** before anything builds further on the
   parser.
5. Finish Site Glue slice 3, then slices 4-6.
6. Finish SPEC-047's remaining REQs (§7), starting with REQ-5's tool domain since it makes the
   feature demonstrable end-to-end.
7. **Resume the adversarial audit** on the hermetic harness; every finding becomes a spec.
8. Fix the Azure masking bug (§4.1) — small and self-contained.
9. Owner decisions (§8), then ADR sign-off.
10. Decide whether to retry or abandon cloud dispatch (§9).

---

## Handoff Contract

- **Inputs used:** this session's conversation; `git status` / `git diff --stat` in both repos; direct
  reads of migration 0024, `pages-html-document-store.{ts,test.ts}`, `hook-registry.ts`, `loader.ts`,
  `vibecoding/package.json`, `vite.config.ts`, `development/playwright.config.ts`; four scoped test
  runs executed by the Coordinator; `RemoteTrigger list`/`get`.
- **Output summary:** lets a fresh session resume two features mid-implementation plus an unfinished
  security audit, without replaying the conversation or re-deriving any decision.
- **Risks:** hand-edited destructive-shaped migration never run against a real DB; 2 red tests
  mid-TDD; nothing committed; audit ~40% done; agents may still be writing; Jini guard violations
  unverified.
- **Suggested next assignee:** Coordinator (Pipeline Mode), then TDD/Programmer per slice.
