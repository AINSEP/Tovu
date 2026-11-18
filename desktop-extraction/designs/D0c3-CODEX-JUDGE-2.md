REJECT

| Claim checked | Result |
|---|---|
| Bases and ancestry (`REVISION-2:6–8`) | **REPRODUCED** Tovu `a7ebde50`, Jini `ccb90114`, terra `b5fbf2a5`, merge base `830a9851`, and D0c absent from terra. **WRONG** `git rev-list --count e17f1a7d..a7ebde50` gives **8**, and `git rev-list --count 830a9851..b5fbf2a5` gives **342**. |
| Desktop edges and closures (`D0c3:18–38,82,140`) | **REPRODUCED** Git-blob TypeScript AST walk found **16** edges, **5 production across 4 files**, and the three named extraction tests. Telemetry **13 files / 957 lines**, signals **3 / 269**, binding subset **8 / 393**, static server closures **2,017 / 2,016**. Both server entries reach the named modules. |
| Importers and debt (`D0c3:64–73,117`) | **REPRODUCED** 17 source importers including one dynamic, 25 bundled-catalog textual matches, 4 feature-signal importers, 70 directory-name hits, 33 runtime-mode and 4 export-policy importers, and 6+1 baseline edges. **WRONG** Original 24/3/20 corrected to **23/2/19** using `git grep -l -E "/${name}(\.js)?['\"]" a7ebde50 -- apps` for `host-binding` and `provider-contracts`, and `git grep -c -F 'test(' a7ebde50 -- '*composition/__tests__/product-telemetry.unit.test.ts'`. |
| Build, dependencies and release (`D0c3:41–53,89,96`; `REVISION-2:19,42`) | **REPRODUCED** SDK builds after host-shared, `INSTALL_ROOT` resolves to checkout `apps/` or packaged `Resources/`, all six existing runtime externals are locked, all six proposed original additions are absent, and host-shared is a `file:` link. Revision drops commerce. `processBuildRelease` is at **35**, as corrected. Workflow calls `stage` at **87, 162, 406**. Both cloud reports record linked T and P owed. |

### Blockers

1. **The gate cannot start or run on the specified shell.** `D0c3-sheets:43–46,85` reads a trailer from the unmodified base. `git log -1 --format='%(trailers:key=D0c3-Step,valueonly)' a7ebde50` is empty. The extracted gate returns **1** there. `/bin/bash -n` returns **2** for `COMMON:78–85` on Bash 3.2. Pass the baseline row explicitly and use parenthesized `case` patterns or functions outside substitutions.

2. **False greens remain.** With only that syntax corrected in memory, S1 propagated planted build/typecheck/test statuses **7/8/9**, but returned **0** for failed root discovery and `grep` exit **2** (`COMMON:66,86`). I3’s multi-name `npm ls` returned **0** with one installed and one missing selector (`D0c3-sheets:72`). S9 is evidence only, while `size-eslint.config.mjs:43–47` enforces **80**. Check each dependency and its declaration, preserve command errors, enforce the owner limits, and require a green control plus the intended failure diagnostic for each gate. Existing desktop runner exit tests cover only that runner (`check-gates-exit-code.test.ts:73–119`).

3. **a.3 and b.2 leave broken callers.** `D0c3-sheets:104` moves `findAncestor` and `MAX_WALK_UP`, but `product-root.ts:121,138` still call the walker. Keep one implementation accessible to all three callers. `D0c3-sheets:111` misses the required `checkout` at `observability-export.unit.test.ts:55` and the required `repoRoot` and exact input assertions at `product-telemetry-boot.test.ts:57,137,146,156`. Authorize those fixture edits in b.2.

4. **c.2 and d.1 omit type dependencies.** `D0c3-sheets:118` substitutes Jini’s opaque `DeclaredContentTypePorts` (`plugins/host/ports.ts:25–33`) for `DeclaredContentTypeWritePorts` (`declarative-content-types.ts:170–179`). The website spreads concrete fields into `registerContentType` (`composition/declared-content-types.ts:41–53`). Import the write port under the old local alias and retain the opaque adapter. `D0c3-sheets:129–130` also omits the shared input/config declarations at website `product-telemetry.ts:20–29`. Move those with their first consuming commit.

5. **Clean release inputs and comments remain unresolved.** `D0c3-sheets:19,135` defers compatible pins to e, while release cold-installs at `desktop-release.yml:156–159` and the pinned install already fails (`d0c-verify-fix:48`). A prerelease core pin also conflicts with unchanged direct overrides (`package.json:126`; desktop `package.json:87`). Establish passing pins and overrides before the move commits. For e.1, moving just “Why” (`D0c3-sheets:139`) leaves deleted blocks at `stage-website-shared.ts:33,44,60–61,66` in an in-memory run of the repo’s comment checker. Carry their rationale into the release history.

### Major

- **Lazy failure parity is incomplete.** `D0c3-sheets:119,131` can eagerly load the policy, whose Jini Node and SDK imports were inside the caught lazy path (`host-binding.ts:7–11`; website `product-telemetry.ts:120–121,239–254`). Keep those imports behind the desktop loader. The corrected archive fixture checks static closure. It cannot prove the aliased catalog or computed artifact lookup (`product-telemetry.ts:124–139`; Jini `packaging/electron/typescript.ts:75–93`). Exercise one configured provider in each packaged build.
- **Owner rules and overlap.** `REVISION-2:28,39` retains the module singleton (`host-binding.ts:74–86`). Compose it per host and inject it. Repoint moved-name aliases directly (`D0c3-sheets:27,102`; `lifecycle.ts:52`). INDEX adds both prior overlaps, but `INDEX:155–164` omits `wave3/su-cms-3`. `git diff --name-only a7ebde50...origin/wave3/su-cms-3` shows `main/index.ts`, `provider-plugins.ts`, and the desktop lockfile. Serialize and recensus before b.

### Minor

- `D0c3-sheets:116` plants `.js` admission, but `host-binding.unit.test.ts:91–98` only tries `.mjs`. Use matching mutations. At `Sheets:131`, use platform-aware expected paths for Windows.

### Over-engineering

- `Sheets:120` makes a generic `hasMethods` predicate part of the telemetry package API for website form and trace checks (`provider-contracts.ts:10,15`). Keep those single-method checks local. The full-registry move and duplicate verifier inventory from the prior draft are removed.
- `Sheets:111` adds an `exists` seam to `isCheckoutInstall` while its pin uses real checkout markers (`observability-export.unit.test.ts:37–38`). Use the existing root resolver and file probe directly.

### Unverified

Installed `tsc` and metafile output for future commits, published snapshot availability, actual ASAR placement, configured-provider smokes, work beyond fetched refs, and execution budgets. The five estimates sum to **870k before CI**. Review used roughly **15k reasoning and response tokens** and **13 minutes**.
