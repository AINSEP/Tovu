# fix-coverage progress (2026-10-21, unattended)

Started 21:24Z. Worktrees: /home/user/wt/{J1,J2,J3,T1,T2,T3}; Jini integration build at /home/user/Jini for Tovu link:jini.

| branch | fixer | status |
|---|---|---|
| fix-cov-J1 | agent A | in progress |
| fix-cov-J2 + J3 | agent B | in progress |
| fix-cov-T1 | agent C | in progress |
| fix-cov-T2 | wave 2 | pending |
| fix-cov-T3 | wave 2 | pending |

Decision: Jini-ownership HIGH findings (16 merge-locale-overlays/index-aligned-translations, 18 parent-watchdog/dom-hook-harness, 20 key-only-site-meta timestamp helper) are LISTED, not moved: the Tovu cov branches have no paired Jini branch, so a move would make Tovu import unreleased Jini code.
