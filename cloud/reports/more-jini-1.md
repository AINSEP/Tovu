# more-jini-1 — in progress

Started 2026-11-07 17:45 UTC; hard deadline 20:45 UTC (three hours maximum).

Owner job: origin/cloud-plans-1105:cloud/jobs/more-jini-1.md; overrides COMMON.
Branches: cloud/more-jini-1 in both repositories.
Bases: Tovu b45d2ee759009b08d04268ef9ddcf2b6d0f60671; Jini 32e9c9c2128805b20d1a562d6f0053d1c4604b52.

Item 1 in progress: establishing rebuilt baseline and boundary checks, then commands extraction.
Item 2 not started; item 1 must finish first.
No production changes yet. No data or runtime I/O change.
Required Software Architect, Programmer, TDD persona files loaded from /workspace/cloud/ai-dev-shop.
Local index checks: Codebase Memory/Graphify absent; understand-anything queried, no relevant result; using fresh source reads.

Item 1 checkpoint (17:55 UTC): Jini commit 66bf2d2bff60590aeea6a752f66a5e5d4a979413 pushed.
382 original source lines moved using git mv into a temporary path, then transferred across repositories; all 30 comments byte-exact. Four Tovu shims total 10 lines; Jini required/optional registry signature adds three lines. No importer or test edits.
New public-entry test: 41 lines. Commands tests: 91/91 pass. Jini affected tests: 26/26 pass. CMS tsc and build pass after type-only optional-property adaptations (TS2412/TS2375), retaining the original actorId key/value. Layer check passes; isolation and guard are byte-identical to base. Complexity lint passes in both repositories.
Packed core/cms installed into a throwaway consumer; plain Node import and registry/repository operations pass; consumer deleted.
Initial importer run: 658 pass/22 fail, all missing otplib or stale @tovu/contracts output. Dependency setup repaired and tests rerunning. No code/test changes for those setup failures.
Base rebuild: 38 packages pass, four fail (agent-plugins, provider-plugins, chat, user-management); missing dependencies/types. Full diagnostics retained in workspace scratch logs; final report will list exact commands/results.

Item 1 DONE (17:57 UTC): after setup repair, importer run had 740 pass/9 loader failures from tests started before the dependency links were repaired. Those nine files reran: 180/180 pass. Thus every direct importer file passed unedited; no remaining item-1 regression. Jini formatting-only follow-up 85573e837 pushed. New entry import proof passes with plain Node. Item 2 now starting.

Item 2 checkpoint (18:03 UTC): moved 1,593 original lines to db/src/data-modules; public entry @jini-ai/db/data-modules. Jini 2364f89e7 committed/pushing. Jini production +33 net lines (object-call adapters/public exports/types), Tovu shims 36 lines; new tests/helper 81 lines. All 131 explanatory comments byte-exact; inherited ineffective eslint-disable omitted rather than introduced into Jini. No Tovu/TOVU_/tovu literal found in the nine source files. Host-provided provenance and all existing declarations stay unchanged, including publisher values. DB build/tsc pass. New entry tests pass on SQLite (1), PGlite (1), and real Postgres (1). Layers pass; isolation/guard byte-identical to base after type-only ReadonlySet annotation. No rules edited. Existing Tovu plugin/importer tests running unedited.
