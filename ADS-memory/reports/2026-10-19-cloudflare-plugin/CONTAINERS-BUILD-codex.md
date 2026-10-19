Programmer(Execution) + DevOps(Execution): plugin implementation and deployment design.

Staged for review:

- [File inventory and 17 patches](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/cf-containers-staging/patches/README.md)
- [Research, design and open decisions](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/cf-containers-staging/cloudflare/NOTES.md)

Changes require an explicit Static/Full site choice, disclose static limitations, and replace domain-card JSON with readable per-hostname rows.

**Full-site deployment remains unavailable.** Preview explains the unresolved persistence for edited themes and the mutation journal, offers Fly, and never falls back to static.

Planned storage: hosted Postgres for content/chat, R2 through existing S3 support for media, and Workers Logs/export for runtime logs. Open decisions concern remaining filesystem persistence and deployment integration with Jini’s existing process runner.

Patch applicability, syntax and changed-code complexity checks passed. Tests and coverage remain unrun. No Docker, wrangler or tsc command ran; `apps/` and `content/` were untouched.
