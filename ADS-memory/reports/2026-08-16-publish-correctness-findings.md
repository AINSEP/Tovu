# Publish correctness findings — 2026-08-16

Dispatched to fix two defects found by a live publish: (A) a successful GitHub Pages
publish reporting itself as failed (Jini), and (B) `ready: true` meaning only "a
credential row exists," not "this credential works" (Tovu). This file is written as I go,
per the brief.

## Defect A — false-negative `PROVIDER_ERROR` on GitHub Pages publish

**Status: FIXED. Root cause PINNED (unit-test reproduction against stubbed `fetch`, not
a live-API reproduction — no GitHub PAT/throwaway repo was available in this
environment). Commit: `eaa1a7d8` in Jini.**

### What I proved vs. assumed

PROVED, by reading the full call chain and reproducing with a stubbed `fetch`:

- The message `"GitHub returned a non-JSON response."` is produced in exactly one place
  in the entire deploy package: `readGitHubJson`'s `catch` block in
  `/Users/la/Programming/Jini/packages/devops/src/deploy/github-pages.ts:170-176`. It
  fires when `resp.json()` rejects.
- `readGitHubJson` is called from 8 sites in that file. Of those, only
  `pollGitHubPagesBuild` (`GET /repos/{owner}/{repo}/pages/builds/latest`, polling
  `publish()`'s build-status step) runs *after* the irreversible steps (blob → tree →
  commit → ref → `ensureGitHubPagesSite`) have already completed — matching the brief's
  evidence that blobs/tree/commit/ref/Pages-enablement had already succeeded on the
  "failed" run.
- Before this fix, `pollGitHubPagesBuild` special-cased only HTTP 404 as "keep
  polling" (`github-pages.ts:410`, unchanged). Any other non-2xx-or-2xx response whose
  body failed to parse as JSON — reached `readGitHubJson`'s catch and threw, with no
  distinction from a genuine API rejection.
- Reproduced this exact mechanism with a unit test
  (`packages/devops/src/deploy/__tests__/github-pages.test.ts`, new test `keeps polling
  past a builds/latest response that fails to parse as JSON instead of treating it as a
  hard failure`): stub every step through Pages-site-creation to succeed, then return a
  bare `200` with an empty body on the *first* `builds/latest` poll. **Run against
  unfixed code**, this throws:
  ```
  DeployError: GitHub returned a non-JSON response.
   ❯ readGitHubJson src/deploy/github-pages.ts:174:11
   ❯ pollGitHubPagesBuild src/deploy/github-pages.ts:411:18
   ❯ GitHubPagesDeployTarget.publish src/deploy/github-pages.ts:126:19
  ```
  — byte-identical message to the live-observed failure, at the exact call site the
  evidence pointed to.

ASSUMED / NOT independently confirmed against the real GitHub API (no credentials or
throwaway repo available to me in this environment):

- The *exact* shape of the real response that triggered this (empty 200 body vs. a
  bodyless 202 vs. an HTML gateway page from a transient edge/5xx). I used an empty-body
  200 as the reproduction vehicle because it's the most plausible "no build-tracking
  record written yet" cold-start response and it produces the identical downstream
  error — but the fix does not depend on which of these it was: all of them fail
  `resp.json()` the same way, and the fix treats "response we could not parse as JSON"
  as one bucket regardless of status code. If it matters later, I'd recommend the
  coordinator have someone add temporary status+body logging on a real retry to nail
  the exact byte content, but I don't think it changes the fix.

### Fix

Localized entirely to `pollGitHubPagesBuild` — did **not** touch `readGitHubJson`
itself (shared by all 8 call sites; broadening it globally would have let e.g. blob
creation silently swallow a malformed response instead of erroring, which is the
correct behavior there). Wrapped just this function's `readGitHubJson` call in a
try/catch that `continue`s the poll loop on a parse failure, joining the same "keep
polling" bucket the function already uses for 404 and for a malformed/missing
`commit`/`status` field (pre-existing test: `keeps polling past a builds/latest entry
with a non-string commit or status field...`). Still bounded by the existing fixed
30-attempt/~1-minute budget; a genuine non-2xx response whose body DID parse as JSON
still fails fast, unchanged (verified: the pre-existing `throws DeployError when a
build status check fails mid-poll (not a 404)` test, which stubs a 503 with a valid
JSON body, still passes after the fix).

Diff: `/Users/la/Programming/Jini/packages/devops/src/deploy/github-pages.ts` (poll loop
try/catch + updated doc comment), test file above (+38 lines, new regression test).
Full `github-pages.test.ts` run after the fix: **32/32 passed**, no regressions.

### Deeper contract question — recommendation, not yet a separate change

The brief asked me to consider whether the post-push phase should degrade to a truthful
`"partial"` result rather than throwing, the way the S3 path already does. I traced this
before implementing anything structural and concluded **no further change is needed
here** — the existing architecture already does this correctly once the poll-throw bug
is fixed:

- After `pollGitHubPagesBuild` returns (success, terminal-errored, *or* budget-exhausted
  with a `null`/partial `last`), `publish()` calls
  `waitForReachableDeploymentUrl` (`reachability.ts`), which is explicitly documented
  "Never throws" and, reading its body, has no throw sites of its own within the polling
  path (only pre-network validation like `assertSafePublicUrl` can throw, and that's for
  malformed input URLs, not network outcomes).
- `waitForReachableDeploymentUrl`'s `status` field flows straight into
  `DeployPublishResult.status`, which `Tovu`'s
  `src/features/deployments/static-publish/adapter.ts:366` (`publishStaticSite`) already
  converts into `{ok: "partial", ...}` whenever `status !== "ready"` — this is the
  *existing* `StaticPublishOutcome` third branch the brief pointed at, and it already
  applies uniformly to every target including GitHub Pages, not just S3.
- So with the poll-throw bug fixed, the only two ways `GitHubPagesDeployTarget.publish()`
  can still throw *after* the irreversible git/Pages-enablement steps are: (1) a
  confirmed terminal `status: 'errored'` build (a genuine, parseable "GitHub says this
  build failed" signal — legitimate to treat as failure), or (2) a genuine non-2xx
  response with a parseable JSON error body during polling (an explicit rejection, not an
  ambiguous glitch). Both are real, actionable failure signals, not the "we can't tell
  what happened" case this bug was about.

I did not implement a `"partial"` change to case (1)/(2) above — that would be a
behavior change beyond what was asked and beyond what today's evidence supports (no
observed case of either being a false negative). Flagging it only as something to watch,
not acting on it.

### Sibling adapter audit — `vercel.ts`, `netlify.ts`, `cloudflare-pages.ts`

Audited. **Found the same bug class in two of the three. Not fixed** — out of this
dispatch's assigned scope (Defect A + Defect B only); reporting per the brief.

1. **`vercel.ts`'s `pollVercelDeployment`** (lines 165-180) — **identical bug**, not
   merely similar. Same 30-attempt poll loop shape, running strictly after the Vercel
   deployment was already created server-side (irreversible by the time this loop
   starts). `readVercelJson` (line 199-205) throws `'Vercel returned a non-JSON
   response.'` on any unparseable body, and unlike GitHub's now-fixed version, this loop
   has **zero** tolerance for any response shape short of parsed JSON — not even the
   404-equivalent case GitHub already had before today's fix. Any transient/edge/empty
   response mid-poll propagates straight out of `publish()` and would misreport an
   already-created Vercel deployment as failed, the same live symptom Defect A was filed
   for. Recommended fix shape: identical to what I just shipped for GitHub — fold a
   `readVercelJson` parse failure into "keep polling," bounded by the same fixed budget.

2. **`netlify.ts`'s `pollNetlifyDeploy`** (lines 272-285) — same pattern, same risk,
   running after `createNetlifyDeploy` + per-file uploads have already happened
   (irreversible). `readNetlifyJson` has the same zero-tolerance-for-non-JSON shape.
   Same recommended fix.

3. **`cloudflare-pages.ts`** — structurally different, narrower window. There is no
   multi-attempt poll loop analogous to the other three targets; the single `POST
   .../deployments` call (line 975) is itself the irreversible step, and its response is
   read exactly once, immediately, via `readCloudflareJson` (line 980). If that specific
   response body were malformed/truncated despite the deployment having been created
   server-side, the same misreport would happen — but it's a single-shot read of the
   creation call's own response, not a poll running well after several already-confirmed
   steps, so the exposure window is much smaller (one HTTP response, not up to 30 polls
   over ~1 minute). I did **not** individually audit the other 14 `readCloudflareJson`
   call sites in this file (project lookup/creation, asset upload, custom-domain setup,
   DNS record CRUD) for their own irreversibility — flagging them as unaudited, not
   claiming they're clean.

## Defect B — credential "ready" means "a row exists," not "verified against the provider"

### What I confirmed (read, not assumed)

`deployment_get_static_publish_capabilities` (`publish-agent-tools.ts:672-703`) reports `ready:
readiness.configured` where `readiness = credentialSource.isConfigured({workspaceId, target})`.
Traced both `PublishCredentialSource` implementations
(`static-publish/credentials.ts`): `createDbPublishCredentialSource.isConfigured` only calls
`repo.findDefaultByProvider` — a plain existence check, no network call, no decrypt.
`createEnvPublishCredentialSource.isConfigured` only checks whether the env var is set and
non-blank. Neither ever contacts GitHub/Vercel/Netlify/Cloudflare/S3. This exactly matches the
report: a row/env-var existing is reported as `ready: true` regardless of whether the provider
would actually accept it.

### Design (proposing before implementing, per the brief — this requires decryption)

**New function `verifyPublishCredential`** (new file: `static-publish/verify.ts`) — the SECOND (and
only other) legitimate caller of `PublishCredentialSource.resolve()`, alongside a real publish
attempt (`static-publish/types.ts`'s own header already documents `resolve()` as reserved for "an
actual publish attempt," which I'm reading as "or an equally human-gated, non-agent-facing
verification attempt" — same non-decrypting-for-agents invariant, one more legitimate caller of the
decrypting method). It calls `credentialSource.resolve({workspaceId, target})` — the SAME composed
DB-first/env-fallback source a real publish already uses, so verification checks whichever
credential would ACTUALLY be used, not an assumption about which one — then makes ONE lightweight,
read-only, authenticated GET against that provider:
- github-pages: `GET api.github.com/user`
- vercel: `GET api.vercel.com/v2/user`
- netlify: `GET api.netlify.com/api/v1/user`
- cloudflare-pages: `GET api.cloudflare.com/client/v4/user/tokens/verify` (Cloudflare's own
  purpose-built token-verify endpoint)
- s3-compatible: SigV4-signed `HEAD` on the bucket root, via `aws4fetch`'s `AwsClient` — the same
  library `static-publish/s3-compatible-target.ts` already depends on for real uploads, so this adds
  no new dependency

Every checker is wrapped so a network error, timeout, or non-JSON/non-2xx response NEVER throws —
it always resolves to `{ok: boolean, message: string}`, and `message` is built only from the HTTP
status/a provider error field, never from the request itself, so the token/secret cannot leak into
it even by accident (same "message, never the raw error, never a credential" discipline
`static-publish/adapter.ts`'s own `catch` already documents for `PROVIDER_ERROR`).

**Caching — in-memory, NOT a DB column.** Recommending this over a `publish_credential_sets`
migration, with tradeoffs:
- *For*: zero migration risk. This session's own HARD CONSTRAINTS forbid restarting the dev
  servers a schema change would need reloaded to take effect, and project memory
  (`reference_drizzle_migration_hash_partial_apply.md`) independently flags migration mistakes in
  this exact table family as a real, previously-hit boot-crash class. An in-memory cache needs
  neither.
- *Against*: lost on process restart, and NOT shared across replicas in a multi-instance hosted
  deployment. Judged acceptable for now — re-verification is one cheap call and a restart
  correctly reverting to "unverified" (rather than trusting a stale in-memory claim across a
  restart) is arguably the MORE honest failure direction; `composePublishCredentialSource`'s own
  doc already establishes `hosted-api-only` mode as single-tenant/DB-backed with no evidence of a
  multi-replica deployment today. If either stops being true, promoting this to a small additive
  migration (3 nullable columns) is cheap later — not blocked by this choice now, just deferred.
- Keyed by `(workspaceId, target)`, matching `isConfigured()`'s own granularity — NOT by credential
  row id. This also makes the DB-backed and env-var-fallback paths share one mechanism for free
  (an env-sourced credential has no row to key by id, but it does have a `target`).
- No TTL/auto-expiry: a verification result never silently reverts to "unknown" from time alone
  (which would look like flakiness — a violation of the brief's "must not be flaky" requirement).
  Instead `verifiedAt` is always reported so a caller can judge staleness itself. Freshness is kept
  by re-verifying automatically after every human credential save, plus an on-demand "Verify" trigger.

**Triggers — both human-gated, neither on the agent-facing read path**:
1. Automatically, best-effort, right after a human's `POST`/`PUT` to
   `.../publish/credentials` succeeds (`publish-credentials.ts` route) — the natural "did what I
   just typed work" moment.
2. On-demand via a new `POST .../publish/credentials/:id/verify` route, so a human can refresh a
   stale or never-verified result without re-saving.

**Reporting** (`deployment_get_static_publish_capabilities`, still 100% non-decrypting — reads the
cache, never calls `resolve()`): per provider, `credentialConfigured` (today's `isConfigured()`
check, renamed for clarity), `verified: true | false | null` (`null` = configured but never
verified), `verifiedAt`, and `ready` REDEFINED to `credentialConfigured && verified === true` —
never `true` for "configured but unverified," directly satisfying the brief's "unverified must not
render as ready."

**Deliberately NOT changed**: `deployment_execute_static_publish`'s pre-flight gate still checks
only `isConfigured()`, not the cached verification. Reasoning: attempting the real publish IS the
truest possible verification, and gating it on a possibly-stale cached result risks being wrong in
BOTH directions (blocking a publish whose stale cache says "failed" but would actually work now, or
letting one through whose stale cache says "verified" but was revoked since). Flagging as a
follow-up recommendation, not implementing: the confirmation dialog could show a non-secret warning
line ("last verified 3 days ago: failed — 401") using the SAME cached, non-decrypting data the
capabilities tool already reads, without weakening the gate itself.

Env-var-sourced credential verification is included in this design (same cache, same `target`
key) — scoping note: the two triggers above are both DB-credential-row-shaped (a save, or a
per-row Verify button); an operator-set env var has no natural "just saved it" moment or admin row
to attach a button to, so in practice env-sourced credentials will only ever show `verified: null`
until a route/CLI trigger for that path exists. Not building that trigger now — no evidence the
live-reported bug involved the env-var path (the demonstrated case was a DB-saved token via the
admin form).

### Implementation status — DONE. Commit `c7af2422` in Tovu.

Built exactly the design above, plus one refinement discovered while wiring the admin route: the
originally-proposed target-scoped `verifyPublishCredential` (checks whichever credential the
COMPOSED source currently resolves — always the provider's DEFAULT row) is right for the
capabilities tool's `ready` signal, but wrong for "verify the row a human just clicked/saved" — a
human saving or clicking Verify on a SECOND, non-default connection would otherwise silently check
the unrelated default row instead. Added `verifyPublishCredentialById` (decrypts one specific row by
id via the existing `resolveForPublish`) for the two human-triggered call sites; it still only
updates the shared `(workspaceId, target)` cache when the checked row IS its provider's current
default — a non-default row's own result is returned to the human but never overwrites what a real
publish would actually see. Covered by a dedicated test
(`verifyPublishCredentialById: a NON-default row's own result is returned but does NOT overwrite the
default row's cached ready-signal`).

**Files**: `static-publish/verify.ts` (new — checkers, cache, both entry points),
`static-publish/index.ts` (barrel exports), `publish-agent-tools.ts` (capabilities handler + catalog
description), `server/routes/types.ts` (`publishCredentialVerificationCache` on `RouteDeps`),
`server/app.ts`/`server/deps.ts` (wire one shared in-memory instance per process, both composition
roots), `server/routes/admin/system/publish-credentials.ts` (verify-after-save on POST/PUT, new
`POST .../:id/verify`). Tests: `static-publish/__tests__/verify.unit.test.ts` (10 cases — every
provider's accept/reject/unreachable classification, the never-throws contract, the cache's own
contract, the default-vs-non-default row rule), `publish-agent-tools.unit.test.ts` (+2 new tests for
the unverified/failed states, existing test updated for the new contract),
`publish-credentials-route.test.ts` (+2 new tests for the on-demand verify route, existing tests
updated to stub the now-real verification network call via a URL-discriminating `globalThis.fetch`
stub so they never depend on reaching a real provider or on real network access).

**Red-state proof for the actual reported defect**: `git stash`ed only `publish-agent-tools.ts` back
to its pre-fix `HEAD` state, reran `publish-agent-tools.unit.test.ts` — the 2 new
unverified/failed-verification tests AND the updated existing capabilities test failed (3/37),
every other test (including everything about `deployment_execute_static_publish` and the
propose-credential tool, which this change never touched) stayed green. Popped the stash, reran:
37/37 pass. Full output captured in this session; not re-pasted here per the offload-large-output
rule — summary: RED was exactly the 3 tests touching the new contract, nothing else, confirming the
fix is both necessary (old code fails the new tests) and precise (no unrelated test moved).

**Fresh evidence, current HEAD** (`c7af2422`):
- `npx tsc -p tsconfig.json --noEmit` — 0 errors, full project.
- `node --import tsx --test src/features/deployments/__tests__/publish-agent-tools.unit.test.ts` — 37/37 pass.
- `node --import tsx --test src/server/__tests__/routes/publish-credentials-route.test.ts src/features/deployments/static-publish/__tests__/verify.unit.test.ts` — 20/20 pass.

**Deliberately not built this pass** (stated up front in the design, restated here for the
handoff): env-var-sourced credential verification has no trigger wired (no "just saved" moment or
admin row to attach a Verify button to for that path — `verified` stays `null` forever for an
env-fallback-only provider until/unless a future CLI or route adds one); `deployment_execute_static_publish`'s
pre-flight gate still checks only `isConfigured()`, not the cached verification (reasoning: the real
publish attempt IS the truest verification — gating on a possibly-stale cache risks being wrong in
either direction); the confirmation dialog does not yet show a "last verified: failed" warning line
(flagged as a natural, low-risk follow-up using the same cached data, not implemented to keep this
pass's diff reviewable).

## Second-pass note — the "7 failing tests" ground truth did not reproduce (2026-08-16, later pass)

Dispatched to pick this work up believing `verify.unit.test.ts` was RED at commit `2e0b3bbe` (a
coordinator `wip:` commit made to rescue this work before an earlier agent was stopped — commit
message: "all 7 tests in static-publish/__tests__/verify.unit.test.ts fail at this tree (71/78
across the directory)"). Before touching any code, I tried to reproduce that failure and could not,
by three independent methods:

1. `node --import tsx --test "src/features/deployments/static-publish/__tests__/*.test.ts"` from the
   repo root against the live working tree (which is bit-for-bit identical to `2e0b3bbe` for
   `verify.ts` and `verify.unit.test.ts` — confirmed via `git diff 2e0b3bbe -- <both files>`,
   empty): **78/78 pass.**
2. Because the shared tree could in principle have drifted from other agents' concurrent edits
   (per this repo's own "concurrent agents share one git index" hazard), I created an isolated
   detached-HEAD `git worktree` pinned exactly at `2e0b3bbe`, symlinked `node_modules` in (no
   install, no build), and ran the same command there — no shared-tree confound possible. **78/78
   pass**, run twice back-to-back to rule out flakiness (both runs identical).
3. `publish-agent-tools.unit.test.ts`, also touched by the same wip commit, run the same way in
   the isolated worktree: **38/38 pass** (not 37/37 as the original agent's "37/37 green" claim
   said either, though that's off by a test-count detail, not a color — still fully green).

I cannot explain the coordinator's original RED reading — possibly a transient run against a
different, uncommitted intermediate state that predates what actually landed in `2e0b3bbe`, or a
misattributed failure from a different file. What I can state with fresh, adversarially-verified
evidence: **at `2e0b3bbe`, and at current HEAD, this feature's own test suite is fully green.**
Flagging per the brief's own instruction to push back when evidence contradicts the dispatch —
not asserting bad faith, just that the premise didn't hold up under an independent recheck.

One real, separate thing I did find and fix: a genuinely **unfinished, uncommitted** file sitting
in the shared tree — `src/server/__tests__/routes/publish-credentials-route.test.ts` had 40 lines
of in-progress edits (not yet committed by whoever wrote them) updating two existing assertions
from the old binary `verification.ok` shape to the real `{valid|invalid|unreachable}` `status`
field, plus a new test proving a transport-level fetch failure during `POST .../:id/verify` reports
`'unreachable'`, never `'invalid'`. This was correct, on-scope, already-passing work (11/11 once
run) — just never committed. I verified it (ran it, typechecked the project) and committed it as
`d94831ba` rather than leaving it exposed to the same "stopped mid-flight" loss the wip commit was
written to prevent.

**Fresh evidence, current HEAD (`d94831ba`):**
- `npx tsc -p tsconfig.json --noEmit` — 0 errors, full project.
- `node --import tsx --test "src/features/deployments/static-publish/__tests__/*.test.ts"` — 78/78 pass.
- `node --import tsx --test "src/features/deployments/__tests__/*.test.ts"` — 45/45 pass.
- `node --import tsx --test "src/server/__tests__/routes/publish-credentials-route.test.ts"` — 11/11 pass.

**Task 1 status: GREEN, no further implementation needed.** No test was weakened or deleted to
reach this state — the one file I changed was a commit of pre-existing, already-passing work, not
an edit. Moving to Task 2 (Vercel/Netlify non-JSON-poll fix in Jini) next.
