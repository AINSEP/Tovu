# Cloud-branch archive (salvage run 2026-10-25)

One folder per leftover `cloud/*` branch (Tovu) or `jini-<branch>` (Jini). Each holds the
`.cloud-coord/**` files that branch's **unique** commits touched (commits not reachable from
`origin/main` or any other `cloud/*` branch), copied at the branch tip with the `.cloud-coord/`
prefix stripped. Raw dumps over 1 MB were not copied — see `EXCLUDED.md`.

Verdicts, what was merged, and which branches are now safe to delete:
`ADS-memory/reports/cloud-runs/2026-10-25-salvage/REPORT.md`.
