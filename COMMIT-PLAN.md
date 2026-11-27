# COMMIT-PLAN — docs only, 2026-11-25

Working-tree handoff; coordinator commits. No commit or push performed; `.git` remained read-only.

## Completed commit, in order

1. `docs: merge and reverify open-bugs at merge-23 tip`
   - Commit only `development/open-bugs.md`.
   - Merge HEAD inventory with the read-only owner-local inventory; retain original sections, narratives, and every commit reference.
   - Merge 28 owner variants into existing records; retain 24 owner-only records/notes in their corresponding date sections.
   - Add current source verdicts, one evidence line per tagged record, dated summary, and 15 confirmed-open priorities.

## Counts

- STILL OPEN: 45
- FIXED AT HEAD: 67
- CANNOT VERIFY FROM CODE: 831
- DUPLICATE: 36
- Total tagged inventory records: 979
- Previously fixed records spot-checked: 30; confirmed in source: 30; reopened: 0.

Counting unit is one existing ledger entry. Original omnibus reports remain bundled. These are not counts of every allegation inside omnibus reports, nor of untagged closed history. CANNOT VERIFY records are uncertain, not confirmed-open defects. Runtime/tooling failure claims need the clean coordinator run or the manual scenario described in their evidence. No tests, builds, installs, typechecks, linters, or mutations were run or added.

## Source snapshots

- Tovu HEAD: 6ace8e8fb2de3ffb47ee2756f501a59c30332160.
- Companion Jini read-only git objects: origin/integ/merge-23-2026-11-25, 7727d518c148b4e243abe74101f8f28adb2b885f.
- Companion-source findings do not certify installed npm artifacts or packaged releases.

## Fixed spot-check records

H1750, H1757, H1764, H1771, H1778, H1785, H1793, H1800, H2039, H2037, H2033, H2034, H2035, H1948, H1950, H2210, H2209, H2181, H2180, H2148, H2152, H2158, H2164, H2197, H2198, H2199, H2187, H2188, H2191, H2076

Each record has the source pointer and spot-check number in open-bugs.md. Checks included enable/reset-password protections, title redaction/scrub, search activity scope, widget attrs, member CAS, note rename, endpoint approval, menu leave guard, media dates/conversion notice, mail clear, keyring owner, Storage/Trash/cleanup/provider UI, expired-share passwords, durable apply, HTML recording, video risk, moved fixtures and composed reporters.

## Fresh document verification

- Every nonblank original line from both inputs is retained as content (verdict prefixes and same-entry owner notes are the only wrappers).
- All 619 HEAD and 455 owner commit-like references survive.
- All original headings retain their order.
- All classified open inventory records have one verdict and evidence id; duplicate targets resolve.
- Exactly 15 priority records, each STILL OPEN; exactly 30 numbered fixed spot checks.
- Only open-bugs.md is a tracked change; this COMMIT-PLAN.md is the requested uncommitted handoff artifact.

## Scope, removals and remaining work

- No source or test changes. No new bugs invented. No original text or commit references deleted.
- Deleted additions during self-review: erroneous duplicate classifications that conflated distinct bugs in shared AG-UI, title, import and UI modules; provisional evidence pointers to moved files were replaced by the actual current owners. These deletions affect only draft annotations, not original ledger content.
- No implementation sheets applied or stopped; OPUS/NEEDS-OPUS/REJECT/dependent implementation work remains with its existing owner. The 831 CANNOT VERIFY records and explicit packaged/live checks require the stated follow-up evidence.
- Do not commit COMMIT-PLAN.md.
