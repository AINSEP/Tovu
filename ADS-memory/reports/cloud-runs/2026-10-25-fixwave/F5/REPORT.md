# F5 — Jini fix wave: Stryker L10 + RUN 2 (agent-plugins, cms plugin-export)

Jini branch **`cloud/fixwave-1025-F5`** (from `origin/cloud/overnight-1024-jini` 3e2fbae8 + cherry-pick of run-2's Part 0 exports.ts tests), head **3eb7436e**, 38 commits, all pushed (no 403). Node 24.22, Stryker 9.6.1 + vitest-runner, vitest 2.1.9.

## 1. Headline
- **Source bugs: 1 found, 1 fixed** (analytics, §2). No product behaviour changed otherwise.
- **Tests:** ~203 test declarations added (`test(`/`it(` lines; many are `test.each` tables → several hundred cases), **0 removed, 0 weakened, no excludes/ignores/thresholds touched**. agent-plugins **92 files / 1465 passed → 107 files / 1903 passed** (+438 test cases; 2 skipped, pre-existing; measured at HEAD 3eb7436e). Final suites: analytics 172 ✓, cli 582 ✓, artifacts 242 ✓, desktop-host 667 ✓ (+1 skipped, pre-existing), diagnostics 830 ✓, vibecoding 304 ✓, cms 4238 ✓ + 1 ✗ (**pre-existing** `subpath-isolation.contract.test.ts`, listed in COMMON.md known failures).
- **Coverage (touched non-UI sources):** all at **100 % lines+branches** except cms `plugin-export.ts` (97.4 % branches — two unreachable defensive arms, §5). agent-plugins `automatic-use.ts` 99.25 → 100 % branches. (Before: every touched agent-plugins file was already 100 % lines — the gaps here were assertion strength, not execution.)
- **CCN > 10 in scope:** 2 → **0** (analytics `ipMatchesRange` 13, agent-plugins `automatic-use load()` 11; both split by extraction, suites green before and after). Scanned: agent-plugins, analytics, diagnostics, desktop-host, artifacts, cli, vibecoding `src` (non-test, non-tsx) + cms plugin-export.ts.
- **Stryker (fresh, `incremental:false` = --force equivalent), before → after:**
  - agent-plugins (28 files/ranges, 2394 mutants): **86.47 % → 93.86 %** (table §3).
  - cms `plugin-export.ts`: **85.21 % → 96.45 %** (25 → 6 survivors).
  - L10 (before = L10 report numbers; after = fresh run): analytics `ingest.ts` 87.5 → **94.62 %**; diagnostics `redaction.ts` 84.7 → **100 %**, `request-guard.ts` 94.3 → **97.53 %**, `secrets-only.ts` 86.6 → **87.99 %**; desktop-host `render-service.ts` 67.1 → **80.0 %**; cli `prompt.ts` 81.6 → **86.4 %**, `redact.ts` 87.5 → **96.88 %**; artifacts `manifest.ts` 89.2 → **96.40 %**.
- **Run-2 staleness (Codex's concern) confirmed for one file:** `capability-declarations.ts` re-scored fresh on the unchanged base = **93.85 %**, not run-2's 76.9 %. cms plugin-export re-scored identically (85.21 %), so that one was not stale.
- Wall ≈ 1 h 55 m (21:34–23:29Z). Tokens ≈ 0.5 M (rough). No cap hit.

## 2. Source bug (failing test → fix)
**`@jini-ai/analytics` `ipMatchesRange`: a malformed excluded-IP range excluded EVERY visitor.** `"10.0.0.0/"` (`Number("") === 0`) and `"10.0.0.0/-1"` (`prefix <= 0`) were read as `/0`, so one typo in the operator's `excludedIpRanges` setting silently dropped all analytics (Tovu's `config.settings.ts` passes that list through `toStringArray`, no validation). Failing test **aec57645** → fix **2bdd4d6d**: prefix must be 1–2 digits, 0–32 (`/ 8`, `/33`, `/-1`, `/`, `/8x` never match; every valid range unchanged; 168/168). Then **cc55164b** extracted `parseIpv4Cidr` to bring the function to CCN ≤ 10.
Not changed (observation for the owner): agent-plugins `normalizePackageEntryPath("./")` returns `"./"` (only `"."` is refused as the root); containment still holds (resolves to the root itself), refusing it could break archives with a `./` directory entry — pinned as-is in a test with a comment.

## 3. Per-file tables
### agent-plugins (before = pre-F5 tests on a sibling copy; after = HEAD a254cdd1 tests)
| file (mutated range) | mutants | before score (surv) | after score (surv) |
|---|---|---|---|
| src/admin-surfaces/capability-declarations.ts | 130 | 93.85 % (8) | **100.00 %** (0) |
| src/admin-surfaces/host-validator.ts | 134 | 87.31 % (17) | **99.25 %** (1) |
| src/admin-surfaces/settings-value.ts | 61 | 90.16 % (6) | **98.36 %** (1) |
| src/admin-surfaces/surface-capabilities.ts | 242 | 92.15 % (19) | **97.11 %** (7) |
| src/admin-surfaces/surface-client.ts | 263 | 87.45 % (33) | **96.96 %** (8) |
| src/admin-surfaces/surface-handlers.ts | 187 | 91.98 % (15) | **96.26 %** (7) |
| src/folder-zip-node.ts | 72 | 90.41 % (7) | **91.67 %** (6) |
| src/folder-zip.ts | 95 | 95.79 % (4) | **97.89 %** (2) |
| src/lifecycle/activation.ts | 5 | 0.00 % (5) | **20.00 %** (4) |
| src/lifecycle/bundled-digests.ts | 141 | 78.72 % (30) | **87.94 %** (17) |
| src/lifecycle/bundled-source-archive.ts | 72 | 84.72 % (11) | **91.67 %** (6) |
| src/lifecycle/capability-projection.ts | 34 | 70.59 % (10) | **79.41 %** (7) |
| src/lifecycle/install.ts | 5 | 0.00 % (5) | **20.00 %** (4) |
| src/lifecycle/installed-package-roots.ts | 64 | 87.50 % (8) | **100.00 %** (0) |
| src/lifecycle/node.ts | 38 | 78.95 % (8) | **97.37 %** (1) |
| src/lifecycle/package-paths.ts | 68 | 77.94 % (15) | **95.59 %** (3) |
| src/lifecycle/persistent-state.ts | 29 | 72.41 % (8) | **100.00 %** (0) |
| src/lifecycle/resolve-agent-plugin-refs.ts | 5 | 0.00 % (5) | **20.00 %** (4) |
| src/lifecycle/retire-bundled.ts | 5 | 0.00 % (5) | **20.00 %** (4) |
| src/lifecycle/search.ts | 5 | 0.00 % (5) | **20.00 %** (4) |
| src/lifecycle/seed-bundled.ts | 53 | 77.36 % (12) | **84.91 %** (8) |
| src/lifecycle/set-enabled.ts | 26 | 65.38 % (9) | **80.77 %** (5) |
| src/lifecycle/skill-file-reader.ts | 185 | 80.54 % (36) | **89.73 %** (19) |
| src/lifecycle/tools/capabilities.ts | 139 | 95.68 % (6) | **98.56 %** (2) |
| src/lifecycle/tools/projection.ts | 268 | 91.42 % (23) | **93.28 %** (18) |
| src/lifecycle/trusted-plugin-files.ts | 5 | 0.00 % (5) | **20.00 %** (4) |
| src/lifecycle/uninstall.ts | 17 | 58.82 % (7) | **70.59 %** (5) |
| src/manifest.ts | 46 | 95.65 % (2) | **100.00 %** (0) |
| **all** | 2394 | 86.47 % | **93.86 %** |

The 1-of-5 rows (`activation.ts`, `install.ts`, … memo lines 869-873 etc.) are a **Stryker artifact, not missing tests** — see §4 item 1.
### cms / L10
| file | before | after | survivors left (kind) |
|---|---|---|---|
| cms widgets/html/plugin-export.ts | 85.21 % (25) | **96.45 %** (6) | 79 props-in-URL arm unreachable (HOST_URL_SLOT refuses first); 94 ×2 sourceCodeLocation always present; 108 `#comment`→true equivalent; 137 typeof (Number.isInteger already refuses); 152 `!port` (caught by try) |
| analytics ingest.ts | 87.5 % (L10) | **94.62 %** (20) | mostly equivalent filter/split variants; email-PII regex quantifiers |
| diagnostics redaction.ts | 84.7 % | **100 %** | — |
| diagnostics web-evidence/request-guard.ts | 94.3 % | **97.53 %** (7→ fixed 1 more after the run) | 60 MiB default arithmetic, catch blocks |
| diagnostics core/secrets-only.ts | 86.6 % | **87.99 %** (61) | vendor-regex details (77, 82, 92-146), code-token scanner internals — NOT DONE |
| desktop-host render-service.ts | 67.1 % | **80.0 %** (14) | `settled` guards / `{once:true}` / `timer != null` — equivalent (documented in source comments) |
| cli prompt.ts / redact.ts | 81.6 / 87.5 % | **86.4 / 96.88 %** | stdin pause/destroy optional-chaining, double-settle guard (defensive) |
| artifacts manifest.ts | 89.2 % | **96.40 %** (10) | taxonomy branch details |
Survivor lists: `data/survivors-after.txt`.

## 4. Anti-patterns seen most (feed AI Dev Shop)
1. **Stryker reports an import-breaking mutant as SURVIVED.** Mutating a memoised `create*Module` to return `undefined` makes `test-support.ts` throw at import, vitest collects **0 tests**, and the vitest-runner counts the mutant "Survived" (probe: `Ran 0.20 tests per mutant`; hand-mutating `activation.ts:871` to `if (false)` fails the suite at collection). Any score that includes module-scope factory code is pessimistic; treat "Survived with 0 tests run" as killed-by-crash. (Also: perTest dry-run counts 1028/1714 tests vs vitest's 1465/1857 — that is Stryker's related-test filter, consistent before/after, not lost tests.)
2. **Guard tests that break several fields at once** (host-validator, surface-client, plugin-export): one malformed message refuted, each individual check unproven. Fix: valid baseline + `test.each` of one-field-broken variants, asserting the exact verdict.
3. **Defence-in-depth masks removal of the inner guard** (`startsWith('//')` in plugin-export was hidden by the fragment policy; `relative !== '..'` by the walk). Fix: assert WHICH error (message) the specific guard raises.
4. **Regex tables missing anchors/quantifier edges** (capability-declarations, surface-capabilities, redaction, failure codes, state keys): fix = leading/trailing junk, `\n`, max, max+1, case.
5. **Boundary pairs missing** (byte caps, file counts, 16 KiB, 64/65 chars, depth): fix = N and N+1.
6. **Equivalent-mutant hot spots worth a comment rather than a test:** `isSymbolicLink` after `lstat` (vibecoding store), raw-size pre-checks dominated by the final zip-size check, emptied `catch` that falls through to a shape check returning the same empty value.

## 5. NOT done
- diagnostics `secrets-only.ts` vendor-regex survivors (61) beyond the entropy rules; vibecoding `store.ts` corrupt-state validators (L10 §8 #2) and its coverage (94.8 % lines / 86.3 % branches — source not edited, so outside "touched"); L10 admin/desktop-host Electron adapters, cli flags/main/errors, analytics forwarding; run-2 `install.ts` (43 survivors), `activation.ts`, `installed-package-index.ts`, `automatic-use.ts`, `trusted-plugin-files` `orderByPluginId` sort.
- cms plugin-export.ts lines 79/95 left uncovered on purpose (unreachable defensive arms; brief forbids non-CCN/non-port refactors).
- Re-score coverage of late commits: agent-plugins after-run = HEAD a254cdd1 (includes every agent-plugins test commit); L10 second pass includes analytics 68dfd905, desktop 2a513ae3, cli 4867f1c8, artifacts e165bd9c; the diagnostics after-run predates 3eb7436e (one more request-guard kill not re-measured).
- No Tovu changes (lane is Jini-only).

## 6. Commits (Jini `cloud/fixwave-1025-F5`, oldest first)
- dd36c824 test(agent-plugins): close Stryker exports.ts gaps
- 803123e4 test(agent-plugins): host-validator postMessage guard — each envelope field broken alone
- d7fc7457 test(cms): plugin-export guards pinned by their own error — '//' redirect, own-key slots, quoted attrs, admission
- 99aa2733 test(agent-plugins): package-paths containment arms + lifecycle module memoisation identity
- 2d7ef642 test(agent-plugins): capability-declarations grammar tables (connection id, field, callback, config, adapter, forms) + caps
- 4312de8f test(agent-plugins): surface-client message guards — response/failure/theme fields broken alone, token grammar, height de-dup
- 957a9056 test(agent-plugins): skill-file-reader guards — each path rule, control-byte classes, BOM, flat sort, depth 32/33, read error
- efe5b441 test(agent-plugins): credential scan — JSON-escaped token leak, exact 256-node error scan limit, state-key grammar, limiter forwarding
- 8f78b617 test(vibecoding): store refuses writes through in-root symlinked files and parent folders
- 91b77064 test(diagnostics): request-guard default-deny options and exact byte-budget edge
- fd122779 test(diagnostics): redaction grammar tables — URL query names/separators, bare-pair boundaries, auth schemes
- 3d2dd706 test(desktop-host): withRenderTimeout settling paths — timeout without signal, signal without timeout, abort clears timer
- aec57645 test(analytics): IP bucket table + CIDR edges — FAILING: empty/negative prefix excludes every visitor
- 2bdd4d6d fix(analytics): a malformed excluded-IP prefix ('/', '/-1', '/ 8', '/33') no longer matches every visitor
- bce4b8eb test(artifacts): manifest boundaries — plain-object guard, N/N+1 lengths, drive/traversal rules by exact error
- 3be0b790 test(cli): exact stdin/file byte caps (UTF-8 bytes), stdin release on refusal, sanitize depth/entry edges
- 2575ab7e test(diagnostics): unlabeled-key entropy check — each refusal rule alone (digit, letter, anchors, dotted name)
- 04b9195b test(agent-plugins): non-ENOENT/ESRCH faults of every shape propagate; revision folder grammar edges; node effects forwarding
- 56587bff test(agent-plugins): persistent-state forwards hostname/token/clock ports into the lock; migration quarantines unparsable ids with parser errors
- 810f5cc9 test(agent-plugins): installed mcp.json read honours plugin.json version; unparsable inputs are empty not thrown
- fa5e279b test(agent-plugins): settings values — scalar kinds, one bad item among good, depth and 16 KiB edges
- eb395468 test(agent-plugins): surface-capabilities grammars — scope-set ids, attempt ids, safe codes 64/65, start-param shape, callback-field filter
- b2607534 test(agent-plugins): surface-handlers failure-code grammar table
- cc55164b refactor(analytics): ipMatchesRange CCN 13 -> <=10 by extracting parseIpv4Cidr (behaviour-preserving)
- f0c26f43 refactor(agent-plugins): automatic-use load() CCN 11 -> <=10 by extracting earlyLoadStatus (behaviour-preserving)
- d11f8f79 test(agent-plugins): load cancelled during consent stops before resolving (automatic-use.ts -> 100% branches)
- 2013ded5 test(agent-plugins): bundled-digest ledger edges — hostile shapes, grammar anchors, double-seed verdicts, narrowing precondition
- c9357655 test(agent-plugins): projection generation reuse compares additional tools (identity, order, count) and every executable tool
- 1790ef88 test(agent-plugins): folder zippers exact zip-size limit, UTF-8 flag 0x7f/0x80, entry cap 4096/4097, stable order; isMcpManifest null shapes
- 4a70b5a1 test(agent-plugins): bundled source archive — sorted packing, 2048/2049 cap, magic-only archive, anchored entry headers
- ce383657 test(agent-plugins): an unrelated host-incompatible plugin never blocks enabling another; refusal names the plugin
- 81a85c6e test(agent-plugins): confirmed uninstall preview compares digests as a set (order-independent)
- a254cdd1 test(agent-plugins): seeding — non-file plugin.json skipped, sorted order, ledger digests, seeded enablement
- 68dfd905 test(analytics): IPv6 single-colon edge groups and per-octet / prefix-suffix CIDR rows
- 2a513ae3 test(desktop-host): signal-only render aborts (no timeout) — closes render-service.ts:105 survivor
- 4867f1c8 test(cli): body stdin reader — exact cap across string/Buffer chunks, destroy on refusal and on abort
- e165bd9c test(artifacts): persisted-manifest version/entry fallback and exact 16 KiB metadata edge
- 3eb7436e test(diagnostics): a refused subresource does not mark the navigation refused (request-guard.ts:271)

F5 DONE 2026-10-25T23:24Z — wall ≈ 1 h 55 m, ≈ 0.5 M tokens (rough).
