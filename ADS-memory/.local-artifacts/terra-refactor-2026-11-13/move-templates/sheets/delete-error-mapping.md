id: DL-error-mapping-1   (template T-DELETE, fold with moved body; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: delete-error-mapping.gen.md)
feature: website/server/error-mapping
STATUS: BLOCKED (owner question below). The fold is fully specified so it can run the moment the owner answers "fold".
OWNER QUESTION: `respond.ts` (`respondToApiError`) is the only Tovu code in `server/error-mapping/`, and that folder's INFO.md ("Remaining surfaces") names it as the helper ~40 admin route families will migrate to next. The survey says "inline at the single caller" (`recent-hits.ts`, 2 call sites). Fold it now (this sheet), or keep it as Tovu's route binding and drop the row from the move backlog? Recommendation: KEEP (drop the row). It cannot move to Jini (its argument is the Express `Response` and it reads Tovu's `res.locals.requestId` convention: COMMON rule 3), and folding it means re-creating it as soon as the second route family migrates. If the owner answers "keep": nothing to execute; mark the feature STAY in CLASSIFY.tsv.
kind_check: KIND-SUSPECT confirmed: not dead, not a pass-through. It binds Tovu's request-id convention (`res.locals.requestId`) onto Jini `createApiError`/`sendApiError`/`statusForError`. As a DELETE it is only valid in the moved_bodies form below.
untangle_overlap: YES -> EXECUTE AFTER WAVE B MERGE. C4.repoint.tsv:243 repoints respond.ts's `statusForError` import from `@jini-ai/http-kit` to `@jini-ai/core/contracts/server`. So respond.ts is guarded by TEXT (lines 6-16 below), not blob, and the destination imports below are the post-C4 ones.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

tovu_file: apps/website/src/server/error-mapping/respond.ts | blob 21779d74aa3082a77939acdbbf4f503de5c5d236 at b28d38c6 (will change with C4; guard instead: the file is 16 lines, and lines 6-16 equal the MOVED TEXT below byte for byte, and it contains `from '@jini-ai/core/contracts/server'` (C4 landed); if C4 has not landed, SKIP "wave B first")
non_reexport_statements: 1 (respondToApiError) -> moved_bodies row M1
why_dead: forwarder with one host value, single caller: respondToApiError binds `res.locals.requestId` onto Jini createApiError/sendApiError/statusForError; one prod importer
tovu_file_after: delete
file_after: -
moved_bodies:
  - M1 respondToApiError -> apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts | before: "export function registerAdminAnalyticsRecentHitsRoute(app: Express, deps: AdminAnalyticsRecentHitsDeps): void {" | exported? yes (the relocated test imports it) | text: the block MOVED TEXT below, then one blank line
  - destination import edits (recent-hits.ts, each OLD occurs once):
      "import { respondToApiError } from \"#src/server/error-mapping/respond\";" -> two lines: "import { createApiError, type GenericErrorCode, type JsonValue } from \"@jini-ai/protocol\";" then "import { sendApiError } from \"@jini-ai/http-kit\";"
      "import type { Express } from \"express\";" -> "import type { Express, Response } from \"express\";"
      and insert after the line "import { getAuthedPrincipal } from \"#src/server/inbound/admin-http/dev-auth\";" the line "import { statusForError } from \"@jini-ai/core/contracts/server\";"   (post-C4 home of statusForError; precondition: `rg -n "export .*statusForError" {JINI_CLONE}/packages/core/src/contracts/server` prints a line, else SKIP)
MOVED TEXT (respond.ts lines 1 and 6-16; line 1's why-comment becomes a `//` line; the single quotes in line 14 become double quotes to match the destination file; nothing else changes):
```ts
// Tovu route policy; Jini owns the taxonomy, status defaults and wire serialization.
/** Reply with reviewed caller-safe copy and the request tracker's existing correlation id.
 * @complexity O(1); sends one JSON response, never serializes a raw exception.
 */
export function respondToApiError(
  { res, code, message }: { res: Response; code: GenericErrorCode; message: string },
  { details }: { details?: JsonValue } = {},
): void {
  const requestId: unknown = res.locals.requestId;
  const error = createApiError({ code, message }, { ...(typeof requestId === "string" ? { requestId } : {}), ...(details === undefined ? {} : { details }) });
  sendApiError({ res, status: statusForError({ error }), error });
}
```
census:                                    # python3 scripts/census.py {TOVU_CLONE} apps/website/src/server/error-mapping/respond.ts -> 2 hits
  - apps/website/src/server/error-mapping/__tests__/respond.test.ts:5 | static | "../respond.js"
  - apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts:2 | static | "#src/server/error-mapping/respond"
reach_check:
  - rg -n --no-heading -F "error-mapping/respond" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/server/error-mapping/respond.ts'   -> before: only the 2 census lines. After: nothing.
importers: the recent-hits.ts:2 line is replaced by the destination import edits above; respond.test.ts is relocated (R1).
folds: - (the 2 call sites recent-hits.ts:77 and :90 stay byte-identical; they now call the local function)
comment_refs:
  - apps/website/src/server/error-mapping/INFO.md | blob 8ba1ee0e08b9c7ecfb4bc5e8fb1b994bd052edb4 | "`respond.ts`, which calls Jini's serializer/status mapping and reuses `res.locals.requestId`." -> "`respondToApiError` in `inbound/admin-http/routes/analytics/recent-hits.ts`, which calls Jini's serializer/status mapping and reuses `res.locals.requestId`."
  - same file | "async-error guard and `respond.ts` correlation. Auth/session and recovery middleware" -> "async-error guard and `respondToApiError` correlation. Auth/session and recovery middleware"
  (INFO.md stays: the folder keeps its policy doc; `server/INFO.md:12` still names `error-mapping/` correctly as the concern.)
path_literals: -
tests:
  - apps/website/src/server/error-mapping/__tests__/respond.test.ts | blob fb61613e6c2aac982bdcb83f6825f6d075d4250c | delete (every block relocated by R1)
relocations:
  - R1 from apps/website/src/server/error-mapping/__tests__/respond.test.ts lines 1-23 (whole file) -> NEW apps/website/src/server/inbound/admin-http/routes/analytics/__tests__/recent-hits.respond.test.ts (must not exist) | import edits: "import { respondToApiError } from '../respond.js';" -> "import { respondToApiError } from '../recent-hits.js';" | framework change: none (node:test stays: it is a Tovu test). Every other line verbatim.
why_moves: - (line 1 why moves with the body, see MOVED TEXT)
baselines: - (rg -n -F "server/error-mapping/respond" over *.json/*.mjs/*.cjs/*.yml/*.yaml: no hit at b28d38c6)
jini_commit: -
untangle_followup: C4.repoint.tsv:243 names respond.ts; after this lands the coordinator re-points that row's file to recent-hits.ts (already applied by then, so: mark it done/moved).
tovu_msg: "refactor(server): fold respondToApiError into its one analytics route"
Commit paths (4): deleted respond.ts, deleted __tests__/respond.test.ts, edited recent-hits.ts, edited error-mapping/INFO.md, new routes/analytics/__tests__/recent-hits.respond.test.ts (5 paths).
Function size/complexity: respondToApiError 8 lines, complexity 3: unchanged. recent-hits.ts grows by 12 lines (112 -> ~126): under max-lines.
Cloud run owes: Tovu typecheck; the relocated test (node:test); the analytics admin route tests. No RED test, no behaviour change.
est_executor_tokens: ~30k Sonnet
