__FIRSTLINE__

# w3-users-sec — Users, Roles, Authentication + Security parity (wave 3, 2026-11-23/24)

Unattended cloud run, Opus high coordinator. Branches: Tovu `codex/w3-users-sec-tovu`, Jini `codex/w3-users-sec-jini` (plain `git push`, `git fetch` + behind=0 check before every push; no force-push, no `--no-verify`, no tags/publish; `main`/`integ/*`/`plan/*`/`release/*` untouched; no codebase-memory tools).

**Programmer skills confirmed:** `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) was read before any work. Its RED-first, named-mutation, function-quality and pre-completion rules were put in every worker brief (`COMMON-RULES.md`, copied below in spirit as the self-check), and every behaviour-bearing slice reports a red-first run and a named mutation (restored byte-identical with `cmp`/sha).

## Setup
- **Bases:** Jini `origin/integ/merge-15-2026-11-23` `0a44b54ca` → later head `60c6cd52a` (merged again mid-run); Tovu `bd89a2aa8` → `33701312a` (merged again mid-run, picks up the `mail-engine-adoption` gate fix).
- **Prior lane branches merged on top:** `origin/codex/ex6-users-jini` `5db75a539` and `origin/codex/ex6-users-tovu` `4a8b0f200`. Conflicts: Jini `packages/admin/package.json` + `api-baseline/jini-ai__admin.json` (union, semantic JSON 3-way by key); Tovu `development/why-comments-debt.json` (union by id; its merge-base copy is not valid JSON, so the union was taken over ours+theirs) and one import hunk in `durable-run-subscription.unit.test.ts` (kept merge-15's `AgentEvent` import).
- **Held security branch:** `origin/codex/ex4-security-jini` (held at combine-15 for rv1123c FIX 3/4) carries U-AUTH-1..3 and SEC-3, which U-AUTH-T1 needs. Its admin/security half duplicated SEC-1/2/5 already merged from `sec5-jini` (17 conflicts), so only its `packages/user-management` half + changesets were brought over as a 3-way patch from the merge-base (Jini `a106a2d0e`); FIX 3/4 were then applied in this branch.
- Tools: Node 24.22.3, pnpm 10.33.2. Jini `pnpm install --frozen-lockfile` 0, `pnpm --no-bail -r build` 0 (0 `error TS`). Tovu `npm ci --ignore-scripts` root/admin/desktop/site-chat 0/0/0/0; `link-jini.mjs` 0 (linked to this run's Jini). PostgreSQL not provisioned (PG-backed node tests are base-red).
- **Base gates** ran on clean worktrees of merge-15 (Jini own install/build; Tovu `node_modules` overlay whose `@jini-ai/*` links point at the base Jini worktree).
- The container restarted once (~23:47 UTC); both trees were clean at the pushed tips, the three in-flight workers were re-dispatched.

## FIX items applied (reviews `rv1123*` on `origin/plan/whats-left-1122`)
| review / item | status | where |
|---|---|---|
| rv1123f FIX 1 (duplicate `AdminUser`/`AdminRole`/`AdminPolicy`/`AdminPolicyPermission` leaves) | applied: both Jini leaves + export rows deleted; consumers use `@jini-ai/core/contracts/site/user-management-react`; OQ-10 rationale on the core owner | J `6be4c1b12`, T `e2ec14b3b` |
| rv1123f FIX 2 (`resolveRolesTabs(t)` positional + owned navigation) | applied: `resolveRolesTabs({ t }, _optional)`; navigation host-bound (`goToRolesTab`, `replace: true`); test-first + 3 mutations | J `6be4c1b12`, T `e2ec14b3b` |
| rv1123f FIX 3 (`boot-session-token` entry `universal`) | applied: `node`; `package-entries` + rename pin updated (red → green) | J `6be4c1b12` |
| rv1123f FIX 4/5 (Tovu consumers of the duplicates; `Roles.tsx` `{ t }` + nav) | applied: 22 Tovu files repointed | T `e2ec14b3b` |
| rv1123c FIX 1 (Security 1–4 rv-d) | user-management half verified present (4660d1df, a580ea79 are ancestors); admin half: refusal `detail` no longer reaches snapshot/notice (60bccdaa ported test-first, mutation A); recovery gate status-only confirmed; `previewRequired` kept because SEC-7 now gives it an effect | J `02ef77840`, `6abadc98f` |
| rv1123c FIX 2 (SEC-4 fixes from `sec4-jini`) | already in base via `sec4-jini` (combine-15) | — |
| rv1123c FIX 3 (required hooks) | applied: `RecoveryCodesCard` + wrappers take every hook as required input; `SecurityPage`/`RootKeyTab`/`AccessTokensTab`/`CredentialEditor` hooks required, bound in `react/bindings.ts`. SEC-3 renames for the breaks ledger: `useRecoveryKit` → `useOwnerRecoveryKit`, `createRecoveryKitDownload` → `createOwnerRecoveryKitDownload` (plan branch not writable from this lane: **fold into `plans/P9-BREAKS.md`**) | J `02ef77840`, `6abadc98f`, `86987a482` |
| rv1123c FIX 4 (K1 per-route context) | applied: `CurrentPrincipalAuth`, `LogoutAuth`, `SignInAuth`, `BootAnswerAuth`, `BootSessionAuth`, `LocalBootSessionAuth` (`Pick` views of `AuthRequest`); type mutation (widen logout back) → 2 tsc errors | J `02ef77840` |
| `check:hooks` vs owner rule | the Jini checker only accepted `= useX` defaulted props, which the owner rule/FIX 3 forbid; it now also accepts a REQUIRED destructured hook prop (test added red → green); hook-injection debt shrank 2 → locked | J `38277f108` |

__BATCHES__

__SKIPPED__

__FILESLEFT__

__GATES__
