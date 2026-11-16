# Handoff: sheet review fixes (2026-11-15, stopped at the 250k context line)

Planning files only. No repo edits, no commits, no tests.

## Done
- **C3 (B1):** OWNER OVERRIDE re-stamp replaced by a "B1 ruling" section. D7 rewritten: the 3 Tovu facades (`kernel/port.ts`, `kernel/dialect.ts`, `migrations/step.ts`) are deleted, and Tovu gets the D5 split (`migrations/source-digests.ts`, 51 ids; `checksums.ts` stays byte-identical). C3t section rewritten: guards, steps, name map. `LegacyHistoryError` moves into `legacy-sqlite.ts`. The Tovu `UnknownAppliedMigrationError` subclass and the runner's rewrap are deleted. STOP list, tests, files and messages are updated.
  - Verified: there is no runtime path that hashes Tovu step source, so no stored checksum changes.
  - New `sheets/C3t.repoint.tsv`: 228 rows in 131 files, from `scripts/c3t/tovu-facade-census.cjs` + `c3t-post.py`.
  - Removed 3 now-dead facade rows from `C3.repoint.tsv`.
- **C6 (B2, H6):** marked WAVE C. §11 added:
  - `codexDisablePlugins` moves out of core and out of the port, into Codex def config `defs/codex/options.ts`.
  - The full `createAgentRuntimeBindings` body, including the filesystem group.
  - The Tovu binding: it sits in `createSiteScope` (`agent-daemon-scope.ts:203`), because `assistantRuntime` is built per site.
  - The `types.ts:758-769` shell is deleted. That added 3 rows to `C6.repoint.tsv`.
  - Edit (d) is resolved: `ProviderModelsInput` stays in agent-runtime, so its 2 rows were removed. The reviewer's "matches nothing" was wrong: the field is at `model-catalog.ts:33`.
  - Still owed: the §1 copy-order pass (about 15k Opus).
- **C10 (B3, B4, H1, H3, H7):**
  - Banner added.
  - The 4 C2-owned files are now guarded by expected content after C2.
  - zod: `A2uiPropsValidator` and `parseDynamicValue` adopted; the index uses an explicit export list with no `*Schema` values. 2 rows now point to `parseDynamicValue`.
  - `ui/package.json` is a coordinator step after C9-ui.
  - Tovu `assistant/{mcp-ui,index}.ts` barrels: rows in `C10-shell.repoint.tsv` (13 rows; includes 4 dead Jini re-exports in `assistant/index.ts`).
- **C8 (H7):** the `packages/sdk/src/index.ts:132` row became DROP. The sdk public-api test row has the MANUAL note. Census: nothing reads those names through `@tovu/sdk`. The C8.md §9.3 text is NOT yet updated (it still says "keep their lines").
- **C9-ui:** banner added. It owns `ui/package.json`. The duplicate `secretControlAttrs` row was removed (N2). N4 reference-web roots noted.

## Remaining (not done)
1. **C4:**
   - H3 banner.
   - H2: §2.2 `reportInternalError` becomes required on `RouteHostContext`, and §2.4 `scheduler` becomes required (`createSseStream({ scheduler }, optional)`). Delete `defaultScheduler`, the `randomUUID` default text, and the §5 STOP about it.
   - H4 guards: `a0fbcd725a5f http-kit/src/adapter.ts`, `1bf2715a1f29 origin.ts`, `acfd6f6e71d5 sse.ts` (Jini `7f28bbcfc`).
2. **C11 sheet (L-BASE-PURITY, H5):** it does not fit in C4. Data gathered (core blobs at `7f28bbcfc`):
   - `settings/express/*`: 5 files, 650 lines, the Express `registerSettingsRoutes` subpath `./settings/express` (node).
     - Convert it to a core-contract route list on C4's `jsonRoute` (wave C, after C4).
     - Drop core devDeps `express`/`@types/express`.
     - Tovu importers: `admin-http/routes/settings/{reset,shared,get-effective,get-raw}.ts` and `features/settings/site-title-write.ts`.
     - `cms/src/settings/express/index.ts` is a `@deprecated` re-export shell: delete it (cms contract tests import it).
   - `approval.ts:312` (`8a5175bb1592`): `setTimeout` becomes a scheduler port.
   - `fetch/cache.ts` (`0aa85d82147f`):
     - `:141` `fetch()` is the local `load({ fetch })` parameter, a false positive. Rename it to `load`.
     - `:33` `browserScheduler` default becomes a required scheduler.
   - `model-facing-tool-errors.ts:245` (`ebe162cd8d94`, mutable `LOGGABLE_CODES`, 4 files use `registerLoggableErrors`) and `settings/settings.ts:133` (`c26cb8624670`, `coercers` registry, 6 files use `registerCoercer`): both become instance registries.
   - `primitives/ids.ts:8` (`67a24b78ee55`, `createRandomUuidGenerator`, 187 importer files) and `records.ts:184` (`12f12fe5aa67`, default `globalThis.crypto`, 6 files): see the owner question.
3. **C5:** the no-shells revision and `C5.repoint.tsv` have not been started.
4. **C8.md:** update the §9.3 text to say the sdk line is deleted (H7, coordinator ruling).
5. **LANES.md:** add the "Wave B final" section (lanes, order, touched files, repoint pass order, revised costs). Inputs:
   - C3 is ~410k Sonnet, with C3t ~110k.
   - The P-ZOD lane (below).
   - C11a (wave B/C, core-only) and C11b (wave C, after C4).
   - C6 moves to wave C.
6. **P-ZOD lane note** (for LANES):
   - protocol root `registry.ts` exports 18 `*Schema` values and 18 `z.infer` types.
   - Outside users: registry `static-backend.ts` (6 names) and `database-backend.ts` (1), plus 3 protocol tests. Tovu uses none.
   - a2ui (after C10): 33 `z.infer` type aliases.
   - Fix: parse functions plus written-out types with type-equality assertions, and schemas internal. About 40k Sonnet, wave C, before R11.
   - Census configs: `scripts/census/{protocol-zod,a2ui-zod}.json`.

## Owner questions
- Should core's ambient adapters `createRandomUuidGenerator` (187 importer files) and `createSystemClock` move to `@jini-ai/platform` (clean; scripted repoint), or stay as the sanctioned WebCrypto/Date adapters with an L6 allow-list?
- `@tovu/sdk` is the ADR-005/024 plugin-author ABI. Deleting its line-132 re-export (10 plugin type names) per the ruling changes that ABI (types only; no runtime effect).
- `piGracefulShutdownMs` is the same vendor-field class as `codexDisablePlugins`, and it was left unchanged.

## Warnings
- Python `csv.writer` quotes fields that contain `"`. Write TSVs with `'\t'.join`.
- Tovu clone HEAD is `3ba7a3fca`; C3t guards are blobs at that commit.
