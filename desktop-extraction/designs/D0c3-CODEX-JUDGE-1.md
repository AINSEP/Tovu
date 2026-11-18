**REJECT** — Software Architect(Consensus)

| Claim checked | Result from Git objects |
|---|---|
| D0c3:3,18–30 · bases and desktop imports | **REPRODUCED.** Tovu `a7ebde50`, Jini `ccb90114`. `git grep` on the pinned Tovu ref found all five listed production lines across four modules and the three listed test files. D0c1/2 commits exist. Their reports record T passed and P owed. |
| D0c3:37–38,82,140 · closures | **REPRODUCED.** TypeScript AST walk over `git cat-file --batch` blobs matched the listed files and line counts, 13/957 and 3/269, plus the eight-file 393-line subset. Static server closures were 2,017/2,016 and both reached the named modules. Reachability establishes neither evaluation order nor failure parity. |
| D0c3:64–73,117 · importers, debt, tests | **REPRODUCED** for runtime-mode 33, `bundledAgentPluginsDir` 70 textual hits, feature host-signals 4, observability-export 4, plugin-export/declarative/vocabulary/system-types 2/3/2/4, and six source baseline edges plus one host-signals edge. Bundled sources has 16 static importers plus one dynamic importer that also mocks it. **WRONG.** `git grep -l -E '/(host-binding\|provider-contracts)(\.js)?["'\'']' a7ebde50 -- apps` gives 23/2 source files respectively. `git show a7ebde50:<test-path> \| rg -c 'test\('` gives 19 tests in 537 lines. |
| D0c3:41,49–53,89,96 · location, dependencies, release | **REPRODUCED** by `git show` of loader, stage script, manifests, lock and workflow. The six existing runtime externals are present and six proposed names are absent from the desktop lock. The `file:` link is recorded. `INSTALL_ROOT` derives to checkout `apps/` or packaged `Resources/`. **WRONG.** `build-release.ts:35` defines `processBuildRelease`; the cited line 82 is beyond EOF. **UNVERIFIABLE** from configuration alone: actual esbuild output and electron-builder dependency placement. |

### Blockers

1. **D0c3c cannot build cleanly.** Sheets:21,135–137 add SDK types at step 1 and runtime `@jini-ai/plugins` at step 2, with the desktop declaration at step 3. `plugin-export.ts:7` needs SDK declarations, `packages/sdk/package.json:9,16–17` points to generated output, and `build-server.mjs:20–22` builds host-shared first after COMMON:68 deletes SDK output. `declarative-content-types.ts:30–43` introduces the runtime plugins edge one commit early. Build contracts and SDK before host-shared in clean install and build paths, and declare each desktop runtime dependency in its first consuming commit.

2. **D0c3d splits a required atomic change.** Sheets:153–155 omit `productProviderOf` (`product-telemetry.ts:96–106`) from the loader move. The loader also calls `noopTelemetry` at :128. Step 2 removes the consent export before the desktop preference adapter switches in step 3. Move the loader with its dependencies and repoint consent callers in the deletion commit, including the desktop adapter and website characterization test at :10,222.

3. **The gates can pass the wrong thing.** Sheets:44–69 miss multiline imports, while `stage-website-shared.ts:31,45–50` scans quoted specifiers independently of `from`. `plant` accepts any nonzero exit, including missing environment or tool errors. `/bin/bash` here is 3.2 and lacks `mapfile`. Sheets:75,101 replay changing inventories with one fixed `EXPECT`. Sheets:82 swallows search errors, COMMON:143 exits successfully after `GREW`, and Sheets:83 requires green despite four reported lost blocks and an empty `why-comments-debt.json`. Use commit-specific expectations, syntax-aware checks and explicit status handling. Require a clean control and the intended diagnostic for each plant. Compare why-comment findings against verified baseline IDs.

4. **D0c3e’s proof cannot pass as written.** Sheets:161–164 require a positive archive fixture that still lacks both packages checked by the new verifier (`verify-package-cli.test.ts:230–243,269–285`). The zero-hit search also matches the new deletion assertion itself. Populate the complete fixture, isolate the missing-package case, and scope the search to runtime references. Keeping `stage` preserves the entry point at workflow :87,162,406. Cold release installs at :156–159 still require compatible published pins and workspace build order. Prove the actual macOS and Windows archives.

### Major

- **Parity gaps.** D0c3:118,132 and Sheets:147,153 change resolution. Old dev lookup walks through `apps/node_modules` (`product-telemetry.ts:124`), which the proposed `find apps/website` misses. The new packaged signals fallback accepts an unvalidated ancestor, whereas `product-root.ts:86–100` requires both markers. Preserve the search and root contracts. Static imports also move provider dependency failures outside the caught lazy load at `product-telemetry.ts:239–254`. Resolve Q1 with an explicit failure-parity test.
- **Owner rules and characterization.** Sheets:109,122–123,136–137 retain cross-package module mocking, leave `resolveRuntimeMode` on its one-argument API, retain module-scope bindings, and omit existing checkout overrides in `observability-export.unit.test.ts:24,32–33`. Use the existing `sources` fake, preserve no-argument runtime-mode behavior while adopting the signature, construct bindings at host composition, and migrate every explicit checkout fixture.
- **Unlisted overlap.** `git diff --name-only a7ebde50...origin/wave3/xpkg-c12obs-r12` identifies all three telemetry composition files. That lane changes provider factory options and validator ownership. `wave3/audit2-a` also edits `new-site-agent-plugin-tokens.ts`, a D0c3a importer. INDEX:149–171 omits both and lists the verifier as D0c2-only despite Sheets:163. Serialize and recensus after landing.

### Minor

- Sheets:150,155 should assert the exact retained `app:///x.js` frame and an outside-root `<path>`, following Jini `diagnostics/src/redaction.ts:129–140`. A generic “kept” assertion cannot prove the correct root.

### Over-engineering

- Sheets:138,153–155 move the full provider registry and add commerce to desktop for a loader selecting only observability and product analytics (`product-telemetry.ts:131–148`). Share those two existing validators and let each host compose its contract list.
- Sheets:163 adds a hand-maintained dependency fixture list. Reuse `auditStagedClosure` and compare resolutions from real importers when checking for duplicates.

### Unverified

Actual D0c3 tests, snapshot availability, packaged resolution and smokes, live work beyond fetched refs, and execution token budgets. The five sheet estimates are 120k–220k before CI. Review used roughly 20k tokens and eight minutes.
