TDD Agent(Execution): mutjudge-46 report, 2026-10-15. Loaded: AI-Dev-Shop/agents/tdd/skills.md, skills/adversarial-test-design/SKILL.md.

HOME: sites.json was rewritten at 17:27 (md5 440b8850 -> fb996528) but still lists exactly luvira, plannie, tovu-dev, order-pinch; site-keys (859) and ~/Documents/Tovu unchanged. Not restored; writer unknown (my last run's test file imports isolated-catalog-home first).

Commits (Tovu, test-only; Jini none):
- bcba63e81 security-i18n.ts: 3 survived -> 2 killed, 1 equivalent (also replaced a tautological self-comparison test)
- 24d7c314a AccessTokensTab.tsx: 6/8 -> 8/8 killed
- 79e63a6f2 import-access-token.ts: 4 survived -> 1 (no observable effect today)
- 4d55ac5be six route suites import isolated-catalog-home (dev-auth row 5 BASELINE-RED cause: 78/92 + 2 failing "Test home isolation required") -> baselines green
- 3b47104f7 write-files-validation.ts: 9/10 -> 10/10 killed
- f76f572d2 use-access-tokens.hooks.ts: 10 survived/10 inconclusive -> 9 survived/0 inconclusive (all 9 judged equivalent/unreachable)
- 83a324f81 publish-trust-auth.ts (+ gate isolation): full test set 3 killed/7 survived/2 inconclusive -> 8 killed/3 equivalent/2 inconclusive; the 2 (:114, :249) hand-verified RED (neutralised, single direct test 1/1 fail, restored green)

Survivors judged: 26 load-bearing-untested (19 pinned + committed above, 1 pinned uncommitted [credential-setup :138], 6 auth guards in dev-auth pending re-sweep), 12 redundant/equivalent + 6 unreachable -> OWNER-LIST.md in this folder. dev-auth.ts (19 survived/3 inconclusive of 24 on the 6-file discovery set) not yet judged: the set is narrow; re-sweep with the auth suites is step 2 of the handoff.
Codex rounds: r1 (3 shards), r2 (isolation, 7 files), r3 (2), r4 (publish-trust), r5 (credential-setup), r6 (isolation for 5 auth suites, RUNNING at stop, out-r6). Nothing sent back to Codex for a second pass; none stuck.
Leftovers: r6 running; propose-credential-tool.test.ts (r5) uncommitted pending a baseline check; results.tsv rows >17 not yet polled.
Handoff: ADS-memory/.local-artifacts/handoffs/2026-10-15-mutjudge-46.md
