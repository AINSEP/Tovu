# Handoff — session 5, 2026-08-12 (fetch-query completion, embed fixes, two-round external audit)

Generated: 2026-08-12, end of session
Source: Claude Code, Opus 5 (1M context), Coordinator + 11 Sonnet 5 subagents + 3 external peer models
Target: Claude Code (Opus for routing, Sonnet subagents for implementation)

**Status: 91 commits today. 164 UNPUSHED. Audit round 2 in flight at cutoff.**

---

## ⚠️ READ FIRST — the cadence directive still stands

Sweep the whole slice first, committing as you go. **One test pass at the end.** No per-file test
authoring, no per-file negative verification (spot-check one sample per slice). Keep `tsc --noEmit`
and *existing* scoped suites green throughout — that is cheap. This is a deliberate quality/cost
trade the owner has chosen twice now. Do not reinstate the old cadence "to be safe."

**Exception that earned itself:** when fixing a bug an audit found, write the test *with* the fix.
The save-guard blocker existed precisely because the first fix shipped without a
"save-in-flight + navigate-away" test.

---

## ⚠️ 164 commits UNPUSHED

```
git push origin general-work
```

Raised ~8 times this session and never actioned. Two full sessions of work exist on one machine.

---

## ⚠️ ANOTHER ACTOR IS COMMITTING TO THIS BRANCH

Commits at 08:04, 08:29, 08:30 and later touched `src/core/gated-mutations/**`,
`src/features/plugins/data-module.ts`, and the PostgreSQL schema generator — **none from this
session's agents.** The owner (or another window) is working in parallel. Do not assume every commit
on `general-work` is yours, and do not "clean up" unfamiliar uncommitted work.

---

## WHAT SHIPPED

### The `lib/fetch-query` migration is COMPLETE — 11 features
`redirects` (pilot) · taxonomy · collections · roles · users · settings-raw (partial by design) ·
forms · media · comments · integrations · database. 40+ `useState` declarations deleted.
**One deliberate skip:** `useSettingsContainer` — it loads an unbounded operator-driven set of
namespaces, which one fixed query key cannot express without breaking the Rules of Hooks or faking
the cache. Documented in `settings-raw/rules.ts`. An auditor suggested **`useQueries`** as the way
in if it is ever revisited.

### Complexity: every admin hooks file is under 9/9
Debt ledger went 16 → 12 entries (4 genuinely fixed and removed, not tolerated). Branching was
extracted to **top-level exported** functions, which also made it unit-testable without React —
`Select.hooks.tsx`'s `handlePanelKeyDown` went 13/8 → 4/2 with three exported helpers and 14 tests.

### Eight stale-response races fixed, then a ninth class closed at the router
Found by an independent adversarial audit, not by tests. `key=` now on all 7 editor mounts in
`panels.tsx` — that closes the class for editors that were never individually guarded.

### Editor + renderer bug fixes
- **Images invisible everywhere** — `renderWidgetPostContent` called `renderDocNode(bodyJson)` with
  ONE argument; media maps defaulted empty, so every ref image degraded to a filename placeholder on
  both the public page and the preview. One missing argument, two symptoms.
- **"Img by URL"** — removed, then restored on the owner's explicit reversal, now backed by
  `safeImageSrc` (see the decision log below).
- **YouTube black box in raw draft preview** — `SrcDocSandbox` omits `allow-same-origin` by design;
  YouTube's player needs it. Degrades to a labelled placeholder before entering the sandbox.
- **Mention links 404'd in preview** — `templatePreviewUrl` returned a bare `/api/...` path, and that
  response loads as a *navigated document*, so the admin origin became the base URI. Wrapped in
  `siteUrl()`.
- **Unsaved-content preview** — a hidden form POST carries the live editor buffer to the
  template-preview route, so the preview keeps real theme CSS while you type.

---

## DECISIONS MADE THIS SESSION — do not re-litigate

| Decision | Ruling |
|---|---|
| `t` → `translate` rename | **REJECTED.** `t` stays at all ~1,100 call sites. Only the contract surface was named: `Translate` (bound, 1-arg) and `DictionaryTranslator` (unbound, 2-arg). The app has two functions called `t` distinguished only by arity. |
| Zustand | **REJECTED.** 0 `createContext`, 1 `useContext`, 0 `useReducer` — nothing to flatten. The boilerplate was server state; `lib/fetch-query` is the answer. |
| `~/lib/*` import alias | **Use `#lib/*` instead** — the repo already has `"#src/*"` in root `package.json`. Node-native, one resolution point vs. tsconfig+Vite+vitest. ~979 deep relative imports in admin justify it. Do it as one atomic codemod, verify Vite ≥5 resolves `imports` first. **NOT DONE.** |
| "Img by URL" | **KEPT** over three auditors' unanimous "remove it." The owner: *"why is that even bad to refuse an attribute source?"* He was right — refusing every `src` was the defect. `safeHref` in the same file already validated *link* schemes rather than banning links; the image case was the outlier. |
| The 4 remaining themes' capability CSS | Deferred — **not urgent**, the live workspace runs `basic`, which has it. |

---

## THE EXTERNAL AUDIT — `TM-TOVU-2026-08-12-A`

Frozen threat model: 5 blocking domains (unsafe content in public HTML · unauthorized exposure ·
silent content loss · writing to the wrong record · unrecoverable break), 6 invariants, risk tier
medium/high, **score floor 8.5**. Gate fails on **either** a validated blocker **or** a below-floor
score, with blockers classified before scoring so the two cannot be traded.

### Round 1 — one validated blocker, fixed

| Auditor | Score | Gate |
|---|---|---|
| Gemini 3.6 Flash (`agy`) | 9.2 | PASS |
| Gemini 3.1 Pro (`agy`) | 9.0 | PASS |
| Codex `gpt-5.6-sol` xhigh | 8.4 | FAIL (score floor only, 0 blockers) |
| Internal Sonnet verifier | 7.0 | FAIL — **1 blocker** |

**The blocker:** the session's own race fix guarded the LOAD path in three hooks and left `save()`
unguarded — the exact failure its own commit message named. Two external auditors independently
reasoned the same gap without repo access; the internal verifier proved it with file:line evidence.
Fixed in `53b8d6f` + `6d3e9c4`.

### Round 2 — IN FLIGHT AT CUTOFF

| Auditor | Score | Gate | Ledger |
|---|---|---|---|
| Gemini 3.6 Flash | 9.2 | PASS | 10/10 verified |
| Gemini 3.1 Pro | **7.5** | **FAIL** | 10/10 verified — **1 blocker** |
| Codex `gpt-5.6-sol` xhigh (repo access) | **pending** | | |
| Internal verifier (`Verifier2`) | **pending** | | |

**Both Geminis reconciled all 10 ledger entries as verified** — the round-1 blocker fix is
independently confirmed closed.

**⚠️ Pro's round-2 blocker — UNRESOLVED, the top item for next session:**
> Inserting a mention immediately after a still-selected YouTube atom **silently deletes the YouTube
> node** from persisted `bodyJson`. Domain 3, silent content loss.

Observed **once** by an agent, never reproduced, disclosed in the packet — Pro escalated it to
blocker on that disclosure; Flash flagged it at medium. **It needs an isolated repro before it is
trustworthy as a real bug.** That is the single highest-value next task.

**Pro's second finding (high):** `key=` remounts may discard in-progress editor state on navigation.
The keys chosen are stable route params, so they should only change on genuine entity navigation —
**but this was never verified.** Check it before trusting the remount fix.

---

## TABLED FOR NEXT SESSION — prioritized

1. **Reproduce or refute the mention/YouTube node deletion.** Round-2 blocker. Isolated repro first.
2. **Verify `key=` does not lose unsaved edits** on navigation (Pro's high finding).
3. **Finish audit round 2** — Codex and `Verifier2` were still running at cutoff; their raw output
   may be recoverable from the task files. If not, re-dispatch from
   `ADS-memory/reports/external-audit/packets/2026-08-12-round2-packet.md`.
4. **`safeImageSrc` bypass hunt** — userinfo (`https://good@evil/`), punycode homographs, and whether
   the admin-media rejection can be evaded by case/encoding/query string. Two auditors raised it.
5. **AST depth/node bound** before synchronous `renderDocNode` traversal of the ≤15MB preview payload
   (round-1 `GF-F2`, agreed and never done — the agent carrying it was stopped).
6. **I5 is still unaudited** — behaviour preservation across ~62 changed hook files. The specific
   question: did any migration quietly turn a test assertion into a **no-op**?
7. **Wasteful re-renders** — never investigated. The DI sweep created ~47 fresh deps objects per
   render. An audit confirmed none land in a *dependency array* (so no loops) but nobody checked
   whether they land in **props**, which defeats `React.memo`. Measurable via the Profiler.
8. **The `#lib/*` codemod** (see decisions table).
9. `CX-F4` — `/m/{id}/public.v1/…` 404s 25s under the hermetic harness; one e2e is `test.fixme`.
   Candidate cause: `infra/uploads` is not `TOVU_DB`-scoped and collides across concurrent boots.
10. **The dispatch-protocol doc** the owner asked to be reminded about — needs a decision on whether
    it lives in framework-owned `AI-Dev-Shop/` or project-side `ADS-memory/`.

---

## HAZARDS — proven again today

**1. Mid-flight `SendMessage` does not arrive.** At least 5 confirmed drops. Two agents acted on
stale briefs; one removed a feature the owner wanted kept. **The spawn prompt is the only reliable
channel.** Send only when an agent surfaces or goes idle. Change scope by **stop-and-respawn at a
commit boundary** — and back up its in-flight diff to a patch file first.

**The detector that works:** derive a one-line assertion from the instruction you sent and *run it
against the code*. `grep -A4 '\.tb-color'` beat reading the agent's report, twice.

**2. `git stash` was used despite the ban** and survived by luck, with two agents holding uncommitted
work. The correct technique for proving a test RED is `git diff > /tmp/p.patch` then
`git apply -R` / `git apply` — it never touches the shared index.

**3. A persisted `cd` doubles relative paths** and silently breaks commits. Bit the Coordinator three
times and two agents. **Prefix every git command with `cd /Users/la/Programming/Tovu`.**

**4. `agy` headless auto-denies file reads.** Round-1 packets worked because they were self-contained;
round-2 packets named a diff range, both Geminis tried to read the repo, and both returned **exit 0
with empty stdout** — the error only in stderr. Tell `agy` peers explicitly they have no tools.

**5. Editing `src/themes/static/**` restarts `:3000`** — the theme CSS lives inside the
`tsx watch src/index.ts` tree. Expect brief unreachability; it is not a crash.

**6. Uncommitted definitions of committed imports.** The `Translate` type was imported by 30
committed files while its definition sat uncommitted for hours. Check for this shape before any
destructive operation.

---

## CORRECTIONS TO PRIOR MEMORY — three were materially wrong

- **The complexity gate does NOT fold nested closures.** `check-admin-complexity-drift.ts` is *pure
  ESLint*, scored per-scope. The folding claim is true of the owner's ad-hoc 2026-08-06 table only.
  **Moving state or effects between scopes clears nothing** — you must move the branching.
- **TanStack notifies via `setTimeout(0)`, a MACROTASK.** `await Promise.resolve()` can never observe
  it. Use `waitFor`. (Verified in `query-core`'s `systemSetTimeoutZero`.)
- **`act(() => asyncFn())` with an expression-bodied arrow leaks into the next test** — the deferred
  flush corrupts whichever test runs next. The tell is a *varying* failure set in full-suite runs
  only. Use a block body.

---

## Handoff Contract

- **Inputs used:** 11 Sonnet subagents; 3 external peer models across 2 audit rounds; live headless
  Chromium with `getComputedStyle`; hermetic `TOVU_DB=memory` boots; `git` history; the complexity
  gate; scoped vitest and `node:test`.
- **Output summary:** the fetch-query migration completed (11 features), every admin hooks file
  brought under 9/9, nine stale-response races closed plus the class closed at the router, five
  renderer/editor bugs fixed, and a two-round external audit run to a frozen threat model that found
  and closed one blocker and left one unresolved.
- **Risks:** **164 unpushed commits**; one unresolved round-2 blocker (mention/YouTube node
  deletion, unreproduced); `key=` remount state-loss unverified; I5 never audited; two auditors
  still running at cutoff.
- **Suggested next assignee:** Claude Code (Opus) as Coordinator; Sonnet 5 subagents for
  implementation — cadence directive at the top of every brief, and the full spec inline because
  mid-flight messages do not arrive.
