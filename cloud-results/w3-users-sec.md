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

## Batches (coordinator reviewed each diff, committed per batch, rebuilt the touched Jini packages, ran affected tests, pushed)
All workers were Opus high (`opus-high`); the plain verbatim slices were small enough that splitting them off to Sonnet would not have saved a batch. Workers never committed. Mutations: each planted, shown red, restored byte-identical (cmp/sha), green.

| batch | model | files moved (Tovu → Jini) | importers | tests (before → after; mutation) | status |
|---|---|---|---|---|---|
| A auth (FIX 3/4 + **U-AUTH-T1**) | Opus | — (dev-auth.ts 877 → 710 lines: login, MFA login, logout, boot-session, local-boot-session, `/auth/me`, password-status now mount the Jini K1 specs; OD-1 route-table pin = only the 14 `[forwardRejection]`→`[<anonymous>]` lines; OD-2 host `onError` → `res.req.next`) | dev-auth + 2 harness files | J admin-http 45→50, react/auth 75→76; T dev-auth/MFA/pin 39→47 (+7 OD-2 pins green on the old code first); M: drop `res.req.next` → 4 red | DONE |
| B root-key (FIX 1/3 + **SEC-6, SEC-7**) | Opus | — (Jini parity) | — | J security 299→353 (with C); M-A detail kept → 1 red, M-B stale reveal reply → 4 red, M-C start-fresh phrase → 3 red | DONE |
| C credentials (**SEC-8**, SEC-9 partial) | Opus | — (publish wire types → core `contracts/site/api-security-api-types.ts`, shared with Deployment) | — | +17 tests red-first; M8 → 1 red, M9 → 2 red | DONE |
| D users/roles (**rv1123f FIX 1–5**, roles i18n+rules) | Opus | `roles/roles-i18n.ts` (split → `roles/i18n/*`, all < 500), `roles/rules.ts`; 2 duplicate Jini DTO leaves deleted | 22 T files | J roles 4→162; T roles/auth/users 773→774; 3 mutations (`replace:false` → 2 red, …) | DONE |
| E roles screen (A-K2-roles-1/2) | Opus | `hooks/*` (6), `Roles.tsx`, `RolesSection`, `PoliciesSection`, `PolicyRow`, `PolicyPermissionForm`, `RoleConfirmDialogs` | 3 + Tovu binding `index.tsx`, `use-wired-roles` | J roles 162→168; T 266/266; M `if (error)` negated → 3 red | DONE |
| F shared keys (**SEC-12**, SEC-9 leftovers) | Opus | — | — | +18 tests red-first; M result rows → 1 red | DONE |
| G stores/refresh (**SEC-13**, SEC-14 partial) | Opus | — | — | +21; M1/M2/M3 → 1/1/2 red | DONE |
| H identity (X-identity-1/2) | Opus | `api-key-types`, `user-purge-types`, `username-change-ports`, `owner-reset-env`, `repo.memory`, `api-key-secret` (prefix via `createApiKeySecret({ prefix })`, K3), `api-key-service` + 4 tests | 30 T files | J 25→117; T 307/307; p3-p4 key-format pin red→green; M1 prefix slice → red | DONE |
| I users screen (A-K2-users-1 part) | Opus | `users-controller.hooks` → `use-localized-users.hooks`, `UsersPanel.hooks`, `UsersPanel.tsx`, password-reset notice | 10 | J users 203→207; T 513/513; M navigate path → 1 red | DONE (dictionary → N) |
| J auth screens (A-K2-auth-1) | Opus | `Login.tsx`, `use-login.hooks.ts`, `OwnerRecoverySignIn(.hooks)` | 4 + binding `index.tsx`/`auth-host-binding.tsx` | J 6→9; T 66/66; M product heading → 1 red | DONE |
| K forms (**SEC-10, SEC-11**) | Opus | — (`ChipField` is a required Security-owned slot instead of a missing kit name) | — | 392→421; M10 → 10 red, M11 → 1 red | DONE |
| L identity-2 + owner clients | Opus | `delete-user-service` (module lock → `createTrashUserService`), `owner-mfa-api`, `owner-passkey-api`, `owner-recovery-api`, `local-owner-signin` (factories) | 32 | J +8; T 315/315; M serialization → 1 red, M 401→403 → 1 red | DONE |
| M authentication screen (A-K2-authentication-1) | Opus | `Authentication.tsx`, `Authentication.hooks.ts`, `authentication-i18n.ts` (64 product hits → `{product}`), `model/provider-schemas` types | binding `index.tsx` | J 0→17; T 61/61; M-A vars → 10 red | DONE |
| N users dictionary | Opus | `users-i18n.ts` (1,552 lines → `admin/users/users-i18n.ts` + 4 part files) | 3 | J 0→25; T 421/421 | DONE |
| O security cutover (**SEC-T0**, SEC-T1a part) | Opus | 2 relocated to `integrations/jini-admin/` (`security-i18n`, `security-visuals`) | 15 | T +16 (red-first), 1180/1180 security+deployment; M alias/grantsReady → 1 red each | PARTIAL (mount switch waits on OD-4 iii) |
| P SEC-14 finish + site-key | Opus | `site-key-permission.ts` (`siteKeyName` injected, K3) + 9 tests | 5 | J security 421→432, UM 132→142; 3 mutations | DONE |
| Q identity repos | Opus | none (blocked, see below) | — | — | SKIPPED |
| R review (read-only) + S1/S2 fixes | Opus | — | — | guard back to base; clipboard required (M ambient → red); boot-session store host-bound (M two stores → 7 red) | DONE |


## Skipped / held (exact reason)
| item | reason |
|---|---|
| SEC-T1a mount switch, SEC-T1b, SEC-T1c (delete the 37 remaining Tovu security sources) | **OD-4 (i)–(iv) unanswered** in `P9-SEC-owner-decisions.md`; the lazy-route fixture row for `/access-tokens` is OD-4 (iii). Host composition (`security-ports.ts`, `security-module.hooks.ts`) is built and tested; switching is two lines (`panel-pages.ts:54` + the lazy-loading fixture row). The assertion ledger (`cloud-results/w3-users-sec-raw/P9-SEC-T1-ledger.md`) has every title UNMAPPED, so deletion is blocked by design. Recommendation: approve OD-4 (iii) as the module swap. |
| SEC-T0 sidekick wire capture | no running app in this container |
| K5-identity-1 Kysely repos (`repo`, `repo.assignments`, `repo.authorization`, `mfa.repo`, `passkeys.repo`, `recovery-codes.repo`, `user-purge`) | **new owner decision**: Kysely's DB generic is invariant, so the host `KyselyKernel<ContentDatabase>` cannot satisfy a structural `IdentityDatabase` slice without a cast. Recommendation (a): generic Jini factories that narrow inside, as cms `sqlWidgetRegionBindingRepo<DB>` / commerce `sqlPaymentsLedger<DB>` already do, plus `kysely` as an optional peer + dev dependency. |
| `repo.authentication.ts` | needs `keepStoredRevocation` (host `platform/db`, shared with members) moved to a Jini owner first; positional `kernel` constructor |
| `permission-list-tool.ts` | guard R5 (host tool name `content_read` in a module-level catalog) + HW3 (module-level catalog/Map); needs a `buildCatalog({ lookupToolName })` args object (new owner decision) |
| `default-credential-exposure.ts` | host CI scan with Tovu repo layout and console reporting; recommend reclassifying as permanent host tooling |
| `api/roles-api.ts`, `api/users-api.ts`, `api/auth-api.ts`, `login-dependencies.hooks.ts`, `roles-dependencies.hooks.ts` | module singletons on Tovu `lib/admin-http/request.ts` + `WORKSPACE_ID` shared with Library/Media/Trash — they are the host bindings (A-K2-shell-lib-4 not landed) |
| RT-K1-adm-users-1–9, api-keys-1/2, owner-mfa/passkey/recovery route sheets | route registrations are converted by lane w3-rtfnd (do not edit); K4-seam-5/14 record types still a prerequisite |
| Tovu Roles/Users big suites (`Roles.unit`, `use-roles.unit`, users tests) | kept in Tovu as binding tests: they drive the real host HTTP client and the `@jini-ai/user-management/react/testing` fake, which `@jini-ai/admin` does not depend on; Jini characterization suites added instead |
| SEC-3 renames → `plans/P9-BREAKS.md` | plan branch not pushable from this lane: `useRecoveryKit` → `useOwnerRecoveryKit`, `createRecoveryKitDownload` → `createOwnerRecoveryKitDownload`; also breaking: `security()` now takes `{ ui, ChipField, clipboard }`, `registerSiteKeyPermissionGrants` requires `siteKeyName`, `boot-session-token` exports only `createBootSessionTokenStore` |

**Known follow-ups / risks:** Tovu CSS: moved roles/login/authentication markup now renders `jini-*` classes; matching selectors were ADDED next to the old ones (`styles.css`, new `features/authentication/authentication.css`), but deeper roles list-table rules (`list-table-detail`, row-action resets, an `@media` block) and `.page`-scoped rules still only match old names — not browser-checked here. Tovu `no-vendor-in-core.boundary.test.ts` (base-red) row `vendor-exceptions.json:34` is now partly stale. Stale path comments naming moved files remain in a few Tovu files (listed by workers P/I). Jini comment-only host paths remain in core `api-security-api-types.ts` (not flagged by guard).


## FILES LEFT (`plans/P9-data/tools/{scan,plan}.mjs` from `origin/plan/whats-left-1122`; combine-15 method: moving + shells)
| tree | moving | shells | FILES LEFT | excl. themes | lane areas (adm-roles / adm-users / identity / adm-security / adm-other) |
|---|---|---|---|---|---|
| base merge-15 `bd89a2aa8` | 2,269 | 0 | **2,269** | **2,158** | 19 / 8 / 28 / 39 / 380 |
| tip (this branch) | 2,227 | 0 | **2,227** | **2,116** | 5 / 4 / 17 / 37 / 373 |
| delta | −42 | 0 | **−42** | **−42** | the identity count includes the three new host binding files |

68 Tovu files under `apps/` were deleted (sources + moved tests, 9,676 lines); the theme areas are unchanged (111).


__GATES__
