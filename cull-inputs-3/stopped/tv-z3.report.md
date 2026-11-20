Implemented D01, D03, D04, D05, and D06. AP-T is STOPPED.

All desktop paths below are under `apps/desktop/src/`; each reduction applies to `(path, catch-reads-error)` and awaits combine verification.

| Sheet | Files touched; expected reductions |
|---|---|
| D01 — done | `desktop-agent-inventory.ts` −1; `desktop-agent-service.ts` −1 |
| D03 — done | `external-site-stop.ts`, `move-to-applications.ts`, `product-telemetry-ipc.ts`: −1 each |
| D04 — done | `renderer/use-site-list-prefs.hooks.ts` −2 |
| D05 — done | `shared-sites.ts` −2; `site-config.ts` −1; `site-dir-store.ts` −2; `site-folders.ts` −1; `site-name.ts` −1; `tracked-sites.ts` −4 |
| D06 — done | `stage-payload-lib.ts`, `stage-payload-run.ts`, `verify-package-cli.ts`: −1 each |

**Expected desktop reduction: 21 findings.** Protected catches remain; lazy fallbacks and unlink failure propagation are preserved.

**AP-T STOP:** [vanilla-tool-confirmation.ts:17](SCR/c-tv-z3/apps/site-chat/src/vanilla-tool-confirmation.ts:17) already has a 67-line function and 64-line returned callback, exceeding the hard 50-line cap. Repair would require forbidden extraction or unrelated reformatting. No AP-T source/tests changed; its ledger reduction is 0.

[COMMIT-PLAN.md](SCR/c-tv-z3/COMMIT-PLAN.md) records all six sheets, oversized files, mutations owed, and AP-T’s pending tests/red reason and Chrome checks. [REFRESH.md](SCR/c-tv-z3/REFRESH.md) records the incidental admin test consumer; no repoint needed.

Diff re-read deletions: none. No tests, builds, installs, checks, commits, package/lock edits, or ledger updates performed.
