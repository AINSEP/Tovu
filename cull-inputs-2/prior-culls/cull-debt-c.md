# Cull of r62t-debt-c (Tovu website server/platform error-gate ledger)

Input `o-r62t-debt-c/r62t-debt-c.md`. Base Tovu `c-r62t-debt-c` 776ce6d0f (merge-6), Jini `ro-m6-jini` d3e78b387. Read-only checks:
- The ledger objects at 1797–1816, 1872, 2142 and 2362 match the sheets: dev-auth catch 1 + generic 1, local-admin-request 1, publish-trust-auth 1, settings events 1, search generic 1, site-consent catch 2.
- `describeErrorForLog` (`#src/contracts/core/model-facing-tool-errors:55`) is class/code-only, never throws, and has its own no-leak tests. `publish-trust-auth.ts:2,222,325` already uses it.
- The gate resolves a relative import to a path (`catch-reads-error.mjs:33`), so DC-ORIGIN's one-line import change does make `isLocalAdminUrl` match `pureHelpers` (`check-error-gate.mjs:54`). `dev-auth.ts:35` already imports that module relatively.
- **Pushed-branch overlap is smaller than the design says.** `tv-xd5-render` and `tv-xd5-publish` are based on combine-4 (`9a59aba891`). Their own hunks touch only import lines in `site-consent.ts` (`:13`) and `events.ts` (`:1–3`, `:68–70`, `:240`), never the catches. So DC-FEED and DC-CONSENT run on **merge-6**. In `search.ts`, the branch never touches merge-6's catch (`:157–164`), so a normal 3-way merge keeps the incident reply. Only the import lines `:1–4` collide.
- The last test-relevant check: `admin-local-boot-session-route.test.ts:492,508` records only the first `console.warn` argument, so DC-AUTH's added second argument keeps it green. No test asserts `Authentication operation failed`.

Same test rule as debt-a and debt-b. Each sheet only adds a redacted cause to an existing log, or changes an import or a private wrapper string. The gate finding is the proof, the helper's redaction is already tested, and mutations are combine checks. **No test edits in any sheet.**

**Counts:** KEEP 0 · CUT-TO 7 · DROP 0 · NEEDS-DECISION 0 · OPUS-CLOUD 18 → round 2 · BLOCKED 68 (agree) · PARTIAL 17 (agree) · agree-KEEP 25.

## Verdicts

| Item | Verdict | Note |
|---|---|---|
| DC-AUTH (rows 360–361) | **CUT-TO** | Edits as designed. Drop both test additions. Note the 846-line file in COMMIT-PLAN. **merge-6**. |
| DC-ORIGIN (row 362) | **CUT-TO** | Import line only. Drop the new error-gate unit test. **merge-6**. |
| DC-TRUST (row 363) | **CUT-TO** | Edit as designed. Drop the test-loop extension. **merge-6**. |
| DC-FEED (row 375) | **CUT-TO** | Edit as designed. Drop the new test. **merge-6**: the pushed branch leaves `admitSubscriber` untouched, and the import conflict goes to the combine. Both swallowed causes are real failures (readiness rejection, or a wiring bug per `dev-auth.ts:309–310`), not normal unauthenticated traffic, so the log will not spam. |
| DC-SEARCH (row 429) | **CUT-TO → combine note** | Not a Codex sheet. Nothing needs editing on merge-6, and the 3-way merge keeps the catch. Combine instruction: "in `routes/site/search.ts` keep both merge-6's `reportServerFailure` import and the branch's `@jini-ai/search/http-query` import; keep merge-6's catch." The shared ledger step then clears row 429 only if the gate shows zero. |
| DC-CONSENT (row 473) | **CUT-TO** | Edits as designed. Drop the test extensions. **merge-6**. |
| DC-LEDGER | **CUT-TO** | Not a Codex sheet. It becomes the shared combine Cloud step (debt-a A6). The design's "no `--update`" is covered by the shrink-only guard. |
| Stale rows (327, 329–330, 335, 364–367, 374, 379, 381–383, 406, 408, 410, 415–418, 422–423, 426–427, 430–431, 488) and pushed 397 | agree RETIRE | The shared step removes them only if they really show zero. |
| KEEP rows 326, 333, 336–337, 358, 369, 376, 384, 387, 391, 393, 399, 407, 434, 436–437, 439–440, 446, 454, 458–459, 468, 480–481 | agree KEEP | — |
| OPUS-CLOUD rows 334, 346, 349, 359, 368, 370–373, 385–386, 392, 409, 424–425, 443, 447, 475 | **→ round 2** | Not Cloud work. They are the same optional-probe idiom swap as debt-a/b, so they join the 11-20 round-2 re-sheet. The design's only reason for Cloud is the core lock, which is one shared prerequisite (below), not per-row work. 447/475 use `observed` and must leave the original promise to its readiness consumers. |
| BLOCKED-E3/E4/E5/E6/E8/E9 (68 rows) | STILL-BLOCKED | Agree. |
| PARTIAL (17 rows) | agree | These are E3/E4 candidates, not optional probes, and are not in round 2 unless the round-2 designer finds pure probes among them. |
| Other ownership | OWNED-ELSEWHERE | Agree. |

## Shared prerequisite (affects debt-a, debt-b and round 2), possible bug

Tovu's locks pin `@jini-ai/core` **0.7.0**: `package-lock.json:3178–3181` and `apps/desktop/package-lock.json:1268–1270`. Jini's 0.7.0 release manifest (`de6f83653:packages/core/package.json`) has **no `./errors/idioms`** export. Dev works only because `node_modules/@jini-ai/core` is symlinked to local Jini (0.7.2).
- **Possible live bug on merge-6:** `apps/desktop/src/tracked-site-relocation.ts:27` already imports `@jini-ai/core/errors/idioms`. A registry install (CI, cloud, a packaged desktop build from the lock) cannot resolve it. Verify in the packaged build. It is not in `open-bugs.md` or `todos.md`.
- debt-a and debt-b sheets compile against the linked artifact. **Before the combine runs on registry installs**, Opus Cloud must bump `@jini-ai/core` in both locks to a published version that has `./errors/idioms` (publishing one first if none exists). I have corrected `cull-debt-a.md` and `cull-debt-b.md`: they wrongly said no lock step was needed.

## Exact cut text

### DC-AUTH · merge-6 · `server/inbound/admin-http/dev-auth.ts`
"Add `import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";`. At `:498` change only the wrapper text to `"Admin session handling stopped"` and keep `{ cause: error }`. Replace the `.catch` at `:569` with `.catch((err: unknown) => console.warn("[admin-auth] post-sign-in form pull check failed; sign-in is unaffected", describeErrorForLog({ err })));`. **No test edits.** Note in COMMIT-PLAN.md that the file is over 500 lines."

### DC-ORIGIN · merge-6 · `server/inbound/admin-http/local-admin-request.ts`
"Line 3 becomes `import { isLocalAdminUrl } from "../../runtime/boot/local-owner-signin.js";`. Nothing else changes. **No test edits.**"

### DC-TRUST · merge-6 · `server/inbound/admin-http/publish-trust-auth.ts`
"In `admitFromStores`, `} catch (err) { console.error("[publish-trust] Could not read the publishing trust stores:", describeErrorForLog({ err })); return null; }`. Reuse the import at `:2`. **No test edits.**"

### DC-FEED · merge-6 · `server/inbound/admin-http/routes/settings/events.ts`
"Add the `describeErrorForLog` import (as in DC-AUTH). In `admitSubscriber`, `catch (err) {` then `console.error("[settings] change feed admission failed", describeErrorForLog({ err }));` before the existing 401. **No test edits.**"

### DC-CONSENT · merge-6 · `server/runtime/composition/site-consent.ts`
"Add the `describeErrorForLog` import. Replace the `scriptDeclarations` handler exactly as the design's code block shows. In `publishedPageSlot`, `catch (err) { console.error('[consent] published entry could not be read', describeErrorForLog({ err })); return unavailable(); }`. **No test edits.**"

## Jobs
- **Jini:** none. No Jini draft.
- **`j-tv-dc-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 5 sheets): DC-AUTH → DC-ORIGIN → DC-TRUST → DC-FEED → DC-CONSENT. About 4k executor tokens.
- **Combine owes:** the DC-SEARCH import resolution, the import-line merges in `events.ts` and `site-consent.ts` against tv-xd5-publish/render, the shared ledger step, and the core lock bump (Opus Cloud) before registry-installed checks.
