# Publish ownership-manifest hardening — design record

**Date:** 2026-08-19 · **Commit:** `efd7e2c8` · **Status: all 3 defects fixed, 206/206 tests, gates green**

Written from the implementing agent's own report. Captures the design rationale a fresh session
cannot reconstruct from the diff alone.

## Why this existed

A CRITICAL bug fixed earlier the same day (`30d77e9f`): GitHub publishing omitted `base_tree`, so a
commit REPLACED the branch tree and silently deleted unrelated files (README, workflows, source). That
`base_tree` repair is correct and was confirmed by three independent auditors — **do not destabilize it.**

The repair introduced an ownership manifest so only Tovu-written paths could be deleted. **Three
independent auditors** (Claude Sonnet 5, `gpt-5.6-sol` xhigh, `gpt-5.6-terra` xhigh — no communication
between them) then found that manifest layer BROKEN in three ways. All three are now fixed.

## Defect 1 — ownership was trusted blindly → verified by content hash

The manifest was a bare string list. Anything on it could be deleted, with no check that the current
content was still what Tovu wrote. So: Tovu publishes `about.html` → a human edits it → a later export
omits it → **Tovu deletes the human's work.** A hand-edited manifest naming `README.md` authorized
deleting that too.

**Now:**
- GitHub: `.tovu/managed-files.json` is `{version:2, files:[{path, sha}]}` — the git blob sha, which
  GitHub already computes deterministically from content, so no new hashing was needed. `fetchLiveBlobSha`
  re-reads the path's current blob sha before deleting. Match → delete. Mismatch or legacy `v1` entry →
  **skip and report** via a new `divergedPaths` field threaded out to the agent tool result.
- S3: `.tovu/managed-keys.json` is `{version:2, keys:[{key, etag}]}`, recording the ETag observed on the
  target's own PUT. `fetchLiveETag` HEADs before deleting. Mismatch/unverifiable → skip, reported via
  `statusMessage` (`DeployPublishResult` is `@jini-ai/devops`'s port — widening it was out of scope).

**Key design decision, deliberately taken:** a legacy/unverifiable entry is **never auto-adopted** into
the v2 manifest with its current hash. Adopting would let a later publish delete it once evicted,
silently laundering whatever wrote it in the meantime. It is dropped from tracking and reported; a fresh
export of that exact path re-establishes verifiable ownership normally. Disclosed as an accepted
limitation in both file headers rather than building adoption machinery.

## Defect 2 — concurrent S3 publishers lost data → conditional write with retry

No lock, no ETag, no compare-and-swap. Traced loss: both publishers read manifest `{x}`; A uploads `x`;
B's set omits `x` and deletes it; B writes `{}`; A writes `{x}`. **Manifest says `x` exists; the object
is gone.**

**Now:** `writeManagedManifestConditional` sends `If-Match` (keyed to the ETag this run observed) or
`If-None-Match: *` when no prior manifest exists. `publish()` wraps read→verify→delete→write in a loop
bounded to `MAX_MANIFEST_WRITE_ATTEMPTS = 3`. A `412`/`409` means a real racer won since this run's read
→ re-read the manifest **fresh** and recompute the stale-key diff against it (never reuse the stale
diff). Uploads happen once up front — they are idempotent and need no redo.

**S3-compatible providers without conditional write:** a `501`, or a `400` whose body names an
unsupported operation, is treated as "this provider cannot do compare-and-swap" → degrades to a plain
unconditional write for the remainder of that call. Publishing still succeeds end to end (hard
requirement). **The residual risk is disclosed via `statusMessage`, not silently absorbed.**

**GitHub verdict — verified, not assumed.** The auditors asserted GitHub is immune because its non-force
ref `PATCH` gives real optimistic concurrency. That was tested rather than trusted: two `commit()` calls
raced via `Promise.all` against a shared mutable branch-tip variable checked at PATCH time (real
interleaving, not a canned response). Exactly one succeeds; the other gets `diverged`. **No GitHub-side
fix was needed.**

## Defect 3 — a transient manifest read failure permanently forgot stale content → fail loud

Both readers returned `undefined` on ANY read failure, then wrote the new manifest as the current set
only. So a one-off network blip on a publish where the export shrank meant the removed page stayed live
and vanished from every future manifest — **permanently untrackable**, the exact bug the manifest exists
to prevent.

**Now:** both distinguish a **verified 404** ("no manifest yet" — safe, treat as empty) from every other
failure (network, non-404 HTTP, unparseable body, unrecognized shape). Everything else **fails the whole
commit/publish**. First-publish-after-upgrade is unaffected and still safe.

The old comment claiming this "self-heals in one extra publish cycle" was **false** — the next successful
write permanently overwrites the only record. Comment corrected in place.

## Tests that were REVERSED, not weakened

Three pre-existing assertions encoded the defects themselves and had to be inverted:
- GitHub "page removed from export is deleted" — seeded a v1 bare-path manifest and asserted **blind**
  deletion. Now seeds a v2 manifest with a verified matching sha.
- The same pattern in three S3 fixtures.
- GitHub "a failed manifest lookup does NOT block a real commit" — that tolerance **was** defect 3.

Each carries an inline comment explaining the reversal and citing this round's auditors.

## Trap found along the way (library behavior, not a bug)

`aws4fetch`'s `AwsClient` retries any 5xx/429 with exponential backoff — 10 retries, real `setTimeout`,
~50s worst case (verified by reading `aws4fetch.cjs.js`). Two new tests using 500/501 ballooned the S3
suite to ~35s despite being fully mocked. Fixed by using 403 where the exact status did not matter, and
stubbing `globalThis.setTimeout` in the one test that genuinely needs 501. Suite back to ~1s.

## Verification
`206/206` tests across both suites · `typecheck` clean · `check:boundaries` 0 errors ·
`check:architecture` OK (one non-blocking ratchet note: propagation cost 12.20→12.22, +0.02pp from the
new `PreviouslyManagedFile`/`PreviouslyManagedKey` types).

## Next step for whoever picks this up
Nothing outstanding on these three defects. The disclosed, deliberate limitations are:
1. Legacy v1 manifest entries are dropped from tracking rather than adopted (see Defect 1).
2. A provider without conditional-write support gets no compare-and-swap for that publish (see Defect 2).
Both are reported at runtime, not silent. Revisit only if a real deployment hits them.
