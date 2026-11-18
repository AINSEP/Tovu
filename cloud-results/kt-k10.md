# kt-k10: forms tools seam (K-10a S1-S2) and move to `@jini-ai/cms/forms` (K-10b S2b-S4)

Run 2026-11-18, branch `wave3/kt-k09-k10` in both repos (fast-forward only; based on the K-09 / K-10a S0-S1 tip). Status: **K-10a DONE (S0, S1 earlier; S2 this run). K-10b DONE (S2b-J, S2b-T, S3, S4).** No force-push, no `--no-verify` (the pre-push hook skipped: no desktop change), no subagents, nothing left running.

## Commits (all pushed to `origin/wave3/kt-k09-k10`)

| Repo | SHA | Step |
|---|---|---|
| Tovu | `1e085fe1` | K-10a S2: `tool-handlers.types.ts` (`FormsPackageToolDeps`: `formWrites`, `slugPolicy`, `deriveDuplicateName`, structural pull and delivery-status ports); `buildFormsToolRegistrations({ deps }, optional = {})`; host `buildFormsRegistrations(routeDeps)` = one `withToolMetadata` call, route deps read through getters; `duplicateFormDefinition({ deps, input })` |
| Jini | `ca673412` | K-10b S2b-J: `packages/cms/src/forms/delivery-status-limits.ts` + index line + vitest + changeset `cms-forms-delivery-status-limits.md` (minor) |
| Tovu | `bd7283e7` | K-10b S2b-T: `DELIVERY_STATUS_MAX_LIMIT` declaration, `contracts/headless` re-export and both forms re-exports deleted; repo, catalog, handler import it from `@jini-ai/cms/forms` |
| Jini | `97162fcc` | K-10b S3: `cms/src/forms/{agent-tools,tool-registrations,tool-handlers.definitions,tool-handlers.submissions,tool-handlers.types,duplicate-form}.ts`, index exports, 9 vitest cases, changeset `cms-forms-agent-tools.md` (minor) |
| Tovu | `78581b33` | K-10b S4: binding imports from `@jini-ai/cms/forms`; 5 Tovu files deleted; 4 test importers repointed. Green against Jini `97162fcc` |

## Gates

BASE-RED baseline = the K-10a S1 tip (recorded before S2): both tsc exit 0; `check:size` exit 0 (199 violations / 190 debt entries); `check:complexity` exit 0; `check:architecture` **exit 1** (the existing 3 regressed metrics, saved); `check:errors | rg "^(New|Worse):"` prints nothing; `check:why-comments` exit 1 with its 8-line base output. Jini cms: typecheck 0, 341 files / 4134 tests, `pnpm guard` ok.

After S2, S2b-T and S4 (Tovu): `npx tsc -p tsconfig.json --noEmit` exit 0 and `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit` exit 0; eslint 0 errors on touched files (only pre-existing `sonarjs/no-nested-incdec` warnings in S0 test / existing tests); S-FN50 prints nothing; `check:size` exit 0 (199 / 190, unchanged); `check:complexity` exit 0; `check:architecture` identical to base by digit-stripped diff (no new line); `check:errors` no `New:`/`Worse:`; `check:why-comments` output identical to base; S-FORWARD, S-SUPPRESS, S-MOCK, S-SCHEMA, S-DELETE print nothing.
Tests (single-file runner, concurrency 2): 72 forms/assistant/importer files after S2; plus the 8 delivery/composition files after S2b-T and S4 (`/tmp` lists). Only failures, all on the base: `domain-no-direct-tool-registration.boundary.test.ts`; `postgres: ...` (no local Postgres socket); **four `L244 authoring: absent or ignored patch preserves the definition` cases in `server/inbound/admin-http/routes/forms/__tests__/l244-characterization.unit.test.ts` (version 2 vs 1)**, shown to fail identically on the unmodified K-10a S1 tree by restoring the four files with `git show HEAD:` and re-running (then restored: `git diff` equals the saved patch). Not caused by this lane; the previous report did not list it because its file set did not include that route test.
Jini after S2b-J and S3: build, typecheck 0, `npm --prefix packages/cms run test` 342 files / 4135 tests, then 343 / 4144 (+9 vitest), `pnpm guard` ok (first S3 run: HW3-module-state on `formsDerivedRisk` typed `DerivedRiskByToolId`; typed `ReadonlyMap<string, AgentToolSideEffect>` as K-09 did). S-IMPORT, S-BARREL, S-TEXT, S-RUNTIME, S-ARGS, S-SUPPRESS, S-FN50 (Jini form), S-SIZE all print nothing.

V3: S2b: `DELIVERY_STATUS_MAX_LIMIT = 49` in the Jini leaf, cms rebuilt -> K-10a S0 `(b)` RED (`forms_delivery_status ... maximum: 49 / expected 50`); restored with `git show HEAD:<path>`, rebuilt, S0 green. K-10a/K-09 mutations were shown in the earlier report.

## Differences from the sheets

1. **S2b census is not empty**: it hits `features/forms/__tests__/tool-contract.characterization.test.ts:21,256,258`, the K-10a S0 test (written after the sidecars). It imports `DELIVERY_STATUS_MAX_LIMIT` from `../agent-tools.js`; S2b-T repointed that one import to `@jini-ai/cms/forms` (rule 7a, specifier only, merged into its existing import). No other hit. Proceeded rather than STOP because the hit is exactly the 7a class and the sheet had no way to list it.
2. **S0 `(k)` is not RED under the `= 49` mutation**: the test uses the imported constant (`MAX + 1`), so it follows the value; `(b)` (golden) is RED and the Jini `delivery-status-limits.test.ts` pins `toBe(50)`.
3. **Jini `exactOptionalPropertyTypes`** forced three byte-neutral changes in the Jini copy only: `formsDeps` spreads `formCollectionProviders` only when set; `forms_list_submissions` passes `{ cursor }` only when defined; `FormsWriteOps.create` input has `notify?: NotifyConfig | undefined`. Behaviour identical (absent vs `undefined`).
4. S2 added `tool-handlers.types.ts` (K-10a sheet named no file for the ports) and the S3 Jini copy is 6 files, all < 250 lines. Names are prefixed `FormsTool...` for the structural ports so they cannot clash with the package's existing `FormDeliveryStatus*`.
5. Host-path words in moved comments were reworded neutral (S-TEXT clean); `duplicate-form.ts`'s `../content-duplication` comment mentions were reworded in S2 so the K-10b precondition grep is empty.
6. Tovu tests were not copied to Jini (they need the host `executeCommand`/outbox); 9 new vitest cases over port fakes cover wiring, refusal of all nine tools, view shape, write delegation, input refusals, submissions, delivery status, pull and duplicate.

## Overlaps with other live runs

- `development/scripts/size-debt.json`: untouched this run (K-10a S1 already deleted `buildFormsRegistrations#1`).
- Test importers edited (one import line each): `assistant/__tests__/tool-registrations.contracts.test.ts`, `tool-registrations.forms.test.ts`, `features/forms/__tests__/agent-tools.unit.test.ts`, `common-fields.test.ts`, and the K-10a S0 test. `contracts/headless/index.ts` and `form-delivery-status.ts` (one line / two lines removed), `platform/db/repos/form-delivery-repo.ts` (import), `features/forms/index.ts` (one re-export line).
- Jini `packages/cms/src/forms/index.ts` and `.changeset/` (two new changesets). `api-baseline/jini-ai__cms.json` NOT regenerated (coordinator's step).

## Left

- Coordinated Jini publish and the Tovu `package.json` range bump for `@jini-ai/cms` (not a sheet step); Tovu is green only against the linked Jini `97162fcc`.
- Docs only: comments in other features still say `forms/agent-tools.ts` (newsletter, comments, members, post, plugin-runtime, `assistant/__tests__` headers); `development/assistant-prompts/capability-prompts.md` webhook lines from the K-09 report.
- `check:why-comments` base count (K-01/K-02/K-09 moved-to-Jini comments) still needs a debt reason or Jini-tree awareness.
- The four `L244` route-test failures on the base need an owner (not this lane).

## Next step

Merge Jini `wave3/kt-k09-k10` (`97162fcc`) before or with Tovu `wave3/kt-k09-k10` (`78581b33` plus this report), then publish `@jini-ai/cms` and bump the Tovu range.
