# Cull of r62t-debt-a (Tovu client error-gate ledger)

Input `o-r62t-debt-a/r62t-debt-a.md`. Base Tovu `c-r62t-debt-a` 776ce6d0f (merge-6), Jini `ro-m6-jini` d3e78b387. Read-only checks:
- Jini merge-6 exports `./errors/idioms` (`core/package.json:70,419`). Tovu already imports that subpath on merge-6 (`apps/desktop/src/tracked-site-relocation.ts:27`) under the same 0.7.0 lock. A1–A5 add no new dependency. **CORRECTION 11-20 (see cull-debt-c.md):** the locked core 0.7.0 has no `./errors/idioms` export; dev resolves only through the Jini symlink. Opus Cloud must bump `@jini-ai/core` in both Tovu locks before registry-installed combine checks. Executors still make no lock edits.
- No unmerged branch touches the five A1–A5 files (`git log --all --not 776ce6d0f`). All five are **merge-6**.
- The gate already accepts the A3 form verbatim (`development/eslint-rules/__tests__/error-gate.unit.test.ts:84`).
- Stale rows never fail the gate. `check-error-gate.mjs` counts only new or worse rows. Its `--update` flag rewrites the list from the live findings and is meant "only for a shrink" (lines 16–17, 117–123).

**Counts:** KEEP 2 · CUT-TO 4 · DROP 0 · NEEDS-DECISION 1 · STILL-BLOCKED 4 groups · OWNED-ELSEWHERE all exclusions · agree-KEEP (ledger rows stay) 6 groups.

## Verdicts

| Item | Verdict | Note |
|---|---|---|
| A1 media grid size (row 38) | **CUT-TO** | Edit only. **No new test file:** behaviour is identical and the gate finding is the proof. The Chrome look goes to the combine. |
| A2 media providers read (row 41) | **KEEP** | The body swap is exactly as designed. **No test edits:** the existing `media-providers-port.unit.test.ts:25–40` already pins the map, `null` on network failure and `null` on HTTP failure. |
| A3 share download probe (row 65) | **CUT-TO** | Inline the three `work` callbacks. The `headRequest`/`getRequest`/`detailsRequest` locals protect against a synchronous throw that cannot happen: `fetch` and `Response.json` return promises, and `response?.json()` short-circuits on null. **One** new test case, not three. |
| A4 queued daemon probe (row 96) | **CUT-TO** | Inline `response.clone().json()` in `work` (no `payloadRequest` local). `clone()` only throws on a used body, and this response was just returned unread. **No test edits:** `queued-daemon-start.unit.test.ts:34–47` already covers the non-JSON 409 and the readable clone. |
| A5 visitor transcript storage (row 150) | **KEEP** | Exactly as designed. **No test edits:** `session-store.test.ts` already covers malformed JSON, wrong shapes and throwing get/set/remove. The mutation lines are combine checks. |
| A6 client ledger shrink (33 hand deletions + mutation) | **CUT-TO** | Not a Codex sheet. It becomes **one combine Cloud step** for all ledger shrinks (see cut text). This replaces hand re-keying across four sibling branches with the checker's own update path, which deletes only real zeros and also lowers partial rows (for example the sampler 2→1). |
| KEEP rows 14; 15–20, 23, 36, 39–40, 50, 53–55, 60, 75, 79–81; 85; 91, 125, 143, 154, 156 | agree KEEP | These ledger rows stay. No sheet. |
| Row 32 | OWNED-ELSEWHERE | `r62t-unsheeted-a` A01. |
| BLOCKED-E3 (109, 110, 112, 121, 132, 134), E4 (45, 46, 52, 57, 100, 117), E8 (149), E9 (113–115, 119–120, 122, 129–130, 136) | STILL-BLOCKED | Coordinator disclosure contract (same as `cull-blocked.md`). |
| PARTIAL groups (~75 rows) and "Remaining verification" | **NEEDS-DECISION** | See below. No sheet now. |
| Row 155 visitor approval | STILL-BLOCKED + **BUG** (logged in open-bugs.md 11-20) | Confirmed on merge-6. `SiteToolConfirmation.hooks.ts:24–27` clears the prompt and then `void confirm(...)`, so a failed approval send (`tool-confirmation.ts:30` → `false`) vanishes silently. The visitor sees nothing and cannot retry. It is not in `open-bugs.md`. Fixing it needs a failing test first and is UI work, not a debt sheet. Leave the ledger row live. |
| Exclusions table | OWNED-ELSEWHERE | Agree. |

### NEEDS-DECISION (one line) — DECIDED 11-20: YES, round-2 re-sheet of the optional-probe rows only (not in this job)
**Re-sheet the PARTIAL rows?** Recommendation: one more 6.2 sheet pass, but **only** for the rows that are plain optional probes or storage fallbacks with an existing visible owner: admin preference/discovery/probe rows 1, 3–4, 6–7, 21, 35, 43, 64, 83, 90, 92–94, 97, 99, 101, and desktop probe/preference rows 103–104, 106–108, 111, 116, 126, 133, 135, 137–139, 144–146, 148. These get the same mechanical idiom swap as A1–A5 and no new tests. Leave the copy rows (24–34, 56–62, 66–70, 77–78, 82) and the mixed rows (2, 5, 26, 28, 30, 37, 44, 47–49, 63, 98, 118, 123–124, 127–128, 131, 140–141) with the E5/E6/E9 disclosure contract.

## Exact cut text

### A1 · merge-6
"In `apps/admin/src/features/media/hooks/use-media-grid-size.hooks.ts` add `import { orFallbackSync } from "@jini-ai/core/errors/idioms";`. Replace the `useState` initializer with `() => orFallbackSync({ work: () => parseMediaGridSize({ value: window.localStorage.getItem(MEDIA_GRID_SIZE_STORAGE_KEY) }), fallback: "medium", step: "Read media grid size" })`. Replace the `try { window.localStorage.setItem(...) } catch { /* not remembered */ }` statement with `orFallbackSync({ work: () => window.localStorage.setItem(MEDIA_GRID_SIZE_STORAGE_KEY, next), fallback: undefined, step: "Save media grid size" }); /* not remembered */`. Keep `setSizeState(next)` first and the file docblock. **No test file.** No ledger edit."

### A2 · merge-6
"As designed: add the import and make `fetchMediaProviders`'s body `return orFallback({ work: () => mediaApi.getMediaProviders(), fallback: null, step: "Read media providers" });`. Keep its docblock verbatim. **No test edits.** No ledger edit."

### A3 · merge-6
"Add `import { orFallback } from "@jini-ai/core/errors/idioms";` to `site-transfer-dependencies.hooks.ts`. In `readDownloadRefusal`, change only the three awaited expressions and keep every comment and statement around them:
- `const head = await orFallback({ work: () => fetch(href, { method: "HEAD", credentials: "same-origin" }), fallback: null, step: "Probe share download" });`
- `const response = await orFallback({ work: () => fetch(href, { method: "GET", credentials: "same-origin" }), fallback: null, step: "Read share download refusal" });`
- `const body = (await orFallback({ work: () => response?.json(), fallback: null, step: "Decode share download refusal" }) ?? {}) as { code?: unknown; message?: unknown; credentialWarnings?: unknown };` (the existing assertion, unchanged)

**Test (one case, written first):** in `__tests__/site-transfer-credential-warnings.unit.test.tsx`, inside `describe("live port: acknowledgement and download check")`, add one `it("keeps the GET status and no warnings when a refusal body is not JSON")`. Stub `fetch` so that HEAD returns status 409 and GET returns `new Response("refused", { status: 403 })`. Expect `shareDownloadRefusal({ share: share() })` toEqual `{ status: 403, credentialWarnings: [] }`. Add no other cases. No ledger edit."

### A4 · merge-6
"Add `import { orFallback } from "@jini-ai/core/errors/idioms";` to `apps/admin/src/lib/queued-daemon-start.ts`. Replace line 16 with `const payload = await orFallback({ work: () => response.clone().json(), fallback: null, step: "Read queued run refusal" }) as { code?: string } | null;`. This keeps the existing assertion. Keep the line-15 comment. **No test edits.** No ledger edit."

### A5 · merge-6
"As designed, in `apps/site-chat/src/session-store.ts`:
- `loadPersistedState` reads with `const raw = orFallbackSync({ work: () => storage.getItem(TRANSCRIPT_STORAGE_KEY), fallback: null, step: "Read visitor transcript" });` and keeps `if (raw === null) return EMPTY_STATE;`. It then does `return orFallbackSync({ work: () => { <lines 92–98 verbatim> }, fallback: EMPTY_STATE, step: "Decode visitor transcript" }, { observe: () => clearPersistedState(storage) });`.
- In `savePersistedState` and `clearPersistedState`, wrap only the storage call (`fallback: undefined`, steps `"Save visitor transcript"` and `"Clear visitor transcript"`). Move each catch's comment verbatim to just above the wrapped call.

**No test edits.** No ledger edit."

### A6 → combine Cloud step (all debt designs)
"After the Tovu combine that includes this job (and debt-b/debt-c if they are combined), run `node development/scripts/check-error-gate.mjs` once. If it prints **zero** `New:`/`Worse:` lines, run it with `--update` and commit `development/scripts/error-gate-debt.json` alone, with the count before and after in the message. If any `New:`/`Worse:` line prints, do NOT update. Report those lines. Never raise a row."

## Jobs
- **Jini:** none (no Jini edits; `./errors/idioms` is on merge-6). No Jini draft.
- **`j-tv-da-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 5 sheets): A1 → A2 → A3 → A4 → A5. ~5k executor tokens. It runs independently of every pushed branch.
- **Combine owes:** the A6 Cloud step. Chrome checks: media grid size with blocked storage, provider tab edits kept while the read is unreachable, the share download refusal, a queued turn with Stop, and the visitor widget (React and vanilla) with storage disabled.
- **Bug to file:** row 155, a silent failed visitor approval (see the table).
