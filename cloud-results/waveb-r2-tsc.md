# Wave-B r2 — tsconfig.tests.json + admin vitest (2026-11-16)

Branch `fix/wave-b-r2-tsc` (Tovu), based on `integ/wave-b-fixed` (b28d38c6), Jini at `integ/wave-b-fixed` 1fd7c076 (built; daemon still fails its own build, known).

## Before -> after
| gate | before | after |
|---|---|---|
| `tsc -p tsconfig.tests.json` | 142 | **0** |
| `tsc -p tsconfig.json` (root) | 1 | **0** |
| apps/admin vitest | 8 failed / 12 files (merge-recheck) | **0 failed tests; 14470 pass, 2 skipped; 1 file fails to load (recharts pin, below)** |
| website node:test on the 55 test files this run touched | n/a | 952/978 pass; 26 fail, none from call shapes (see "left") |

## Commits (all pushed to fix/wave-b-r2-tsc)
3f83807a, 7e98399a, f17cb81a, 364e30ef, 427218fb, 75691680, 66400c3e, acd6a48b, d5c05cda

## What changed
- Tests calling converted APIs positionally now use the object shape: handler `inspect/references/planRetire/referencesTo`, registry `.get({providerId})`, `moveToTrashOutcomeToError`, `AgentPluginUploadError({code,message})`, source-control `load({workspaceId})`, `ListPage.items`/`cursor`, `isInTrash({principalId})`, `sendMail({mail})`, commerce `warn({message})`, `connect({spec})`, `withSecurityMeta(.., {headers})`, `buildSiteProfile({deps,input}, options)` mock, in-memory repo `transaction({fn})`.
- Source registrars still positional while the converted test harness (`Register = ({app,deps}, optional?)`) expects objects -> converted to `({ app, deps }, _optional = {})` and callers updated: entries create/update/lifecycle, media delete, fs-files custom-root, 7 public member routes (sign-in, complete-sign-in, password-sign-in, forgot/reset/set-password, sign-out). Form-destination port `loadRegistry` now takes `{workspaceId}` (fixes the 1 root tsc error).
- Fixtures catching up with Jini contracts: webhook subscription + workspace records carry `version`; OTel fixture passes `helpers`; project-keys fakes implement `list` + `listChoices`; forms fixture supplies `removeFormSubmission`; origin-registry fake implements all methods; test helper `extractRouteHandler` accepts optional `next`.
- Admin: boot-readers expects `onMessagesChange({ messages })`; dock settings expect personal MCP + master ON by default (owner decision 2026-11-10 documented in `assistantCliPermissions`; the old test encoded the superseded 2026-10-23 rule); chat-fab z-order allowlists `.admin-failure-notice` (top-right, FAB is bottom-right); literal-copy baseline gets the 3rd `placeholder="https://"` in SiteImportTab (PRE-EXISTING: base has 3, baseline had 2); users delete asserts `{principalId}`; VisitorCredentialForm test supplies its own model id (Jini vendor presets intentionally ship `preferredModels: []`).
- Classification vs `refactor/terra`: chat-fab, literal-copy (same files on base) = PRE-EXISTING; the rest NEW from the Jini contract move. `use-trash` failure did not reproduce (passes alone and in the full run).
- No assertions weakened, no skips, no `@ts-ignore`, no new eslint-disable.

## Left, with reason
1. `apps/admin/.../recharts-bundle-integer-ticks.unit.test.ts` — Jini now ships `charts-recharts` 0.7.1; Tovu's reviewed pin (`RECHARTS_BROWSER_APPROVAL.version = 0.7.0` in `charts-recharts-source.ts`) needs an owner re-review of the new bundle hash. Not bumped.
2. website node:test (not call-shape): `webhook-delivery-worker(.shutdown).test.ts` x4 (Jini `describeErrorForLog` output format / timeout URL text changed), `L244 authoring ... absent or ignored patch` x4 (version bumps 1->2 on a no-op patch), `repo.postgres.test.ts` appendRevision (ENV postgres).
3. apps/desktop untouched (out of scope). Jini daemon build/guard/size gates untouched (Jini not edited).
