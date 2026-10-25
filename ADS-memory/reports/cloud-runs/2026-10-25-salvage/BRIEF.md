<<SUBAGENT_DISPATCH>>
# Salvage the leftover UNIQUE cloud/* branches — merge what's still needed (owner 2026-10-25: "Have they been merged into main? Do they still need to be? If so, let's merge them.")
Unattended: verify by measuring, never ask. Source of truth for the list: `ADS-memory/.local-artifacts/handoffs/2026-10-24-cloud-branch-audit-report.md` is LOCAL-only, so use this list (from it):
- **Tovu CODE (13):** `cloud/build-email-dns-2026-10-21-wip-snapshot`, `cloud/tw1-features`, `cloud/tw1-features-FIX1`, `-L003`, `-L011`, `-L033`, `-L064`, `-L068`, `-L086`, `-L095`, `-L112`, `-L115` (complexity refactors + 100% coverage tests from 10-20/21; tw1-features is the merge of the L-lots).
- **Jini CODE (7):** `cloud/jini-release-2026-10-22b`, `cloud/jini-release-b-results` (⊃ 22b; ~17 unreleased email-sender contract files + commerce C-1 refund-replay fix + mcp federated-confirmation fix), `cloud/jsec2-wip` (UNVERIFIED Codex security fixes from Jini W1 review), `cloud/refactor-C2`..`C5` (ui/daemon/agent-runtime complexity refactors).
- **REPORT-ONLY (Tovu 24, Jini 3):** every other `cloud/*` branch whose only unique content is `.cloud-coord/**` reports. List them with `git ls-remote` + `git log origin/main..<branch> --name-only`.
DO NOT touch branches created 2026-10-24/25 (cloud/check-1024-*, cloud/overnight-1024-*, cloud/stryker-1025-*, cloud/observability-1025-*, cloud/ai-tracing-1025-*, cloud/guard-zero-1025-*, cloud/salvage-1025-*).

## Per CODE branch decide: MERGE / PARTIAL / SUPERSEDED
Compare each branch's changes with the CURRENT code (`origin/cloud/overnight-1024-tovu` for Tovu = main + all of 10-24's integration; `origin/cloud/overnight-1024-jini` for Jini). Main has rewritten many of these areas since 10-20 and carries 4 deliberate `Revert "..."` commits (vendor-to-plugins, deploy 10-22) — never reintroduce reverted work or vendor code into core. SUPERSEDED = the same function was already refactored/fixed/tested differently. MERGE/PARTIAL = cherry-pick or re-apply the still-valuable parts onto the current code (complexity refactors only if the file still exceeds CCN 10; coverage tests only if they still pass against current behaviour and add coverage; real fixes always — commerce C-1, mcp federated confirmation, email-sender contract if not already in main; jsec2 security fixes ONLY after you review each one, since they were never verified).
Branches: Tovu `cloud/salvage-1025-tovu` from `origin/cloud/overnight-1024-tovu`; Jini `cloud/salvage-1025-jini` from `origin/cloud/overnight-1024-jini`. One commit per salvaged branch (`salvage(<branch>): …`), changesets for Jini packages.
Verify each salvage: touched + existing tests of touched files, `tsc --noEmit -p` per touched package / Tovu root tsconfig, `pnpm guard` (Jini) not worse, CCN ≤ 10.

## REPORT-ONLY branches
Copy each branch's `.cloud-coord/**` files into `ADS-memory/reports/cloud-archive/<branch-name>/` on `cloud/salvage-1025-tovu` (Jini ones too, under `jini-<branch>`), one commit. Do NOT delete any branch — list the ones that are now safe to delete for the owner.

## Setup
`hostname && nproc`. Node 24 + Tovu setup per `git show origin/cloud/overnight-1024-tovu:ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md`. Jini: `git clone https://github.com/AINSEP/Jini.git /root/Jini`.

## HARD CAPS (first hit → stop, report, push, END)
3 h wall (at 2 h 40 m write up). ~1.5M tokens. No subagents. Never push main, never force-push, never delete branches, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Push only to `cloud/salvage-1025-tovu` / `cloud/salvage-1025-jini`. Commit + push after each branch.

## Report
`ADS-memory/reports/cloud-runs/2026-10-25-salvage/REPORT.md` on `cloud/salvage-1025-tovu`: table per branch (verdict, what was salvaged, commit, tests), report-only archive list, branches now safe to delete, anything not reached. End "SALVAGE DONE <UTC>", wall, rough tokens.
