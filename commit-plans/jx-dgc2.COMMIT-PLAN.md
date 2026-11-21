# COMMIT-PLAN

## J4 — Cancel entry update before persistence

- Status: done; execution and mutation verification owed to combine.
- Base: `codex/jx-dgc2`, `26d5ddfdd15d2d1de22cf8e894eb8afd4da2056a`.
- Files: `packages/cms/src/entries/__tests__/tool-registrations.cov-j2.test.ts`, `packages/cms/src/entries/tool-registrations.ts`, `packages/cms/src/entries/write-service.ts`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Tests written before production edits: transaction-admission cancellation asserts original abort-reason identity, original title/version, no revision append and no added event; committed control aborts during update outbox enqueue and asserts successful result and stored title/version. Test count: 8 -> 10; none removed.
- Red rationale (not executed): the original handler drops the signal and the writer ignores cancellation, so the admission witness resolves and writes instead of rejecting. The committed control already passes by design; it protects post-write settlement.
- Mutation owed to combine: remove `optional.signal?.throwIfAborted()` from the `runVersionedWrite` callback; the admission witness must fail. Run the named witnesses unmutated too.
- API-baseline delta (Jini): additive second parameter `optional: { signal?: AbortSignal | undefined } = {}` on `@jini-ai/cms/entries#updateEntry`; combine owns fingerprint, changeset and paired release review. Existing one-argument calls remain valid.
- Look owed: none.
- Overlap: entry write-service at HEAD equals `fb41117be` byte-for-byte before this edit; no S6 overlap. Existing transaction owns the first write; CAS, revision, `onWritten` and outbox sequence preserved.
- Limits: `updateEntry` is 30 physical lines; registration builder is 45. Changed functions remain within complexity 10 by source review; no metric tool ran. `write-service.ts` is 656 lines (>500, recorded as instructed).
- Verification: read back the exact three-file diff against HEAD. No tests, builds, installs, type checks, linters or git mutations ran, per machine rule.
- Diff re-read deletions: none; no out-of-scope edits retained. Existing pads and other sheets untouched. No new comments, dependencies, casts, helpers or exports.
