# mutjudge-46b report (2026-10-15)

Successor to mutjudge-46. All commits are test-only. Nothing pushed, tagged or published.

## Commits (Tovu, branch restructure/apps-website-phased)
| hash | what | RED | GREEN | mutation |
|---|---|---|---|---|
| d1c749782 | Codex r6: 7 auth/route suites import isolated-catalog-home first | HEAD: admin-password-status-route + credential-setup-search 9/9 fail "Test home isolation required"; the other 5 had 42 failing (mutjudge-46) | 7 files 51/51 | n/a (no source change) |
| 4a40b2f7f | Codex r5: credential-setup.ts:138, so cancelled/expired/abandoned forms render no outcome | :138 mutant killed (was SURVIVED) | propose-credential-tool + credential-setup-search + admin-password-status-route 31/31 | credential-setup.ts: 4 killed / 1 survived / 4 no-op → 5 / 0 / 4 no-op of 9 |
| 53f37075a | Codex r7: 7 dev-auth.ts guards (:307 :326 :273 :637 :699 :489 :668) | each hand-mutated (--test-timeout=60000): all 7 fail by assertion or TypeError, none by timeout | dev-auth.unit + admin-boot-session-route + api-key-routes 24/24 | dev-auth.ts (24): 2 killed / 19 survived / 3 inconclusive → 19 killed / 5 survived / 0 inconclusive |

## dev-auth.ts detail
- Sweeps: v2a (login-rate-limit, admin-logout-route, api-key-routes, publish-trust-gate) gave 15 survived / 2 inconclusive. v2b (admin-boot-session-route, admin-local-boot-session-route, admin-password-status-route) gave 12 / 5. I split the set to stay under ~35 min per lock turn.
- Union of kills: :193 :233 :269 :362 :394 :400 :470 :477 :518 :595 :691.
- Hand-verified kills: the 7 new tests, plus :218. The existing "password login supersedes local owner bootstrap" test fails by assertion and then hangs on server cleanup, which is why the sweep scored it INCONCLUSIVE.
- 5 survivors, judged equivalent or unreachable and appended to ADS-memory/reports/2026-10-15-mutjudge-46/OWNER-LIST.md: :210 (socket always present), :296 (callers use truthiness; the type needs it), :528/:529 ("undefined" vs "" both give 401), :540 (`?? undefined` is a no-op).

## Codex rounds
- r6 (inherited, finished): diff was exactly 7 one-line imports. Accepted.
- r7 (prompts-r7/dev-auth-guards.md, out-r7): 1 shard, exit 0, NOT DONE none. Accepted unchanged.
- Nothing went back to Codex. r5's test was green: the orphaned mutjudge-46 waiter's per-file baseline passed 31/31 (rc=0).

## Home
sites.json was rewritten several times (desktop app timestamps). Its entries are still exactly luvira, plannie, tovu-dev, order-pinch. site-keys count is 859 and ~/Documents/Tovu has 4 dirs, both unchanged. Nothing restored.

## Leftovers
- Wide zero-token run (mutate-targets.py) is still PAUSED at row 18. results.tsv and SURVIVORS.md are unchanged since 14:15. When tovu-46 resumes it, new SURVIVORS rows need judging.
- No test processes left running. Scratch: scratchpad/mutjudge-46b/ (logs only, no tree copies).
