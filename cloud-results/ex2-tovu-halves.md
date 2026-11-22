DONE 781a613c88

All four Tovu halves landed on `codex/ex2-tovu-halves`, one commit per step plus one why-comments debt commit. Each step's named mutation was run, and all went RED. Every gate equals base except admin tsc, which goes red → green: base is red because Jini merge-14's `AdminKit` needs the host's `Icon`, `useT` and `values`, and step 4 supplies them. No new red test: every red file in the node set (182 files) and in admin full has the same failing test names at base. FILES-LEFT 2,486 → **2,485**; excluding the theme areas, 2,375 → **2,374**.

# ex2-tovu-halves (2026-11-22): `codex/ex2-tovu-halves`

Unattended cloud run, Opus high.
- **Base:** Tovu `origin/integ/merge-13-2026-11-22` `f7185f153` (READY content `0d7f78fa4` plus combine-13 report commits).
- **Jini:** `origin/integ/merge-14-2026-11-22` tip `4902a6a1` (READY content `190860f22`), checked out detached. Nothing changed or pushed in Jini; only `dist/` files were planted for mutations and restored.
- **Commits (all pushed):**
  - `71a1bcd725` step 1
  - `e86ecf24e2` step 2
  - `ee1cc47ff8` step 3
  - `f01e466a12` step 4
  - `781a613c88` why-comments rows for step 3
  - `86823a1dd0` + this report: records only
- **Not used / not touched:** subagents, codebase-memory tools, force-push, `--no-verify`, tags, publish. `main`, `integ/*`, `plan/*` and `release/*` were only fetched. One `git pull --rebase` (a no-op) was run before the step-2 push; every other push used `git pull --ff-only` and then a plain `git push`.

## Setup
- Read first:
  - Jini `cloud-results/combine-14-jini.md` ("Exported-API delta")
  - Tovu `cloud-results/combine-13-tovu.md` (Setup)
  - On `origin/plan/whats-left-1122` (`18f1b17c0`): sheets `K4-i18n-common`, `K4-seam-1`, `RT-K1-0`, `A-K2-0`, plus `P9K-fix-B1-B3.md` (CORRECTED; it wins), `P9K-fixcheck-B1-B3.md` and `reviews/ex2-{review-a,review-b,rereview}.md`.
- Tools: Node 24.22.3 (`/opt/node24`), npm 11.19.1, pnpm 10.33.2.
- **Jini:** `pnpm install --frozen-lockfile` 0; `pnpm --no-bail -r build` 0 (0 `error TS`).
- **Tovu:**
  - `npm ci --ignore-scripts` in root, admin and desktop: 0/0/0. site-chat's install finished, but its exit line was not captured.
  - `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`: 82 links changed.
  - `packages/contracts` tsc 0; `packages/sdk` build 0.
- **PostgreSQL 16:** role `la`; DBs `jini_chat_test_ex2` (`TOVU_CHAT_TEST_POSTGRES_URL`) and `commerce_test` (`COMMERCE_PG_URL`).
- **Base tree:** a `git worktree` at `f7185f153`, with its `node_modules` symlinked to the main tree's, so it runs with the same Jini merge-14 link. All gates and red re-runs at base ran there.
- **Test runner:** each file alone under a 15-min watchdog, 3 in parallel. Node files use `node --test` with the root `npm test` imports. Admin files use `npx vitest run`.
- **Mutations:** a mutation of Jini code went into the **linked Jini `dist/` file** Tovu imports, and a Tovu-side mutation into the Tovu file. Each was restored by byte copy and checked with `cmp`. Raw output: `ex2-tovu-halves-mutations.txt`.

## Step 1 — K4-i18n-common.T (`71a1bcd725`)
- **Files:**
  - `apps/admin/src/lib/i18n-common.ts`: 716 → 79 lines. It keeps only the product-named key `"is on an older Tovu and can't overwrite these yet. Update it, then publish again."` and its original translation in all 21 locales, in the original locale order (`es de it zh-CN zh-TW ar fa ru ja id pt-BR ko pl hu fr uk tr th hi ur bn`).
  - `COMMON_I18N = composeCommonDictionary({ generic: ADMIN_COMMON_I18N, host: HOST_COMMON_I18N })`. That is per locale `{ ...ADMIN_COMMON_I18N[locale], ...host[locale] }`: the host entry comes last and wins. The host decides the locale set and order, and a locale missing from the package throws at module load.
  - `composeCommonDictionary` is a small exported pure function with a `_optional = {}` pad, so precedence is testable. This is composition; nothing is re-exported. The file-header why-comment is kept and updated.
- **Importers:** current Tovu importers stay on `COMMON_I18N`, as the sheet says. No old specifier was removed, so there was nothing to repoint.
- **Tests:** `lib/__tests__/i18n-common.unit.test.ts` gains 5 cases:
  - the exact original 21-locale list and order
  - every package entry unchanged, plus exactly the one host key
  - the product-named notice is absent from the package and present in Tovu (Spanish text pinned); `es.Save === "Guardar"`
  - host-entry precedence on a collision
  - host locale order, and a throw for a locale the package lacks

  **One-time equivalence check, not committed:** the composed dictionary deep-equals the pre-split `COMMON_I18N` for all 21 locales and in the same locale order (vitest 1/1, with the old file copied beside it temporarily). The stay gates (`app-i18n`, `i18n-common`, `untranslated-copy`, `dictionary-lookup-sinks`, `version-conflict`) give 122 pass / 1 fail. The 1 fail is `dictionary-lookup-sinks` (`posts-i18n.ts EDITOR_FAILURE_DICT`), and it is **BASE-RED** (identical at `f7185f153`).
- **Mutation M1 (named):** delete Spanish `Save: "Guardar",` in Jini `admin/dist/core/i18n-common-base.js` → **RED**, `i18n-common.unit.test.ts` 3 failed / 20 passed (key parity, translator fallback, Spanish pin). `app-i18n.unit.test.ts` stays green under the mutation. The original K4 sheet named it, but the CORRECTED section names `i18n-common.unit.test.ts`'s key parity, which did go red.

## Step 2 — K4-seam-1.T, approval only (`e86ecf24e2`, plus the deletion in `71a1bcd725`; see Deviations)
- **Files:**
  - **Deleted** `contracts/core/tool-metadata/approval-policy.ts`. Its owner-policy docblock moved verbatim to `tool-metadata/index.ts`, beside `HostToolApprovalRule` (the six names) and `HostToolApprovalPolicy = ToolApprovalPolicy<HostToolApprovalRule>`.
  - The projection is now `projectToolMetadata<HostToolApprovalPolicy>`.
- **Importers repointed (69 files):**
  - All **60** catalog files import `ToolApprovalPolicy` from `@jini-ai/core/contracts/site/tool-metadata-approval-policy`. Catalog entries keep `} as const satisfies ToolMetadataById<ToolApprovalPolicy>`, so each declaration is checked against the core contract and the host specialization is enforced where the catalog is projected. The sheet's 60 names were the ones with single-quoted imports; `observability`, `site-guide` and `visitor-tools` use double quotes and were caught on the second pass.
  - `contracts/headless/assistant-tool-approval-policy.ts`: imports `HostToolApprovalPolicy as ToolApprovalPolicy` from `../core/tool-metadata/index.js`; the moved-type re-export is removed.
  - `contracts/headless/index.ts:14`: re-export removed.
  - `assistant/{tool-approval-policy,assistant-tool-approval-policy}.ts`: runtime imports kept. The type imports are split into the core `ToolApprovalClass` and the host `HostToolApprovalPolicy as ToolApprovalPolicy`. This is the evaluator boundary: `RULE_CLASSIFIERS` is still keyed by the six names.
  - `assistant/mcp-federation/{registrations.ts, __tests__/confirmation-policy.unit.test.ts}`: core `ToolApprovalClass`.
  - `assistant/__tests__/tool-approval-policy.tw3.test.ts`: host specialization.
- **Old-specifier sweep:** `git grep` for `tool-metadata/approval-policy` / `./approval-policy.js` = **0 hits**. The headless barrel no longer exports the two types; nothing else imported them from there.
- **Tests:**
  - TW3 gains one case: `// @ts-expect-error` on an unknown rule name assigned to `NonNullable<ToolApprovalPolicy['rule']>`, plus the six names. If the specialization ever widens back to `string`, `typecheck:tests` fails on the unused directive.
  - Stay suite, 9 files, **all green:** moved-tools golden ×3 1/0 each, `tool-approval-policy` 31/0, `tw3` 4/0, `tool-metadata-projections` 4/0, `confirmation-policy` 33/0, `headless/assistant-tool-approval-policy` 18/0, `headless/index.barrel` 1/0.
  - Root `tsc` 0; `typecheck:tests` 0.
- **Mutation M2 (named, type-level):** catalog `theme.ts` `rule: 'theme-activation'` → `'theme-activate'` → **RED**: root `tsc` TS2322 at `tool-metadata/index.ts(135,22)`, the projection boundary. Restored; `tsc` 0.
- **Not in this step (B6):** the `AssistantSurfaceDeps` and vault repoints. Tovu still imports `AssistantSurfaceDeps` from `@jini-ai/daemon/surface-exchanges`, which merge-14 keeps until B6.

## Step 3 — RT-K1-0.T, narrowed (`ee1cc47ff8` + `781a613c88`)
- **Files:**
  - `routes/settings/shared.ts`: local `SettingsRequestError` and `rejectSettingsRequest` deleted. It imports `{ RouteRefusalError, rejectRoute }` from **`@jini-ai/core/errors/route-refusal`** (the combine-14 specifier, not `contracts/server`). The four local calls are renamed, and `error instanceof RouteRefusalError` still writes `error.response.status` / `error.response.body`.
  - `server/inbound/shared/body-size-limit.ts`: cap declaration deleted. A header note points at the package. The middleware, `rejectOversizedJsonBody` and the exact legacy 413 body `{ error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" }` are unchanged.
- **Importers repointed:**
  - `rejectRoute` (9 files): `settings/{clear,get-effective,get-raw,register-definitions,reset,set}.ts`, `system/{assistant-owner-grant,assistant-permanent-deletes,assistant-subagents}.ts`. Other `./shared.js` bindings are kept.
  - `CONTENT_ENTRY_MAX_BODY_BYTES` from `@jini-ai/cms/admin-http/limits` (8 + 1 files): `email-templates/routes.ts`, `pages/{create,update-html,update}.ts`, `posts/{autosave,create,update}.ts`, `publish-content/blobs-probe.ts`, and `shared/__tests__/body-size-limit.test.ts`. The middleware imports and mounts are kept.
- **Old-specifier sweep:** `SettingsRequestError|rejectSettingsRequest` = **0 hits in code**. The only hits are two historical prompt docs, `development/refactor-patterns/dedupe/dedupe-0{1,2}.terra-prompt.md`, which were not edited. `CONTENT_ENTRY_MAX_BODY_BYTES` from `body-size-limit` = 0.
- **Not done:** no mount cutover. `mountSettingsJsonRoute` and every settings port stay as they are; `admin-json-route-ports.ts` belongs to B8 / BX-53/54.
- **Tests:**
  - **Test first:** `body-size-limit.test.ts` gains a case that the cms cap is exactly 1 MiB, a body at the cap passes, and a body one byte over gets the exact legacy 413 body.
  - Stay suite, 76 files (settings and system route tests, `json-route-parity`, `json-route-fallbacks`, body-size, content routes): **778 pass / 3 fail**. All 3 are **BASE-RED** with identical counts: `pages-update-html-auth` 12/1, `content-post-get-by-slug` 13/1, `site-backups.integration` 0/1.
- **why-comments:** the two `shared.ts` docblocks moved, reworded for a neutral host, to Jini `core/src/errors/route-refusal.ts`. They are recorded as "Moved to Jini" rows `4a80b78d2f91` and `73584ff700c8` in `development/why-comments-debt.json` (same practice as ex-export). The gate is back to 80 open, the base set.
- **Mutation M3 (named):** Jini `core/dist/errors/route-refusal.js` `rejectRoute` drops `if (required.code !== undefined) body.code = required.code;` → **RED**:
  - `json-route-parity` 33/13 (was 46/0)
  - `assistant-subagents` 15/2 (was 17/0)
  - `settings-register-definitions-op-validation` 4/4 (was 8/0)
  - `assistant-permanent-deletes` stays 5/0: it pins no `code`.
- **M3b (wiring):** Jini `cms/dist/admin-http/limits.js` cap → `1024*1024+1` → `body-size-limit` 5/1 **RED**. Both were restored.

## Step 4 — A-K2-0a.T (`f01e466a12`)
- **Files:**
  - `apps/admin/src/integrations/jini-kits.ts:27` `adminKit` now has `components.Icon` and `hooks.useT` (both from `@jini-ai/ui`).
  - It also has `values: { SETTINGS_DIALOG_DICTIONARIES, DEFAULT_NOTIFICATIONS_PREFERENCES }` from `@jini-ai/ui` and `{ UNREACHABLE_RETRY_DELAYS_MS, LOCAL_BACKUP_PRINCIPAL_ID }` from `@jini-ai/ui/panel-kit`, all passed by identity.
  - Why-comments say the UI and chat translators are distinct, and that the dock keeps reading the dictionary at call time.
- **Kept as is (per the review notes):**
  - The UI and chat translators stay distinct. Chat's `useT` from `@jini-ai/chat/react` is untouched in the 15 dock importers.
  - `assistant-dock-i18n.ts:2189`'s call-time `SETTINGS_DIALOG_DICTIONARIES[locale]` lookup is untouched.
  - No `TabBarTab` repoint was made (deferred: `disabled`/`dot`/`dotLabel`).
  - No screen changes.
- **Importers:** none needed. `main.tsx` and `render-with-jini-kits.tsx` already pass `adminKit`.
- **Gate:** `satisfies AdminKit` and admin tsc went **4 errors (base) → 0**. Those 4 errors were the missing `Icon`, `useT` and `values`, at `jini-kits.ts:20,22`, `main.tsx:89` and `render-with-jini-kits.tsx:23`.
- **Tests (first; 3/3 failed before the binding):** new `integrations/__tests__/admin-kit.integration.test.tsx`:
  - Icon is ui's `Icon`, and the kit `Icon` facade renders an `svg` through the real provider tree
  - `hooks.useT` is ui's `useT` and not chat's
  - all four values are the same objects, and `useAdminKitValues()` returns `adminKit.values`

  Result: 3/3 green, and `user-management-kit.integration` stays 4/4.
- **Mutation M4 (named):** bind chat's translator as the kit `useT` → **RED**, 1 failed / 2 passed ("supplies the UI translator, never chat's"). **Admin tsc stays 0 under this mutation:** the two translators have the same type, so only the new identity test protects the distinction.

## Gates — base `f7185f153` vs final `f01e466a12` (Jini merge-14 linked in both)
Raw files: `ex2-tovu-halves-{base,final}-<gate>.txt`, `ex2-tovu-halves-final-gates-vs-base.txt`.

| gate | base | final | note |
|---|---|---|---|
| admin tsc | **2** (4 `AdminKit` errors) | **0** | fixed by step 4 |
| `npm run typecheck` (+e2e) | 0 | 0 | |
| `typecheck:tests` | 0 | 0 | |
| `typecheck:scripts` | 2 | 2, identical | the 3 long-standing errors |
| desktop tsc preload / live-verify / renderer / main | 0/0/0/0 | 0/0/0/0 | |
| `check:size` | 1 | 1, **identical** | the combine-13 rows |
| `check:complexity` | 0 | 0 | |
| `check:errors` | 0 (WARN rows) | identical | |
| `check:hooks` | ok | ok | |
| `check:boundaries` | 0 errors / 112 warnings | 0 / 112, identical | modules 6773 → 6775 |
| `check:why-comments` | 1, 80 open | 1, **80 open, same set** | +2 moved rows in the debt file |
| `check:architecture` | 1 (runtime-only propagation 3.06 → 3.29) | 1, **same single row, 3.29** | files 2271 → 2270; all-import 12.45 → 12.44 |
| `worker-import-graph.test.ts` | 0 | 0 | |

## Tests
- **Node: changed tests + importers** (`ex2-tovu-halves-node-tests.txt`; list in `…-node-tests-list.txt`, 182 files):
  - Scope: every changed test, plus every test that directly imports a changed production module, including the hub `contracts/headless/index.ts` (37 test importers, all run), plus the step-2 and step-3 stay suites.
  - **Result: 2,300 pass / 14 fail in 10 files. All 10 are BASE-RED**, with identical pass/fail counts at `f7185f153` and identical failing test names (25 lines, diffed):
    - `automatic-agent-plugins.integration` 41/2, `domain-no-direct-tool-registration.boundary` 6/1, `mcp-ui-allowlist-completeness` 9/1, `no-vendor-in-core.boundary` 15/1
    - `pages-update-html-auth` 12/1, `content-post-get-by-slug` 13/1, `site-backups.integration` 0/1
    - `agent-daemon-server.page-navigate-error-rewrap.unit` 4/2, `plugin-host.integration` 22/3, `bundled-inactive-gating.integration` 7/1
- **Admin vitest full** (`ex2-tovu-halves-admin-full.txt`, `--maxWorkers=3`): **14,925 pass / 6 fail / 2 skipped** (910 files).
  - combine-13 had 14,917 / 6. The +8 are this run's new cases: i18n-common 5, admin-kit 3.
  - The 4 red files have the **same 6 failing tests at base**: `JiniMediaPicker.hooks` ×3, `admin-literal-copy`, `credential-input-autocomplete`, `dictionary-lookup-sinks`. They are also combine-13's 6.
- **No new red.** Base diff for gates and tests is above.

## FILES-LEFT (`ex2-tovu-halves-files-left.txt`)
Measured with `scan.mjs` + `plan.mjs` from `origin/plan/whats-left-1122` (`18f1b17c0`), on a clean worktree of each commit. FILES-LEFT = moving + shells.

| tree | moving | shells | **FILES-LEFT (all areas)** | **excluding theme areas** (`theme` + `adm-themes` = 111) |
|---|---|---|---|---|
| base `f7185f153` | 2,483 | 3 | **2,486** | **2,375** |
| final `f01e466a12` | 2,482 | 3 | **2,485** | **2,374** |

- **−1:** the deleted `approval-policy.ts`.
- Steps 1, 3 and 4 change file contents, not file counts: `i18n-common.ts` stays as host composition.
- Base equals combine-13's final exactly.
- The 3 shells left are the BLOCKed `custom-credentials/sets/{host,store,vault-repo}.ts`, unchanged.

## Owner rules
- **Tests first where behaviour changed:** steps 3 and 4 had their tests written and failing first (step 4: 3/3 red before the binding). Steps 1 and 2 are behaviour-preserving. Step 1 was proven by the one-time deep-equal against the old dictionary; step 2 by `tsc` plus TW3.
- **Inject everything:** the step-4 values are injected through the kit, not imported by screens.
- **`_optional = {}` pads:** `composeCommonDictionary` has one. The only removed pad line is `rejectSettingsRequest`'s, which moved to Jini `rejectRoute` and keeps its pad there.
- **Function size and complexity:** within limits (size and complexity gates identical to base).
- **Why-comments:** moved with the code or recorded as moved.
- **No re-export shells:** no new shells; the headless type re-exports were removed.

## Deviations and findings (listed)
1. **Commit split (cannot be fixed without force-push).** `git rm approval-policy.ts`, part of the step-2 work, was staged before the step-1 commit. So the deletion landed in **`71a1bcd725`** (step 1), and the 69 repoints in `e86ecf24e2`. Commit `71a1bcd725` on its own does not typecheck in `apps/website`, because the catalog still imports the deleted file. `e86ecf24e2` and every later commit is green. Squash or reorder when integrating if per-commit bisectability matters.
2. **M4 / type gap.** `satisfies AdminKit` cannot tell ui's `useT` from chat's `useT`, because they have the same type. The new identity test is the only guard.
3. **M1:** `app-i18n.unit.test.ts` does not catch a missing generic key. Only `i18n-common.unit.test.ts` does, as the CORRECTED sheet says.
4. Stale prose: `development/refactor-patterns/dedupe/dedupe-0{1,2}.terra-prompt.md` still mention `rejectSettingsRequest`. These are historical prompts and were not edited.
5. **Test litter:** a node test wrote a root `chat.db` again (C13-test-writes-dev-site). It was removed before committing.
6. Not run: e2e/playwright, desktop vitest, scripts vitest. No changed file reaches them, and desktop tsc ×4 is green.
