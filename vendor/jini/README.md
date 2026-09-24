# Vendored Jini tarballs (desktop release CI only)

Tovu uses Jini APIs that are committed in Jini but not yet published to npm (for example
`probeAgentModels` in agent-runtime, `isValidMediaSlugFormat` and `unassignTerms` in cms, and the
Interactive editor fixes in ui). `.github/workflows/desktop-release.yml` installs these tarballs
over the registry versions right after each `npm ci` that needs them (repo root and `apps/admin`),
with `npm install --no-save`, so the lockfiles are not touched. Local dev is unaffected: it uses
`npm run link:jini` symlinks into the Jini checkout.

Built from Jini `general-work` at `47a0b660043b5efe2fd073a546059351d092c9c2` (a `git archive`
export, so no uncommitted Jini work is inside), with `pnpm --filter <pkg>... run build` then
`pnpm pack`. Versions are unchanged from the published ones they replace (agent-runtime 0.3.6,
cms 0.3.6, ui 0.3.9) so every other package's exact `@jini-ai/*` pin still resolves to them. Their
own `@jini-ai/*` dependencies match the published predecessors: agentic 0.3.6, core 0.3.1,
platform 0.3.0, protocol 0.3.0.

| file | sha256 |
|---|---|
| jini-ai-agent-runtime-0.3.6.tgz | e4b06655cdb01c13fa88581be1183661d36f83b3e6aaa4ceadd82513dab986b4 |
| jini-ai-cms-0.3.6.tgz | 76bff95599aceae4fb03c954b356233e89a426c5a0276a6417feca18cae42c65 |
| jini-ai-ui-0.3.9.tgz | 208c005c53ba4a554a8994c1d47632862f77ae4e63371d7eba1f5df1a67c1668 |

Delete this directory and the workflow's "vendored Jini" lines once these APIs are published to
npm and Tovu's pins are bumped to those versions.
