Programmer(Direct): Wrote [cloud-rerun-3.sh](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-05-day/cloud-rerun-3.sh) and preserved both clones’ existing edits. **No tests ran.**

Fixed publish-card replacement wiring in [store.ts:490](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/features/deployments/publish-credentials/store.ts:490): submitted cards now select the trusted writer, which rechecks the grant at commit. Added regressions for revocation during sealing and local media replacement followed by overwrite on live. Updated attachment/durable-binding fixtures for server-owned discovery.

**Still open:** both release land gates, two Security navigation failures, and cloud PostgreSQL setup. Federation-runtime-wiring is included in the rerun; its current pass/fail status is unverified.

Jini `core`/`chat` typechecks, both diff checks, and Bash syntax passed. Static validation found all 13 failed sections and resolved 203 test paths/patterns.

`DONE` = addressed by preserved edits; `FIXED` = changed this turn. Neither means tests passed.

| Section | Reported failure | Status |
|---|---|---|
| jini-core | URL secret quote boundary | DONE |
| jini-http-kit | Stderr redaction expectation | DONE |
| O-jini-cf-forms | Salted rate-window key | DONE |
| Bforms-jini-cf | Salted rate-window key | DONE |
| tovu-website | Exact callback allowlist | DONE |
| tovu-website | Search metadata baseline | DONE |
| tovu-website | Callback refusal baseline | DONE |
| tovu-website | Publish-card save/reopen | FIXED |
| tovu-website | Import refusal stage prefix | DONE |
| tovu-website | Import recovery guidance | DONE |
| tovu-website | Share-error ID correlation | DONE |
| tovu-admin | Failure card: duplicate status | DONE |
| tovu-admin | History failure: duplicate status | DONE |
| tovu-admin | Empty-event failure projection | DONE |
| tovu-admin | Access Tokens navigation | LEFT |
| tovu-admin | Site-key navigation | LEFT |
| O-tovu-website-keys | Publish-card save/reopen | FIXED |
| O-tovu-website-keys | Hidden duplicate-label mapping | FIXED |
| O-tovu-website-keys | Site-owned deployment save | DONE |
| O-tovu-website-keys | Saved-key round trip: inSite | DONE |
| O-tovu-website-keys | Saved-key round trip: appData | DONE |
| O-tovu-website-keys | Site-owned source-control save | DONE |
| O-desktop-ipc | Channel count/trust checks | DONE |
| O-desktop-ipc | Preload channel order | DONE |
| Q-tovu-website-media | Ordinary-upload hash | DONE |
| Q-tovu-website-media | Concurrent restoration fixture | DONE |
| Q-tovu-website-media | Private-media refusal fixture | DONE |
| Q-tovu-website-media | Confirmation version/code | DONE |
| Q-tovu-website-media | Confirmation source/code | DONE |
| Q-desktop-renderer | Native sampler timing | DONE |
| Bforms-website | Missing PostgreSQL socket | LEFT |
| tsc-root | Site-sealer arguments | DONE |
| tsc-root | Undefined taxonomyDb | DONE |
| tsc-root | Missing clock.nowMs | DONE |
| tsc-root | VaultRecord inventory typing | DONE |
| tsc-desktop-main | Missing delete action payload | DONE |
| B14-2 land gate | Unreleased CMS exports | LEFT |
| B13-3 land gate | Unreleased lifecycle export | LEFT |

Both land gates still consume 0.6.19 artifacts lacking the required exports. Publishing and real dependency/lockfile updates remain necessary; no version or integrity metadata was fabricated.

The [full handoff](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-05-day/F-cloud-verify-2-result.txt) includes root causes with file:line, all eight files edited this turn, test changes, I/O costs, and remaining work. [Every exact deferred test command](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-05-day/F-test-commands.txt) is recorded separately.

After copying the script to the disposable cloud runner:

```bash
CI=true TOVU_REPO=/home/user/Tovu JINI_REPO=/home/user/Jini \
  bash ./cloud-rerun-3.sh
```