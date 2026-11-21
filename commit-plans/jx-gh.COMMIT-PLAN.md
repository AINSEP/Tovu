# GH-J1

- Status: implementation done; execution deferred to combine by the dispatch machine rule.
- Base: Jini `de4e555b9`, branch `codex/jx-gh`.
- Files: `packages/agent-plugins/github/source-control/commit-site.mjs`; `packages/agent-plugins/github/source-control/__tests__/commit-site.test.mjs`; `COMMIT-PLAN.md`; `REFRESH.md`.
- Change: optional `previousManagedManifestPath`, normalized through the existing folder/path policy; canonical-first lookup with predecessor fallback only on a canonical response status of 404. Existing decoder and containment checks handle the selected response. Both ownership paths are reserved and excluded from deletion. Supplying a predecessor pins ownership and stale-file reads to the captured parent SHA. One existing non-forced branch update publishes canonical ownership. New branches still skip manifest reads; callers without the option retain branch reads.
- Tests first: three cases added using existing fixtures; source test count 6 -> 9, with no existing assertion changed or test deleted. Every new assertion has a plain-words message.
- Expected RED before implementation (reasoned, not executed): predecessor case cannot consume predecessor ownership or complete the scripted publish; empty-canonical case reads `main` instead of the required parent SHA; canonical-500 case likewise reads `main` instead of the required parent SHA. The latter two also guard against their named fallback mutations.
- Mutations owed to combine: skip predecessor read and return canonical 404; treat successful empty canonical ownership as absence; broaden fallback from canonical 404 to any unsuccessful response. Each corresponding case must fail.
- API-baseline delta: none. Existing input JSDoc gains the optional field; no baseline, export, manifest, dependency, lockfile, or package edits. BREAKS: none.
- Look owed: combine with GH-T1 against packed Jini; sandbox publish with nested predecessor ownership, proving unchanged stale deletion, edited/unmanaged preservation, and canonical ownership on the second publish. Package release/installation remains OPUS-CLOUD.
- Review: targeted importer lookup matches only the listed provider binding and direct test. Existing optional pads and args remain intact. Changed logic units and new test callbacks remain within the hard limits by manual review; no quality tools were run. No file exceeds 500 lines.
- Architecture review: provider-local change; existing kit, path policy, decoder, refusal handling, and Git Data publish sequence reused. Runtime evidence remains unverified because execution is prohibited.
- Diff re-read deletions: none; no unrelated additions found. No commits or git metadata writes performed.
