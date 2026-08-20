# Publish ownership-manifest hardening — handoff (2026-08-19)

**Status: all three assigned defects are DONE, committed, and verified green.** This is not a
partial handoff in the "half-built, pick up where I left off" sense — it documents completed work
and the design record a fresh session would otherwise have to reconstruct or redo badly.

- Commit: `efd7e2c8` on branch `general-work` (parent `13b4f259`).
- Scope: `src/features/source-control/github-git-provider.ts` (+its test), `commit-site.ts`,
  `tool-registrations.ts`; `src/features/deployments/static-publish/s3-compatible-target.ts`
  (+its test).
- Dispatch context: three independent auditors (Claude Sonnet 5, Codex 5.6-sol, Codex 5.6-terra —
  no communication between them) reviewed the `base_tree` fix's own follow-on ownership-manifest
  layer and returned BROKEN/SOUND-WITH-GAPS. Reports:
  `ADS-memory/.local-artifacts/swarm-consensus/runs/FIXAUDIT-sol-2026-08-19.md` and
  `FIXAUDIT-terra-2026-08-19.md`.

## Per-defect status

### Defect 1 — ownership trusted blindly (HIGH) — DONE

**Evidence of done:** both adapters now require a per-path/per-key content hash before deleting.
New tests, run RED against the pre-fix code then GREEN after:
- `github-git-provider.unit.test.ts`: legacy-manifest-no-sha test, hash-mismatch test,
  per-path-verification-read-failure test — all 23/23 pass.
- `s3-compatible-target.unit.test.ts`: legacy-manifest-no-etag test, etag-mismatch test,
  per-key-verification-HEAD-failure test — all 18/18 pass.
- Two PRE-EXISTING tests in each file had themselves encoded the defect (asserted a bare-path/key
  manifest entry authorizes deletion) and were rewritten, not weakened — see "Corrections to
  existing tests" below.

### Defect 2 — S3 has no cross-publisher concurrency guard (HIGH) — DONE

**Evidence of done:** `writeManagedManifestConditional` sends `If-Match`/`If-None-Match`;
`publish()` retries the whole read→verify→delete→write cycle from a FRESH manifest read on a real
`412`/`409`, bounded to 3 attempts. New test drives the exact scenario terra traced (republish vs.
unpublish racing on the same key) via a deterministic scripted mock (first manifest GET returns a
stale pre-race snapshot; the manifest PUT genuinely rejects with 412 because a second, faked
"winning" actor already wrote a different state; the retry re-reads and succeeds) — 18/18 pass,
plus the 501-degrade path (see below).

### Defect 3 — a transient manifest read failure permanently forgets stale content (HIGH) — DONE

**Evidence of done:** both `fetchManagedManifest` functions now distinguish a verified 404 from
every other failure (network, non-404 HTTP, unparseable body, unrecognized shape); only the
verified 404 is treated as "zero prior entries." Every other failure now fails the whole
commit/publish. New tests for network failure, non-404 HTTP, and unparseable-body cases — all
pass. One EXISTING GitHub test asserted the old (wrong) behavior and was rewritten with a doc
comment explaining the reversal — see below.

## Design chosen, and alternatives rejected

**Provenance shape.** GitHub manifest bumped `.tovu/managed-files.json` from
`{version:1, paths:string[]}` to `{version:2, files:[{path,sha}]}`, using the git blob sha GitHub
already computes deterministically from content (no new hashing — `createBlob`'s response already
returns it, and a plain Contents API GET of any path returns the current blob sha too). S3
manifest bumped `.tovu/managed-keys.json` to `{version:2, keys:[{key,etag}]}`, using the ETag the
target itself observes on its own PUT response, compared later against a HEAD's ETag for the same
key.

*Rejected: computing our own sha256 of the uploaded bytes for S3 instead of trusting the
provider's ETag.* Two reasons: (1) it doesn't buy anything — the comparison is "does the provider
currently report the SAME value it reported when we wrote it," and using the provider's own opaque
ETag for both sides of that comparison is self-consistent regardless of what hashing scheme
underlies it; (2) it would require a full GET (download) to verify instead of a cheap HEAD,
doubling bandwidth for every candidate deletion. Documented residual assumption in the file header:
this relies on the provider returning a stable, content-derived ETag across GET/HEAD calls for a
non-multipart PUT — true for every provider in scope (AWS S3, R2, MinIO, B2, DigitalOcean Spaces,
Wasabi) for the single-PUT shape this target always uses, but not a protocol guarantee.

**What happens to a legacy/unverifiable entry — the "adoption path" question.** A path/key with no
recorded hash (a pre-fix `v1` manifest, or one whose per-entry hash failed to parse) is NEVER
auto-deleted, and is dropped from tracking going forward rather than being silently re-adopted with
its current live hash.

*Rejected alternative: auto-adopt it into the new manifest at its current live hash, so a
SUBSEQUENT publish (one cycle later) could verify-and-delete it.* This looked appealing (closes
the migration gap automatically) but has a real flaw: for the hash-MISMATCH case specifically
(defect 1's core scenario — a human edited a Tovu-published page), auto-adopting the human's edit
as "now Tovu's own recorded content" would silently launder that edit into future-deletable status
the moment it's ever evicted from export — defeating the whole point of verification. I could have
split the two cases (adopt only when there was NO prior hash at all; never adopt on a genuine
mismatch), but chose the simpler, uniform rule — never adopt, always require a fresh real export to
re-establish provenance — specifically because it needs no extra state machinery, is trivially
correct to reason about, and the cost (one path stays untracked until a human intervenes or a real
re-export covers it again) is bounded and disclosed, not silent. This is recorded as an explicit,
accepted limitation in both files' header comments, not a TODO.

**Reporting divergence.** GitHub: added `divergedPaths: readonly string[]` (optional in the
adapter-result type, always populated by the real adapter) threaded through
`GitHubCommitAdapterResult` → `SourceControlCommitOutcome` → the `source_control_execute_commit`
tool's returned object, plus a short addition to that tool's model-facing description telling the
agent to relay it to the human. S3: `DeployPublishResult` is a `@jini-ai/devops` (Jini) port type —
out of this fix's scope to widen — so divergence + "concurrency guard unavailable" notes ride the
existing `statusMessage` free-text field instead, bounded to a 3-item preview.

**Retry bound.** `MAX_MANIFEST_WRITE_ATTEMPTS = 3` for S3's conflict-retry loop. Not tuned against
any measured contention rate — a small, documented, defensible default (a real conflict resolves
in one retry almost always; repeated conflicts beyond that indicate sustained contention worth
surfacing rather than retrying into indefinitely).

## The S3-compatible-provider conditional-write question

`If-Match`/`If-None-Match` on `PUT` is NOT universal across the providers this target targets.
What I found (general knowledge, not independently re-verified against every provider's current
docs in this session — flag this if it matters for a production rollout):
- AWS S3 added conditional writes relatively recently; older client assumptions and some
  third-party S3-compatible stacks may not implement it.
- Cloudflare R2, MinIO, Backblaze B2's S3-compatible layer, DigitalOcean Spaces, Wasabi have varying
  and evolving support — I did not verify current support matrices for each; this was treated as
  "assume heterogeneous, detect at runtime" rather than hardcoding a per-provider capability table
  (a capability table would need active maintenance against providers changing behavior over time,
  which is worse than runtime detection).

**What the code does when it's unavailable:** `writeManagedManifestConditional` treats a `501`, or
a `400` whose body names an unsupported/not-implemented operation, as `"unsupported"`. `publish()`
then degrades to a plain unconditional write for the REST of that one `publish()` call (not cached
across calls — each publish independently probes) and keeps going; publishing still succeeds
end-to-end. The residual risk is disclosed via `statusMessage` (a sentence naming that the
concurrency guard was unavailable for this call), not silently absorbed.

**Residual risk, stated plainly:** on a provider that cannot do conditional writes, two publishers
racing can still lose data the same way the pre-fix code could — this fix does not and cannot close
that gap for such a provider without an external lock (e.g., a DynamoDB-style lease), which is out
of scope for this pass. This is real and I am not papering over it. If this matters in practice,
the next step would be either (a) accepting it as documented residual risk (current state), or (b)
adding an external locking layer, which is a meaningfully larger change (new infra dependency,
lease semantics, timeout/expiry design) that should be its own scoped piece of work, not bolted on
here.

**One thing worth flagging that neither auditor's report addressed:** I could not find, and did not
independently verify, a live capability-detection mechanism more reliable than "try it and read the
response" (e.g., no standard `OPTIONS`/capability-advertisement endpoint across these providers).
Runtime detection-on-first-attempt is therefore the best available signal, not a compromise chosen
for convenience.

## GitHub adapter concurrency — my independent verdict

**Verdict: genuinely safe, evidence beyond re-assertion.** All three auditors said the non-force
`PATCH` ref update gives real optimistic concurrency. I did not just trust that — I wrote a NEW
test (`CRITICAL (concurrency): two commits racing on the SAME branch tip...`) that runs two real
`commit()` calls concurrently via `Promise.all` against a SHARED mutable fake branch-tip variable,
where the PATCH handler checks — at PATCH time, not at read time — whether the committing call's
own commit-parent still equals the CURRENT branch tip. This is a genuine interleaving check, not a
canned single 422 response. Result: exactly one of the two racing commits succeeds; the other gets
`code: "diverged"`. This passed on the first correct implementation and required no adapter changes
— GitHub's own side needed no fix.

**One nuance worth carrying forward, not a defect:** terra's own report notes a losing racer "may
be returned as `provider-error` on 409 rather than `diverged` (only 422 maps to `diverged`)". I did
not independently re-verify GitHub's exact status code for every non-fast-forward rejection shape,
but if GitHub ever returns something other than 422 for a real race loss, that racer's outcome
would surface to a human as `PROVIDER_ERROR` (a generic "something went wrong with GitHub") rather
than `DIVERGED_BRANCH` (the friendlier, accurate "someone else pushed, try again" message the tool
description specifically explains). The DATA is still safe either way (the ref write is still
correctly refused) — this is purely a UX/message-accuracy nuance, not a correctness gap. Not fixed
here; worth a follow-up only if this exact edge is ever observed live.

## Anything the auditors got wrong

Nothing factual. All three defects reproduced exactly as described the moment I wrote RED tests
against the pre-fix code — no false positives found. Their design recommendations (real
compare-and-swap with retry-from-fresh-read; treat non-404 read failure as a hard fail; verify
before delete) were sound and are what got implemented, sometimes with a different concrete
mechanism than they sketched (e.g., they didn't specify blob-sha/ETag as the provenance value —
that was my own design choice, justified above) but no disagreement with their diagnosis.

## A genuinely new finding from this session (not in either audit report)

`aws4fetch`'s `AwsClient.fetch` (used by the S3 target, verified by reading
`node_modules/aws4fetch/dist/aws4fetch.cjs.js` directly) has ITS OWN built-in
retry-with-exponential-backoff on any 5xx or 429 response — up to 10 attempts, real `setTimeout`
waits, ~50s worst case, defaulting from the constructor (`retries: 10, initRetryMs: 50`) which
`S3CompatibleDeployTarget`'s constructor does not override. This is pre-existing library behavior,
untouched by this fix, and does not affect correctness — but it interacts with MY new 3-attempt
manifest-conflict retry loop: a real publish hitting sustained 5xx from the provider on, say, the
manifest write, could now compound aws4fetch's own retry storm (up to ~50s) INSIDE each of my own
up-to-3 outer attempts, for a worst-case single `publish()` call of several minutes before it
finally throws. This was invisible before because nothing in this codebase's existing test suite
exercised a 5xx response against this client before today (I hit it directly while writing the two
5xx-based tests this fix needed, and had to work around it in the TESTS — see below — without
touching the production retry defaults, which felt out of scope for a manifest-ownership fix).
**Flagging this as worth a deliberate decision, not a silent gap:** should `S3CompatibleDeployTarget`
pass a tighter `retries`/`initRetryMs` to `AwsClient`, given a human is very likely waiting
synchronously on a publish's result? I did not make this call — it's a production latency/UX
tradeoff (fewer retries = faster failure but less resilience to real transient errors) that
deserves its own decision, not one made as a side effect of a manifest-ownership fix.

## Corrections to existing tests (documented reversals, not weakenings)

Per the hard rule against weakening tests, every changed assertion is a documented case where the
OLD assertion was itself proof of the defect:

1. `github-git-provider.unit.test.ts`, "a failed MANIFEST lookup does NOT block a real, wanted
   commit" → renamed and REVERSED to assert the opposite (now correctly blocks). Old assertion was
   literally defect 3.
2. `github-git-provider.unit.test.ts`, "CRITICAL: a page removed from the export is explicitly
   deleted" → previously seeded a `v1` (bare-path) manifest and asserted blind deletion from list
   membership alone. Rewritten to seed a `v2` manifest with a matching, VERIFIED sha — same intent
   (prove stale-page deletion works), corrected mechanism.
3. `s3-compatible-target.unit.test.ts` — three analogous fixture corrections (the
   "publish deletes a previously-published key" test, the "manifest updated ONLY AFTER upload and
   delete" test, and the "delete failure...throws" test) — all switched from `v1` bare-key
   manifests to `v2` manifests with matching, HEAD-verified etags, adding explicit HEAD-response
   stubs so the delete path is genuinely exercised rather than silently skipped.
4. Several pre-existing "happy path" S3 tests (`publish: signs and PUTs every file...`, `...falls
   back to application/octet-stream...`, `...explicit endpoint is used verbatim...`, `...uploads at
   most 8 files concurrently...`) used a blanket `() => okResponse()` mock that returned `200` with
   an EMPTY body for the manifest GET too — under the fix, a 200-with-unparseable-body is correctly
   treated as "unreadable" (defect 3), which would have made these unrelated tests fail for a
   reason that has nothing to do with what they test. Fixed by making the manifest GET explicitly
   return a real `404` in these fixtures' default responder (`respondIgnoringManifest`) — this is a
   fixture-realism fix, not a weakening: a real bucket's first-ever manifest GET IS a 404, not a
   200-empty-body, so the corrected fixture is MORE accurate to production, not less.

## Traps the next session would otherwise hit

1. **Do not test 5xx/429 responses against `S3CompatibleDeployTarget` without accounting for
   aws4fetch's built-in retry** (see above) — a naive test will pass but take 20-40+ real seconds.
   Either use a non-5xx status when the exact code doesn't matter to the assertion, or stub
   `globalThis.setTimeout` to fire immediately for the duration of that one test (pattern used in
   the "501 degrades to unconditional write" test — search that test name for the exact technique).
2. **`checkDeploymentUrl` (from `@jini-ai/devops/deploy`) calls the global `fetch` with a bare
   STRING url + separate `init`, not a `Request` object** — unlike `AwsClient.fetch`, which always
   calls it with a signed `Request`. A hand-rolled mock in this test file that blindly casts
   `input as Request` will throw (`new URL(undefined)`) the moment `checkDeploymentUrl`'s own
   reachability probe fires, and `checkDeploymentUrl` swallows that as "not reachable" —
   surfacing as a confusing `status: 'link-delayed'` assertion failure that has NOTHING to do with
   whatever the test actually intended to check. Use the file's own `requestUrlAndMethod` helper
   (added this session, right after `respondIgnoringManifest`) in any new hand-rolled mock instead
   of casting directly.
3. **The manifest schema is now `v2` in both files.** Any other code path that reads or writes
   `.tovu/managed-files.json` / `.tovu/managed-keys.json` directly (I found none beyond the two
   adapters themselves, but did not do an exhaustive repo-wide search beyond `grep` for the two
   constant names) would need updating too.
4. **If someone wants to close the "no lock" residual risk for non-conditional-write providers**,
   that is a new, separately-scoped piece of work (external locking/lease layer) — not a quick
   follow-up to this fix.

## Fresh verification (re-run at handoff time, not stale)

```
node --import tsx --test --test-concurrency=2 src/features/source-control/__tests__/*.test.ts src/features/deployments/static-publish/__tests__/*.test.ts
→ 206/206 pass

npm run typecheck        → clean
npm run check:boundaries → 0 errors (74 pre-existing warnings, none in the touched files)
npm run check:architecture → OK, hard constraints hold
  (1 non-blocking ratchet warning: propagation cost (all-import) 12.20% → 12.22%,
   attributable to the new PreviouslyManagedFile/PreviouslyManagedKey interfaces —
   flagged honestly, does not block)
```

`git status --short` on the six touched files is clean (all committed at `efd7e2c8`); nothing was
left uncommitted from this piece of work.
