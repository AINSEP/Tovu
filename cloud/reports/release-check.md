# RELEASE-CHECK — cloud/combine (Tovu f4b2d1531, Jini 60807a9ca)

Status: IN PROGRESS (started 2026-11-09 ~05:35 UTC). This file is replaced by the final report.

## Setup (done)
- Node v24.22.2 (nodejs.org tarball), pnpm 10.33.2 via corepack.
- Jini: `pnpm install` ok, `pnpm --no-bail -r build` exit 0 (170 s incl. install).
- Tovu: `npm ci` ok at root, apps/admin, apps/site-chat, apps/desktop; `@tovu/sdk` built; `npm run link:jini` → 79 links to /home/user/Jini/packages.
- Canary: Jini `protocol/api-convention.test.ts` 3/3 pass; Tovu `plugin-tier2/typescript-bootstrap.unit.test.ts` 1/1 pass.
