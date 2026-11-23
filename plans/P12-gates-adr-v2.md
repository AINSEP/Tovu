GATES+ADR REVISION COMPLETE

Verified the current Tovu plan tip `a65df40afd337f49e9be6fb86e200e96cd1df292` and the requested integration tips, Jini `4902a6a1a630f2dfc94d554c053ef7179ee689a8` and Tovu `f7185f153a841715e2bedd095229653a0a2108d9`. Verification was read-only. The commands below are for the executors. The combined-tree debt counts, XP3 release digest, and test results are pending execution. [Opus review](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/reviews/approve-P12-gates-adr.md)

### GATE-C

**C1 executor sheet for Jini.** Make resolved source, shipped payload, production manifest, and Core contract checks blocking through the existing `guard:drift` step. Apply `ex2-holds-jini` (`11d47b476`) before seeding. Preserve the SQLite and infra forwarder retirements, the empty Q2 exception list, and the public Core extension-capability runtime entry. Reconcile `sec4-jini` (`4e5f6396f`) and `ex3-c0b-jini` (`a34ea2194`) before capture. The latter adds the type-only site-key entry and overlaps the Core manifest.

The pinned injection debt has 71 `L5-injected-edge` keys covering 72 occurrences. The draft’s 916 Core value sites were candidates counted before symbol approval. Derive the policy from the public exports and measure the remaining findings on the approved combine tree. Use the old counts for comparison during review.

**Policy.**

- Same-package imports are valid under this boundary check. Cross-package imports may use public Core types and named Core runtime exports on the approved list. Keep `@jini-ai/protocol` as a base package with the same public-entry rules. Its current public entries are the root, `./mcp-ui`, and `./a2ui`. Preserve the existing base-purity rules, including Core’s dependency isolation.
- Store `metadata.approvedRuntime` in `scripts/injection-debt.json` as a sorted list of `<public-entry>#<exported-symbol>` pairs. Seed it with every runtime value export reachable through Core’s public manifest `exports` at the seed SHA and apply the same enumeration to Protocol. Resolve actual value exports through re-exports and applicable public entry conditions. The Core server entry includes `defineJsonRoute`, `ok`, `err`, `ClientFacingError`, and `jsonResponse`. Each pair authorizes the named binding at that entry. A renamed local binding still checks its original exported name.
- After adoption, an approval can be added only in the same change that adds that runtime export to the public entry. Compare the actual export sets at the trusted base and head. Reject manual approval growth, type entries presented as runtime, private implementations presented as public aliases, and aliases whose effective binding differs from the public entry. Reject namespace and wildcard value loads, bare side-effect loads, and opaque runtime loads of base packages. Manifest dependencies on the two base packages are package-level declarations and have no symbol to approve.
- Ratchet sibling implementation edges and shared type imports outside the two base packages. Keep useful preset and runtime-adapter diagnostics and account for their existing edges by occurrence. A role tag alone cannot waive a new edge. Track newly covered alias, sibling-relative, optional-dependency, payload, and public-entry findings under `L5-resolved`. Keep old findings under `L5-injected-edge` with stable keys. Report any physical occurrence once across the old and new coverage.
- Track production runtime syntax under Core `src/contracts/**` as `XP4-runtime`, including public contracts entry files. Key syntax by path, syntax kind, and declared name or referenced target. New contract files hold types only. Preserve the existing empty-module emit check for type-only contracts. Production inventory excludes test files and fixtures.

**Tests first.** Extend the existing Jini fixtures by test name. In `check-package-layers.injection.test.ts`, start with `passes imports of core and protocol, value and type alike`, `resolves package.json imports (#aliases) before classifying the target`, and `passes a debt hit, fails a higher count, and fails a stale (too high) allowance`. In `injection-exceptions.q2.test.ts`, retain `lists no exception at all, and keeps the rule that one is never added to silence the gate` and `surfaces a re-added infra db shim as an L5 edge now that no exception excuses it`. In `check-no-cross-package.test.ts`, find `XP4 permits only contracts with type declarations and relative type imports inside core` and `XP4 rejects runtime JavaScript even when its source is type-only`.

| Fixture | Required result |
|---|---|
| Resolved sibling imports | Exercise a bare entry, TS path alias, `#imports`, sibling-relative `.js`, re-export, `require` and literal dynamic import. Add an aliased `optionalDependencies` entry and a shipped plugin payload. Report the canonical target, site kind, and source line. |
| Core and Protocol public entries | Public type-only imports and approved named values pass. An unapproved value in a mixed import, namespace load, and alias redirected to a private implementation fail. Cover an inline type list that emits a module load under the applicable compiler settings. |
| Runtime approval | An approval-only addition fails. Adding a public runtime export and its matching approval together passes. Adding a type-only export cannot authorize a value. |
| Trusted debt | A frozen count of one passes. A duplicate occurrence, an allowance increase, and a role-tag bypass fail. First capture for a designated new rule passes with an exact seed. A later attempt to seed that rule after its debt reaches zero fails. A cut prints `update baseline` and passes with the exact shrink. |
| XP4 | Frozen runtime syntax passes at the recorded count. Added runtime syntax in an existing file and a new runtime contract file fail. A new types-only module with empty emit passes. |

**Named mutation `C-same-specifier-value`.** In the passing Core type fixture, remove `type` and use the binding as a value. Keep the source path and specifier the same. Require an `L5-resolved` value finding, then revert.

**Implementation and rollout.**

1. Extend `scripts/lib/import-sites.ts` and the published parser in `packages/devops/src/packaging/electron/typescript.ts`. Collect one site per syntax occurrence with original bindings, syntax, type/value status, and position. Reuse lexical `require` handling. Cover import-equals, type queries, JSDoc, mixed clauses, and declaration references and augmentations. Any new `RuntimeImportRef` fields are optional and additive. Preserve the behavior of `createTypeScriptImportReader`, which Tovu’s `apps/desktop/scripts/verify-staged-closure.ts` already uses. Add a `@jini-ai/devops` changeset and require `pnpm api:check`.
2. Extend `scripts/lib/spec-aliases.ts` and `scripts/lib/injection-edges.ts`. Resolve from the importer using its TS configuration, manifest imports, dependency aliases and public export conditions. Resolve sibling-relative `.js` spellings back to source and identify the tightest workspace owner. Keep public-entry identity distinct from a private path that happens to resolve to the same package. Deduplicate multiple resolution branches for one canonical target at one site. Scan shipped JS payload variants, and scan `dependencies`, `peerDependencies`, and `optionalDependencies` as separate manifest kinds.
3. Reuse the reader and resolver in `scripts/check-no-cross-package.ts`. Move blocking XP4 source occurrence collection into `scripts/lib/injection-gate.ts`. Retain the legacy XP CLI and its snapshot writer and empty-emit assertion. New or changed public helpers take required and optional argument objects. Warn at 50 lines, error above 80, and cap complexity at 10.
4. In `scripts/lib/injection-debt.ts`, keep the key `{rule,file,spec,kind}` and preserve `lane` outside that key. Validate unique keys and positive counts. Add one-time bootstrap metadata for `L5-resolved` and `XP4-runtime`. A rule can seed only when it has zero entries and no initialized marker at the trusted base, and the submitted entries exactly match the findings on the immutable approved combine input. Verify that the gate change leaves the seed’s tracked production inputs intact. Keep the initialized marker after the last entry is removed. Thereafter entries may only shrink. A live count below the recorded count fails with `update baseline`.
5. In `scripts/check-guard-drift.ts`, use `checkPackageLayers(…, { injection: false })` for the legacy comparison. Run `injectionViolations` separately and fail directly on its outcome. Reconcile any obsolete injection rows in `guard-baseline.json` and keep unrelated rows. Preserve the guard self-tests and the raw `pnpm guard` entry point. Read trusted state through `scripts/lib/debt-base.mjs`.
6. Generate the source seed with `pnpm exec tsx scripts/injection-baseline.ts`. Its `main()` prints JSON directly. Keep existing lane assignments and review the new keys and runtime metadata. Check in `scripts/injection-debt.json` and initialize `scripts/xp-declaration-debt.json` with the original pin, empty entries, and pending snapshot digest. C2 finalizes that file.
7. In `.github/workflows/ci.yml`, keep the `quality-gates` job, `id: guard`, `INJECTION_BASE_REF`, and `INJECTION_FIRST_PUSH_COMMIT`. Run the focused Vitest command below in the guard step, followed by `pnpm guard:drift`. The final blocking expression gains the declaration outcome in C2.

```sh
pnpm exec vitest run scripts/__tests__/check-package-layers.injection.test.ts \
  scripts/__tests__/check-no-cross-package.test.ts \
  scripts/__tests__/injection-exceptions.q2.test.ts
INJECTION_BASE_REF=<trusted-base-sha> pnpm guard:drift
pnpm api:check
```

**Handoff.** The executor records fixture red and green results and the mutation/revert. Opus/combine verifies exact seed counts, a forged same-change allowance, a cut with its shrink, and absence of retired Q2 sites. Record the approved seed SHA. For an integration PR outside `main` or `general-work`, arrange the same required check explicitly. Those are the PR targets in the pinned workflow. [Injection collector](https://github.com/AINSEP/Jini/blob/4902a6a1a630f2dfc94d554c053ef7179ee689a8/scripts/lib/injection-edges.ts) · [Baseline entry point](https://github.com/AINSEP/Jini/blob/4902a6a1a630f2dfc94d554c053ef7179ee689a8/scripts/injection-baseline.ts) · [Jini CI](https://github.com/AINSEP/Jini/blob/4902a6a1a630f2dfc94d554c053ef7179ee689a8/.github/workflows/ci.yml)

### GATE-B

**Executor sheet for Tovu.** Add a blocking extraction ratchet to the existing `gate-boundaries` step. Scope starts from the reviewed P9 inventory and the owner’s November 22 theme decision. Seed on the approved combine tree after reconciling `ex2-tovu-halves` (`d6590fc72`) and `ex2-holds-tovu` (`8eb8ea568`). Retain the local i18n binding and record the Core destination of the moved approval symbols and the retained host specialization. Record both `features/settings/api/settings-api*.ts` moves into `apps/admin/src/lib/admin-http/` as host relocations. Record the retirement of the three custom-credential forwarders and preserve the worker changes.

**Inventory and targets.**

- Check in `development/boundaries/extraction-inventory.json` with the plan SHA, bound roots, exact whole-file and mixed-file rows, host dispositions, and named neutral ports. Seed from `plans/P9-data/*` at plan SHA `a65df40afd337f49e9be6fb86e200e96cd1df292`. The integration tree has no `plans/` directory. Map the raw `k-work.json` fields `f`, `step`, `area`, `dest`, and `k` to the inventory. Join local mixed targets and symbol names from `k-data.json` to the corresponding P9 step tables for their destination and step. Use `stays-in-tovu.md` for the initial host-owned paths and reconcile the approved overlays.
- Exclude all theme-owned rows from bound scope and record `stays: owner 2026-11-22`. The checked inventory has 85 rows under `apps/website/src/features/theme/` and a further `area: "theme"` row at `apps/website/src/contracts/core/tool-metadata/theme.ts`. It has 25 `adm-themes` rows under `apps/admin/src/features/themes/`. Reconcile the theme-owned rows labeled under other areas as well, including `apps/admin/src/features/admin-themes/`, theme-specific routes and middleware, and theme-owned files in mixed features such as pages, presentation, site export, and trash. Record exact exclusions in mixed dirs so generic neighbors remain covered. Apply the owner disposition to future files under dedicated theme roots.
- Reject edges to `apps/website/src/server/routes/types.ts`, `apps/website/src/server/routes/route-deps/**`, `apps/website/src/platform/**`, `apps/website/src/server/runtime/composition/**`, `apps/admin/src/integrations/**`, `apps/admin/src/lib/admin-http/**`, and exact host implementations from the inventory. A forbidden-root rule applies to importers outside that root. An edge internal to that same root is exempt from that root rule. Keep the 14 bound platform rows and three bound `admin-http` rows and their destinations. Continue traversing internal edges for reachability to other forbidden targets.
- Use the real admin transport files. On the integration pin, `admin-http` contains `config.ts`, `request.ts`, and `urls.ts`. The approved overlay adds the host-owned `settings-api.ts` and `settings-api.types.ts` inside that root. All three `owner-{mfa,passkey,recovery}-api.ts` files are bound rows, so keep their current destinations and omit them from the host-owned transport list. The pinned inventory showed no additional unbound transport file directly under `apps/admin/src/lib/`. Use `lib/admin-http/request.ts` in the fixture.
- A type or value reference to `@tovu/contracts` or a subpath from a bound source is `bound-tovu-contracts`. Resolve aliases and relative spellings to the owning `packages/contracts` workspace too. Host-owned imports are allowed. Permit public Jini entries and approved neutral local ports. Follow local ports, wrappers, and barrels to detect dependencies that lead back to the host.

**Tests first.** Add `development/scripts/__tests__/check-extraction-boundaries.test.mjs` and fixtures under `development/scripts/__tests__/fixtures/extraction-boundaries/`. Follow the temporary-workspace pattern in `dependency-cruiser.test.ts`. Use website fixture paths mirroring `server/routes/types.ts`, `server/routes/route-deps/credentials-deps.ts`, and `server/runtime/composition/app.ts`. Use admin fixture paths mirroring `lib/admin-http/request.ts` and `integrations/jini-kits.ts`. Include both application configs, a desktop NodeNext case, a mixed-symbol file, and a fixture public Jini export map.

| Fixture | Required result |
|---|---|
| Direct and wrapped host edges | Relative and `#src` references to the aggregate, including `Pick<RouteDeps, …>`, and route-deps slices fail. Admin `@/` through a transport barrel and a two-hop composition edge fail with the resolved target and witness path. An unresolved protected local alias fails. |
| Root overlap | A bound file inside `platform` or `admin-http` can import within its root. A bound file outside the root gets a finding for the same target. Preserve the approved move rows. |
| Dependency direction and ownership | A neutral local port, public Jini entry, public Core type, and host binder importing a feature pass. An `@tovu/contracts` type passes in a host-owned file and fails from a bound entry. A bound value import, an alias into the contracts workspace, and a private Jini entry fail. |
| Mixed scope and coverage | An import used only by retained host symbols passes. A moved symbol that uses it fails. Reject an unexplained dropped inventory row or narrowed root. A new bound file starts with zero allowance. A newly added theme file under a dedicated host root receives the host classification. |
| Occurrences and shrink | A frozen edge passes, a repeated occurrence increments the count, and same-change allowance growth fails. A removed edge produces `update baseline`. `--write-shrink` rewrites the exact lower count or removes the zero row. Repeating the command produces identical bytes. |

**Named mutation `B-wrapper-to-composition`.** Redirect the passing bound entry’s neutral port through `wrapper.ts` to `integrations/jini-kits.ts`. Leave the entry’s import spelling and inbound host mount in place. Require a finding with the two-hop path, then revert.

**Implementation and rollout.**

1. Add `development/scripts/check-extraction-boundaries.mjs` and `development/scripts/lib/extraction-graph.mjs`. Validate inventory coverage against trusted state. New production files under bound roots enter scope automatically. Files in mixed directories require an explicit disposition. Require a recorded destination or approved host disposition when a path leaves scope.
2. Reuse `.dependency-cruiser.mjs`, preserve the website report and exit behavior, and keep `check-feature-ranks.mjs` and its rank coverage. Share the production-file filtering conventions and cover the supported JS and TS variants for extraction. Capture graph edges using the importer’s config. Use the root config and root package `#src` imports for website, `apps/admin/tsconfig.json` for admin, and `apps/desktop/tsconfig.main.json` for the 17 pinned desktop rows. Pick up other desktop configs if the classified path belongs to them. Preserve type edges and unresolved protected local references. Stop traversal at external packages after checking their public entry.
3. Treat cruiser JSON as resolution authority and syntax as the occurrence authority. Reuse the installed DevOps reader where it supplies load sites and supplement its runtime-only view with TS AST type sites. Join on importer and written reference. Follow local declarations referenced by mixed-file exports. Walk reachability cycle-safely. Count physical sites at the forbidden target and wrapper entrances that reach it, keyed by immediate resolved target. Supply a stable witness in diagnostics. Preserve the valid host-to-feature direction.
4. Add `development/boundaries/extraction-debt.json` with `{seedSha,entries}`. Each entry has `{rule,source,target,kind,count,owner}` and keys on the first four fields. Write one entry per line in sorted order. Implement `--print-baseline`, `--with-report`, and `--write-shrink` in the new script. Print the initial baseline from the approved combine tree with `node development/scripts/check-extraction-boundaries.mjs --print-baseline`. Review ownership and exact counts. Bootstrap once against matching production inputs. Later compare against the trusted base and reject new, raised, stale, or scope-widened allowances.
5. Every mover brief runs `node development/scripts/check-extraction-boundaries.mjs --write-shrink` and includes the shrink in the same commit as the cut. Compute counts from the live tree. Decrement existing counts and remove zero rows. Reject new keys or higher counts without rewriting the file. If parallel movers conflict, reconcile the source and inventory, then recompute the shrink from the merged tree rather than accepting either side’s counts wholesale.
6. Set `package.json` to the command below. In `.github/workflows/ci.yml`, retain `id: gate-boundaries`, `continue-on-error: true`, and the final blocking outcome check. Set `EXTRACTION_BASE_REF` using the PR base or previous push SHA, with the same zero-SHA fallback used by `SIZE_BASE_REF`. Run the focused Node fixtures before `npm run check:boundaries`. Replace the old “always exits 0” comment and the nearby architecture metrics comment that describes boundaries as report-only. The existing rank and cruise checks and the extraction ratchet can all fail the boundary step.

```json
"check:boundaries": "node development/scripts/check-feature-ranks.mjs . development/boundaries/feature-ranks.json && node development/scripts/check-extraction-boundaries.mjs --with-report"
```

**Handoff.** Opus/combine runs the focused fixture, verifies the mutation and revert, compares the website report, and runs `EXTRACTION_BASE_REF=<trusted-base-sha> npm run check:boundaries`. Demonstrate same-change allowance growth failing and an exact shrink passing. Record counts and seed SHA. Stop capture if a protected edge cannot be joined to source occurrences, an inventory entry lacks a destination or owner, or a scope change lacks a recorded disposition. Use the existing root CI install. [P9 whole-file inventory](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/plans/P9-data/k-work.json) · [Tovu CI](https://github.com/AINSEP/Tovu/blob/f7185f153a841715e2bedd095229653a0a2108d9/.github/workflows/ci.yml)

### GATE-DECL

**C2 executor sheet for Jini.** After C1, make XP3 declaration checking blocking. Compare shipped declarations with the independently built original pin `35c4961af718f0f30591c46d2ea2756c4484a731`, then ratchet any remaining approved seed delta against the trusted PR base. Combine-14 recorded 3,308 source mappings and 112 historical XP3 diagnostics with the snapshot present, including 62 missing-current-mapping diagnostics. Reconcile those against actual shipping and build configuration before producing debt.

**Tests first.** Extend `check-no-cross-package.test.ts` at the named tests for a declaration-only edge, configured output folders, and current declarations for added sources. Exercise clean source with a forbidden sibling-private declaration reference, an explicitly unshipped source, a promised output missing on disk, and missing, wrong-pin, incomplete, or tampered snapshot data. Missing promised files or invalid provenance are errors before debt comparison. Test exact original-pin subtraction and that a second equivalent declaration reference increments the count. Mutation `C2-emitted-private-edge` adds a sibling-private type reference only to a shipped fixture `.d.ts`. Require an XP3 failure and revert.

**Implementation.** In `scripts/check-no-cross-package.ts`, add `--declarations-only` and `--print-declaration-debt`. Preserve the existing `--base` and `--write-baseline` modes. Reuse C1’s reader and resolver, the configured output mappings, and the pinned manifest’s source mappings. Compare exact occurrences by originating source, canonical target, and kind. Print the emitted file and line for diagnostics. Skip non-shipped artifacts using verified build and package configuration. Scan publishable authored declarations as well as emitted files. Keep genuine missing mappings or outputs outside the debt file. Use the C1 trusted-base helper and exact shrink rules for `scripts/xp-declaration-debt.json`.

**Snapshot and CI.**

1. Use one capped combine or cloud run. Estimate **45–75 runner minutes**, with a **90-minute hard cap** and no automatic retry. Budget up to 1.5 runner-hours. Record the selected runner’s billed estimate and spend cap before launch. The historical combine run establishes the build sequence and mapping count. The minute estimate is for scheduling.
2. At the clean original pin, run the frozen install, build Core, then run `pnpm -r run build`. Invoke the maintained snapshot writer from that worktree with `--base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline <absolute-new-output-directory>`. Package its output with root directory `jini-xp3`. Publish `jini-xp3-35c4961af.tar.gz` as a release asset on tag `xp3-35c4961af` in Jini. The tag falls outside the `release-*` publishing trigger.
3. Record the reviewed archive SHA-256 and original pin in `scripts/xp-declaration-debt.json`. Verify provenance and original mappings and seed the exact remaining findings from the built approved combine head. Add the package script below. With `JINI_DECLARATION_BASELINE_DIR` set to the extracted snapshot, use `pnpm run check:cross-package:declarations --print-declaration-debt` to capture the seed candidates. Review entries and assign lanes.
4. In `quality-gates`, after the existing recursive build and guard, add `id: gate-xp-declarations`. Download the release asset with repository read access, verify its SHA-256 before extracting under `$RUNNER_TEMP`, and set `JINI_DECLARATION_BASELINE_DIR="$RUNNER_TEMP/jini-xp3"`. Use the same trusted base inputs as the injection check. Include `steps.gate-xp-declarations.outcome` in both the final blocking expression and failure output when the asset and digest land.

```json
"check:cross-package:declarations": "node --import tsx ./scripts/check-no-cross-package.ts --base 35c4961af718f0f30591c46d2ea2756c4484a731 --declarations-only"
```

**Handoff.** Verify the built head with the pinned asset, then require a nonzero exit with the snapshot variable unset and with incorrect provenance. Verify the declaration-only mutation, a second-occurrence failure, and the exact shrink. Record the original pin, seed SHA, digest, mapping count, and resulting XP3 debt count. Keep the workflow change pending if the artifact, digest, or mapping evidence is incomplete. [Combine-14 snapshot evidence](https://github.com/AINSEP/Jini/blob/4902a6a1a630f2dfc94d554c053ef7179ee689a8/cloud-results/combine-14-jini.md) · [Publication trigger](https://github.com/AINSEP/Jini/blob/4902a6a1a630f2dfc94d554c053ef7179ee689a8/.github/workflows/publish.yml)

### HTTPKIT-MAXBODY

**Executor sheet for Jini.** Honor an explicit Core `JsonRouteSpec.maxBodyBytes` when `@jini-ai/http-kit` mounts the spec through Express. Core passes the cap to its bounded reader. The Express spec omits the field and `mountJsonRoute` reads `req.body` after host middleware. Tovu uses separate public and authenticated parsers, and the first parser to consume the body owns the read.

**Test first.** In `packages/http-kit/src/__tests__/adapter.test.ts`, add a real Express regression using Core’s `defineJsonRoute` with `maxBodyBytes` and an upstream JSON parser with a higher ceiling. Record actual inbound bytes at the parser. Before the fix, an otherwise valid over-cap body reaches the handler. Require a JSON `413` with code `PAYLOAD_TOO_LARGE`, with feature `parse` and `handle` untouched. Cover an exact-limit body, multibyte UTF-8 and whitespace that would be lost by reserialization, a request without `Content-Length`, and an uncapped route. Cover an explicit cap with missing measurement setup. Run the test red before editing production code.

**Fix.** Add optional `maxBodyBytes` to `packages/http-kit/src/types.ts` and to the compatibility constructor’s optional settings in `adapter.ts`. Use an additive optional mount argument for the host’s actual body-byte measurement. For a capped non-GET route, require a measurement provider at registration and an authoritative count for each request, including an explicit zero for an empty body. Fail closed on missing measurement. Check the count before extracting raw input or invoking route ports, and use `sendApiError` for the standard 413 envelope. Direct measurements from the first bounded reader or its byte-count hook preserve the cap for pre-parsed requests. The existing `rejectOversizedJsonBody` helper measures reserialized JSON and cannot provide that evidence. The host still sets the first parser’s allocation ceiling. Wire the first capped K1 mount through the existing host parsing point, preserving session admission and applicable parser limits. GET handling follows Core’s no-body policy.

**Named mutation `HTTPKIT-ignore-route-max-body`.** Keep byte capture and the upstream parser intact. Bypass the comparison to the spec’s cap in the mount. The over-cap fixture must go red. Revert and run the focused adapter, adapter-ports, and body-size-limit tests, package typecheck, and API check. Record the changeset and the parser contract with the public API. [Express mount](https://github.com/AINSEP/Jini/blob/4902a6a1a630f2dfc94d554c053ef7179ee689a8/packages/http-kit/src/adapter.ts) · [Core route body handling](https://github.com/AINSEP/Jini/blob/4902a6a1a630f2dfc94d554c053ef7179ee689a8/packages/core/src/contracts/server/json-route.ts) · [Tovu parser order](https://github.com/AINSEP/Tovu/blob/f7185f153a841715e2bedd095229653a0a2108d9/apps/website/src/server/inbound/shared/json-body-parsers.ts)

### TOVU ADR ADS-memory/reports/architecture/ADR-071-tovu-host-composition.md

# ADR-071: Tovu owns product wiring

- Status: Accepted owner direction. CI rollout follows the extraction plan.
- Date: 2026-11-22
- Owner decision: 2026-11-20 to 2026-11-22

#### Context

Tovu organized features into folders, but their code still reached sideways into shared host modules for routing, storage, admin transport, and live hooks. Moving a folder therefore meant tracing and rewriting its dependency graph. The extraction census found 690 candidate files importing code that stays in Tovu. The route adapter was a prerequisite for 334 files. The Jini audit counted 137 value-bearing references between packages outside Core. These measurements come from different planning snapshots. [Extraction plan](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/plans/P9-extraction.md) · [Tovu dependency audit](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/plans/P12-tovu-tangle.md) · [Jini gate plan](https://github.com/AINSEP/Tovu/blob/a65df40afd337f49e9be6fb86e200e96cd1df292/plans/P12-tangle-plan-jini-gates.md)

#### Decision

1. **Keep product ownership in Tovu.** Tovu owns site policy, product copy, themes, and the composition root that selects and connects implementations. Move generic behavior to product-, vendor-, and server-framework-neutral `@jini-ai/*` packages. Split mixed files at the seam. Carry behavior and why-comments with the code, point callers to the owning export, and delete forwarding shells.
2. **Give each feature its own dependencies.** Pass external dependencies through required arguments or props. Each feature defines the smallest structural port or deps type it needs. Keep host infrastructure, live bindings, and sibling implementations out of feature imports. Shared generic types and ports live in `@jini-ai/core`. New files under Core’s `src/contracts` hold types only. Runtime code goes in its owning implementation module. Tovu-specific types live in `@tovu/contracts`. Code bound for Jini never imports `@tovu/contracts`.
3. **Mount routes in the host.** Define JSON specs with `defineJsonRoute` from `@jini-ai/core/contracts/server`. The spec declares a small route-local deps type and leaves `ports` unset. Tovu mounts it with `mountJsonRoute` from `@jini-ai/http-kit`, passing explicit route-local deps and Express-compatible host ports. The compatibility package also exposes its own Express-bound `defineJsonRoute`. Keep `RouteDeps`, including `Pick<RouteDeps, …>`, out of feature specs. Bind server adaptation, workspace admission, authentication, authorization, and error mapping at the host boundary. Preserve middleware order, body limits, and response behavior during the cutover.
4. **Bind admin screens at the mount.** Supply the `@jini-ai/admin` kit from Tovu composition. Pass custom React hooks as required props with neutral names and types that expose only what the screen reads or calls. Keep concrete imports and live bindings in composition. Pass sibling UI through slots and product copy through existing args or props fields.
5. **Keep public call shapes and code limits.** Public functions and factories take `(requiredArgs, optionalArgs)` objects. Keep `_optional = {}` where the second object has no fields. Function length warns at 50 lines and errors above 80. Complexity is capped at 10.

#### Consequences

The host mount shows which live adapter, policy, and copy a feature uses. Tests can supply small fakes through the same inputs. Some mounts gain explicit arguments and props. Once the seam is in place, generic code can move with its behavior intact. An extraction that changes behavior starts with a failing test.

#### Enforcement

CI compares resolved findings and checked-in allowances against the trusted base. New findings, growing or widened allowances, and stale entries left after a cut fail the check.

- **A — Admin feature rank.** Enforce descending rank for legacy sibling edges and freeze their occurrences, including type edges and detours through wrappers or shared modules.
- **B — Tovu extraction boundary.** Check the inventory for direct and indirect imports of host infrastructure or live binders and for bound imports of `@tovu/contracts`. Composition may import features and supply their ports.
- **C — Jini cross-package boundary.** Block new sibling implementation references and shared types outside the base packages. Allow Core types and the approved Core runtime exports listed with the debt file. Protocol keeps base-package status under the same public-entry rules. Check declarations and manifests as well as source.
- **D1–D4.** Block forwarding shells, concrete or defaulted custom hooks in extractable components, console/Express/vendor implementation dependencies and host identity in Jini, and growth in size exceptions. Track existing compatibility debt by occurrence.

Each Jini-bound feature folder’s `INFO.md` or `README.md` has a **Wiring** section. It lists what the feature needs, what it provides, a short host wiring example, and what it must not import, and links to this ADR. CI also checks that the ports it names exist. The agent that untangles or moves the feature writes the section in the same change.

#### How to wire a feature

The feature exports the route spec. The host supplies the workspace-scoped reader and Express-compatible ports. Core ports receive Web `Request` and `locals`; the Express authentication port receives `res`, so each is supplied at its own mount.

```ts
import { defineJsonRoute, type Result } from '@jini-ai/core/contracts/server'

type MenuRouteDeps = {
  readMenu: (required: { id: string }) => Promise<Result<{ title: string }>>
}

export const menuRoute = defineJsonRoute<
  { id: string }, { title: string }, MenuRouteDeps
>({
  method: 'get',
  path: '/menus/:id',
  parse: parseMenuId,
  handle: ({ input, deps }, _optional = {}) => deps.readMenu({ id: input.id }),
})
```

```tsx
import { mountJsonRoute } from '@jini-ai/http-kit'
import { AdminKitProvider } from '@jini-ai/admin/react/kit'

mountJsonRoute({
  app,
  spec: { ...menuRoute, ports: adminRoutePorts },
  deps: { readMenu: readAllowedWorkspaceMenu },
})

<AdminKitProvider kit={adminKit}>
  <MenuScreen id={menuId} heading={menuHeading} useMenu={useWiredMenu} />
</AdminKitProvider>
```

The screen declares `useMenu` as a required prop typed to its narrow result, such as `{ title: string }`. The kit provides shared UI such as `Notice`.

#### Alternatives rejected

- **A central dependency module or Tovu Core for everything.** A shared dependency bag gives each feature access to unrelated services and ties portable code to Tovu’s graph.
- **Import implementations and expose defaulted overrides.** The default keeps the dependency edge and makes wiring implicit.

**Index change.** Add this row to `ADS-memory/reports/architecture/ADR-INDEX.md`. ADR-070 exists and also lacks an index row at the integration pin.

```markdown
| [071](ADR-071-tovu-host-composition.md) | Tovu owns product wiring, policy, copy, and themes. Features declare narrow ports. Host composition supplies route and admin implementations. CI ratchets extraction dependencies. | Accepted direction 2026-11-22 (owner decision; CI rollout follows the extraction plan) |
```

### JINI ADR docs/decisions/DR-006-host-injected-package-dependencies.md

# DR-006: Packages receive implementations from the host

Status: Accepted owner direction, 2026-11-22. This record defines the target for CI enforcement.

#### Context

A feature can have its own folder and still depend on a host’s route types, transport, or live hooks. A package graph can be acyclic and still lock consumers into another package’s implementation. A value import fixes a choice the host should make. This decision extends the composition rule in [DR-005](DR-005-portable-package-boundaries.md).

#### Decision

1. **Jini owns reusable behavior.** Packages stay product-, vendor-, and server-framework-neutral. A host product owns its policy, themes, copy, and concrete wiring. Split mixed code at the seam and move the reusable behavior with its why-comments. Consumers use the owning public export. Delete forwarding-only compatibility files.
2. **The consuming feature owns its port.** Each feature declares only the operations and data it uses. It receives implementations as arguments or props and keeps host infrastructure and sibling implementation imports out of its source. Shared generic types and ports live in `@jini-ai/core`. New files under Core’s `src/contracts` hold types only. New runtime code goes at its owning implementation path. Host-specific types stay in the host.
3. **Routes publish specs.** Define server-neutral JSON specs with `defineJsonRoute` from `@jini-ai/core/contracts/server`. Each spec uses a small route-local deps type and leaves `ports` unset. The host builds the route with `jsonRoute` and registers it on its `Server`, adding its request policy and failure mapping. `mountJsonRoute` in `@jini-ai/http-kit` is the Express compatibility adapter. A central deps type or a `Pick` from one ties the spec to a host.
4. **Screens receive UI and behavior through declared inputs.** Use the host-injected `@jini-ai/admin` kit for shared admin UI. Custom React hooks arrive as required props typed to the fields and calls the component uses. Use neutral prop names and keep live bindings in host composition. Take product copy through existing args or props fields.
5. **Keep effects and call shapes explicit.** Inject logging and provider operations. Keep console calls, Express types and code, vendor implementations, and host identity out of feature code. Existing Express compatibility subpaths are tracked debt. Public functions and factories take `(requiredArgs, optionalArgs)` objects and keep `_optional = {}` when the second object has no fields. Function length warns at 50 lines and errors above 80. Complexity is capped at 10.

#### Consequences and current limits

Hosts can choose different providers and server adapters while keeping the same feature. Tests can supply small fakes. The host has more wiring to write, and package authors must keep contracts narrow. Remove legacy compatibility entries and import debt as their consumers migrate.

#### Defect prevented

A reusable package silently selects a sibling implementation, or a screen’s default hook reaches into host transport even when the screen has an injection prop.

#### Source and enforcement

CI tracks resolved occurrences against the trusted base. New violations, expanded allowances, and stale debt entries fail the check.

- **C — Cross-package boundary.** Reject new sibling executable imports and shared type imports outside the base packages. Allow public Core types and approved Core runtime exports listed with the debt file. Protocol keeps base-package status under the same public-entry rules. Check resolved source, declarations, and manifests.
- **D1–D4.** Reject forwarding shells, concrete or defaulted custom hooks, console/Express/vendor dependencies and host identity, and growth in size exceptions. Canonical same-package public entry points remain valid.
- Host repositories can add matching checks for their side of the boundary.

Each feature folder’s `INFO.md` or `README.md` has a **Wiring** section. It lists what the feature needs, what it provides, a short host wiring example, and what it must not import, and links to this record. CI also checks that the ports it names exist. The agent that untangles or moves the feature writes the section in the same change.

[Core route spec](../../packages/core/src/contracts/server/json-route.ts) · [Admin kit](../../packages/admin/src/react/kit.tsx) · [Cross-package check](../../scripts/check-no-cross-package.ts) · [Hardwiring check](../../scripts/check-hardwiring.ts)

#### How to wire a feature

The package declares a local route port and a screen that consumes a narrow hook result. `Notice` comes from the admin kit.

```ts
import { defineJsonRoute, type Result } from '@jini-ai/core/contracts/server'

type MenuRouteDeps = {
  readMenu: (required: { id: string }) => Promise<Result<{ title: string }>>
}

export const menuRoute = defineJsonRoute<
  { id: string }, { title: string }, MenuRouteDeps
>({
  method: 'get',
  path: '/menus/:id',
  parse: parseMenuId,
  handle: ({ input, deps }, _optional = {}) => deps.readMenu({ id: input.id }),
})
```

```tsx
import { Notice } from '@jini-ai/admin/react/kit'

type MenuScreenProps = {
  id: string
  heading: string
  useMenu: (required: { id: string }) => { title: string }
}

export function MenuScreen({ id, heading, useMenu }: MenuScreenProps) {
  const { title } = useMenu({ id })
  return <Notice>{heading} {title}</Notice>
}
```

The host registers the route on its `Server` and mounts the screen with its selected kit, hook, and copy. In this wiring sketch the menu reader, route ports, and incident reporter are supplied by the host.

```tsx
import { defineJsonRoute, jsonRoute, type Server } from '@jini-ai/core/contracts/server'
import { AdminKitProvider } from '@jini-ai/admin/react/kit'

function registerMenu({ app }: { app: Server }, _optional = {}) {
  const spec = defineJsonRoute(menuRoute, { ports: hostRoutePorts })
  const deps = { readMenu: readAllowedMenu }
  const host = routeHost

  app.route(jsonRoute({ spec, deps, reportInternalError }, { host }))
}

<AdminKitProvider kit={adminKit}>
  <MenuScreen id={menuId} heading={menuHeading} useMenu={useWiredMenu} />
</AdminKitProvider>
```

#### Alternatives rejected

- **A central dependency module for everything.** A shared implementation hub couples every consumer to the same graph. Core supplies shared vocabulary and approved neutral primitives.
- **Import implementations and expose defaulted overrides.** The import fixes a production dependency and hides a choice the host should make.

**Index change.** Add this line under **Shared decisions** in `docs/decisions/README.md`, after DR-005.

```markdown
- [Packages receive implementations from the host](DR-006-host-injected-package-dependencies.md).
```

#### Approver correction map

| Correction | Where fixed |
|---|---|
| C1. Decide which Core runtime values pass | **Gate C, Policy.** Exact public export pairs at the seed, with trusted-base validation for additions. |
| C2. Preserve Protocol base status | **Gate C, Policy**, **ADR-071, Enforcement**, and **DR-006, Source and enforcement**. |
| C3. Let the first seed pass without widening old L5 debt | **Gate C, Implementation steps 4–6.** `L5-resolved` and `XP4-runtime`, exact first capture, persistent initialized markers. |
| C4. Use the real injection baseline invocation | **Gate C, Implementation step 6.** `pnpm exec tsx scripts/injection-baseline.ts`. |
| C5. Separate the blocking XP3 rollout | **Gate Decl.** Original-pin build, bounded budget, release asset, digest, and independent CI activation. |
| C6. Preserve the shipped DevOps reader API | **Gate C, Implementation step 1.** Optional additive metadata, changeset, and API check. |
| C7. State function limits accurately | **Gate C, Implementation step 3**, and both ADR decisions. |
| C8. Locate moved test anchors by name | **Gate C, Tests first.** Names checked on the holds branch. |
| B1. Keep themes in Tovu | **Gate B, Inventory and targets.** Includes the 85 website root rows, the extra theme metadata row, 25 admin theme rows, and theme-owned rows in other areas. |
| B2. Resolve inventory and forbidden-root overlap | **Gate B, Inventory and targets** and the overlap fixture. Root-internal edges are exempt from that root rule. The 17 destinations are retained. |
| B3. Use real admin transport targets | **Gate B, Inventory and targets** and the fixture paths. The three owner API examples are bound. The approved settings relocations are host-owned. |
| B4. Flag bound `@tovu/contracts` references | **Gate B, Inventory and targets** and the ownership fixture. Both type and value references are covered. |
| B5. Read the real inventory schema from the plan tip | **Gate B, Inventory and targets.** Uses `f/step/area/dest/k` and the immutable plan SHA. |
| B6. Give movers a shrink-only update command | **Gate B, Implementation steps 4–5.** `--write-shrink`, one sorted entry per line, same-commit use. |
| B7. Update stale CI comments | **Gate B, Implementation step 6.** Covers both comments that describe the boundary check as report-only. |
| ADR1. Make DR-006 host-neutral | **DR-006 throughout.** Uses the approver’s rewrite and local Jini evidence. |
| ADR2. Show a server-neutral host mount | **DR-006, How to wire a feature.** `app: Server` and `app.route(jsonRoute({ spec, deps, reportInternalError }, { host }))`. |
| ADR3. Name the route imports and leave feature ports unset | **ADR-071, Decision 3 and wiring.** Uses the Core constructor and Express compatibility mount with host-supplied ports. |
| ADR4. State the types-only rule in plain language | **Both ADRs, Decision 2.** ADR-071 also bars `@tovu/contracts` imports from Jini-bound code. |
| ADR5. Check that named ports exist and document them in the same change | **Both ADRs, Wiring requirement.** ADR-071 applies it to each Jini-bound feature folder. |
| ADR6. Align Gate C wording with approved runtime exports | **ADR-071, Enforcement** and **DR-006, Source and enforcement**. |
| ADR7. Supply exact index additions and flag missing ADR-070 row | **Both ADRs, Index change.** |
| Body-limit defect | **HTTPKIT-MAXBODY.** Real Express regression first, cap-aware mount behavior, parser wiring, and a named mutation. |
