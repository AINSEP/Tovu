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

Audited (not yet fixed — reporting per the brief: "report what you find even if you do
not fix it").

*(audit in progress — see next update in this file)*

## Defect B — credential "ready" means "a row exists," not "verified against the provider"

*(not yet started — see progress note to team-lead)*
