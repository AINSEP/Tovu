# F6 — Tovu L7 (website security features) + L12 (website server): fix wave report

## Run log (append-only)
## 2026-10-25T21:34:49Z — STARTED
Tovu base origin/cloud/overnight-1024-tovu @ 61d219a5 → code branch cloud/fixwave-1025-F6. Jini: checking out origin/cloud/overnight-1024-jini at /home/user/Jini (Tovu links via file:../Jini). Setup (Node 24, installs, builds) running. Next: green baseline on L7/L12 suites, then L7 security guards + 3 owner-decision pins, then L12 top 10.
## 2026-10-25T21:43:13Z — PROGRESS
Setup green (Node 24.22, Jini cloud/overnight-1024-jini built, Tovu npm ci + link:jini). Code branch cloud/fixwave-1025-F6 at f4c902fa. Done so far: 3 owner-decision pins updated (exclusions password_hash allow + share-policy exclusion; wiring owner policy ['*','visitor-tools.manage']; mcp-ui allowlist members_delete + oidc/visitor exemptions); L7 negatives: destination-store authorize (refactor: exported authorizeDestinationVaultContext), permission-list-tool, user-manage-permission, boot-session-token, link-service ownership/proof/startedAt, ready-providers, link-policy null member, settings deny-lists, form-delivery secret regex table, LOCAL_HOST anchors, password-auth cutoff/race, challenge realm, email anchors. Next: oidc-login/providers validators, then L12 top 10.
