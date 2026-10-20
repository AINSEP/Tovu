# Development scripts

## Quality reports and property tests

`npm run quality:knip` reports unused files, exports, and dependencies with
[Knip](https://knip.dev/features/monorepos-and-workspaces). It preserves Knip's nonzero
exit status locally; `.github/workflows/ci.yml` runs it with `continue-on-error: true`
and excludes it from the gate summary during this report-only rollout. Review each
finding before deleting anything: runtime registration and computed imports need
human verification. No baseline or automatic fixes are applied.

`knip.json` follows the actual package boundaries: root-owned `apps/website`,
`development/scripts`, and `content/agent-plugins/*`; separate admin, desktop and
site-chat packages; and npm's `packages/*` workspaces. The first three directories
have no package manifests, so they belong in the root Knip workspace. Source entries
correspond to package `bin`/`main`/`exports`, Vite HTML/library entries, Electron
preloads, CLI scripts, tests, and plugin manifest `module`/`entry` paths. When adding
or changing a plugin's manifest entry, update the matching explicit path in `knip.json`.
Generated files, dist, coverage/release output, `ADS-memory`, and `AI-Dev-Shop` are ignored.

`npm run quality:properties` runs the four new property suites through the existing
Node/tsx runner. They are also discovered by `npm test` and `test:ci`; the existing
CI Test step is informational. [fast-check](https://fast-check.dev/docs/configuration/)
is pinned in the root devDependencies, where website and shipped-plugin tests run:

| Suite | Properties | Seed |
| --- | --- | --- |
| OAuth endpoint safety | Private IPv4/IPv6 rejection, numeric host spellings, HTTPS normalization, userinfo, explicit plaintext loopback opt-in | 20261020 |
| Consent validation | Copy/CSS bounds, strict full schema, policy link safety, trusted region requirement | 20261021 |
| Forms validation | Descriptor uniqueness/attributes, text bounds, required fields, unknown keys, immutable inputs, honeypot omission | 20261022 |
| Google Workspace helpers | A1/column round trips, title quoting, reversed bounds, bounded contiguous reads, CSV escaping/formula safety/padding | 20261023 |

Each suite logs its seed and runs **150 cases per property** with bounded input sizes,
without network calls or application startup. On failure, fast-check prints the seed,
shrink path, and counterexample. To replay, use the reported seed and `path` in that
suite's `parameters` object and rerun `quality:properties`. Knip and fast-check are
additional signals alongside `check:boundaries` (dependency-cruiser),
`check:secret-scan`, and [SonarJS lint (no Docker)](../sonarjs/README.md).

Implementation dispatch did not run installs, tests, builds, or Knip. Before merging,
the Coordinator must regenerate `package-lock.json` for the exact new devDependencies
and verify `npm ci`, `quality:knip`, and `quality:properties` in an authorized environment.
Until the lockfile is refreshed, `npm ci` will reject the manifest/lockfile mismatch.

## Semgrep (free Community CLI, report-only)

```bash
npm run quality:semgrep                       # full tree; counts by severity/rule
npm run quality:semgrep:test                  # semgrep --test .semgrep
npm run quality:semgrep -- --baseline-commit <merge-base-sha>
node development/scripts/check-immutable-migrations.mjs <PR-base-sha-or-ref>
```

Install the separate CLI with `brew install semgrep` or `pipx install semgrep`.
No npm dependency, login, account, API token, or paid engine is needed. Both npm
commands print that hint and exit 127 if the binary is missing. Scans explicitly
select `--oss-only`, disable metrics/version checks, and fetch public registry rules
over the network. Full scans print counts without printing matched source or
credential strings. Tool/config/parse errors retain a nonzero exit status;
application findings are informational. Local reports use temporary files which
the runner removes on exit; no application or persistent service is started.

`.semgrep.yml` is a **runner input manifest**, written in the JSON subset of YAML.
It combines `p/typescript`, `p/javascript`, `p/nodejs`, `p/secrets`,
`p/owasp-top-ten`, and our local rules. Semgrep does not provide a rule-file include
directive: the dependency-free Node adapter expands this list into repeated
[`--config` arguments](https://semgrep.dev/docs/running-rules#use-multiple-rules-and-rulesets-simultaneously).
Use the npm command, not `semgrep --config .semgrep.yml`. To run only custom rules,
use `semgrep scan --oss-only --config .semgrep/tests --exclude .semgrep/tests .`.
The registry packs can evolve independently of our pinned CLI image.

Each YAML/test pair lives in `.semgrep/tests/` with the same basename so the exact
[`semgrep --test .semgrep`](https://semgrep.dev/docs/writing-rules/testing-rules)
command discovers every rule and its positive/negative annotations recursively.
`provider-errors.yaml` contains two rules sharing the same sources/redactors via
YAML anchors. The application scan excludes these synthetic fixtures explicitly.
`.semgrepignore` excludes dependencies, output, fixtures, generated files,
`ADS-memory`, and `AI-Dev-Shop`; application tests remain in scope for secret checks.

| Rule | Level | Review finding captured |
| --- | --- | --- |
| `react-component-options-param` | error | PascalCase function/arrow returning JSX with a second parameter: React supplies arguments; options belong in props. |
| `no-raw-fetch` | warn | Raw `fetch`, `undici.request`, and Node HTTP(S) request calls bypass guarded outbound HTTP. Includes named request imports/aliases. |
| `no-provider-error-echo` | warn | Caught integration message/body text flows into constructed errors, throws, returns, responses, or logs. |
| `no-as-any` | warn | A TypeScript assertion discards type safety. |
| `no-secret-literals-in-tests` | error | Test string literals contain credential prefixes; construct fake values at runtime. |
| `log-raw-error` | warn | Caught integration error text reaches logging without the existing redactor. |
| `immutable-migrations` | report-only git check | A migration already present at the merge base was edited, deleted, renamed, or replaced; add a forward migration instead. |

**Ownership and limits.** The HTTP owner is
`@jini-ai/platform/http/guarded` (`packages/platform/src/http/guarded/transport.fetch.ts`
in Jini). Tovu's `platform/http/client.ts` delegates to it, and
`platform/oauth/endpoint-safety.ts:createTovuOAuthHttpPorts` adapts the same port.
Only those exact Tovu adapters and Jini's exact pinned transport files are exempt;
browser admin/site-chat/desktop-renderer sources are excluded from the SSRF rule.
Other calls, including direct server test HTTP, are review signals. Computed calls,
destructured global fetch aliases and arbitrary CommonJS aliases are not fully covered.

The two error rules share integration path filters (providers, importers, OAuth,
external MCP, API connections, assistant, and shipped agent plugins). In those
files any caught `.message`, `.body`, `.bodyText`, `.response.body/data`,
`String(error)`, or `.toString()` is untrusted. CE tracks local flow, including
temporary variables, interpolation and object responses; it cannot establish
exception provenance or follow arbitrary wrappers across functions/files. Integration
code outside these paths needs its owner added. Non-provider failures within those
paths can be false positives; typed safe errors require review. Whole-error logging
and uncaught/rejected Promise callbacks are outside this initial rule's coverage.
Sanitizers reuse `redactSecrets`, `redactText`, `redactUserText(...).text`,
`redactSecretShapes(...).text`, `redactDiagnosticSecrets(...).text`, and the existing
`deps.redact` port convention; the rules do not prove a helper's implementation.
Redacted diagnostics still belong in operator logs; use fixed public error copy.

The test-secret rule intentionally detects short prefix-shaped literals, not just
valid credentials. Its only committed positives are short, invalid `FAKE` values
needed to test the detector. Normal application fixtures must join separate pieces
at runtime (for example `["ghp", "_", "FAKE"].join("")`). Constant propagation is
disabled for this rule so runtime fixture construction is not reported.

**Tovu-specific checks.** Semgrep cannot compare historical file contents. The small
git script compares `HEAD` with `git merge-base <base> HEAD`, limits the check to
`apps/website/src/platform/db/migrations/00*.ts` present at that base, disables rename
detection, and flags any changed historical path. New migrations are allowed. It
compares commits, not unstaged edits, and needs full history. A missing/invalid base
is an error, never a clean report.

`admin-route-auth` is deliberately skipped: `server/runtime/composition/modules/core.ts`
mounts `requirePublishTrust` and `requireAdminSession` on `/api/admin` before feature
registrars run. Permissions are commonly checked inside handlers through
`server/inbound/admin-http/authorize-guard.ts:authorizeOrRespond`, or direct
`deps.authorize` calls, rather than a middleware argument at each registration.
A CE per-handler syntax rule cannot prove that cross-file Express registration
order, inherited authentication, or permission coverage; it would flag protected
handlers and could bless a misplaced check. Keep authorization integration tests
and review as the evidence until a registration contract can be checked reliably.

**CI and the factory learns loop.** `.github/workflows/semgrep.yml` uses the
[official Semgrep 1.180.0 container](https://hub.docker.com/layers/semgrep/semgrep/1.180.0/images/sha256-dffc9caeecc924370d30f9187b6edf10949600d3ef5f69ef5c359074d8fc7d2d)
pinned by its multi-platform SHA-256 digest. It checks out PR HEAD with full history,
resolves the merge base from the PR base SHA, and passes `--baseline-commit` for
diff-aware scans. Only the custom-rule tests block; scanning and historical-migration
findings use step-level `continue-on-error: true`. Manual dispatch runs a full scan.
No token, npm install, SARIF upload, application execution, or cloud account is involved.

When review finds a recurring invariant, first inspect its existing owner and the
language/framework protections. Reduce the finding to a minimal failing example,
add a same-basename YAML/fixture pair in `.semgrep/tests`, and place `// ruleid: id`
or `// ok: id` immediately before every positive/negative line. Include a realistic
safe alternative and alias/branch variants; add a narrow owner exception only with
evidence. Run `quality:semgrep:test`, then a full scan and triage noise before accepting
the rule. This turns a reviewed failure into a repeatable check for future changes.

To make findings blocking, first triage the report-only runs, tighten noisy rules,
and agree on the selected rules/severities and treatment of existing debt. Then add
a separate selected-rule invocation with `--error`, remove that step's
`continue-on-error`, and require its job in branch protection. Keep unrelated noisy
packs report-only. Remove `continue-on-error` separately for the migration step when
that policy is approved; its script already exits 1 on violations.

This dispatch did not execute scans, rule tests, installs, builds, or the git check;
the fixtures and CI remain unverified until an authorized run. Shared runner/rule
extraction to `@jini-ai/devops` is recorded in
`ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`: the sibling Jini source
and canonical survey are outside this dispatch's writable roots.

## Coverage of changed source files

```bash
development/scripts/coverage-changed.sh HEAD~1 --out /tmp/tovu-changed-coverage
```

Use a git ref or a Codex job report (`CHANGED FILES:` / `TESTS TO RUN:` blocks) as the first
argument. Git mode includes staged/unstaged differences from that commit and untracked source
under `apps/` and `development/`. Report mode measures exactly its reported source set.
Tests, fixtures, declarations and generated output are excluded and listed. Report `(deleted)`
suffixes and git `D` status produce **deleted — not measured** rows. Missing non-deleted paths
produce warning rows; both are excluded from coverage gaps and do not block other measurements.
All remaining changed source files stay in the denominator: a test that mocks a module does not
cover it. After executed tests, a file with no instrumented hits is **0% / NOT LOADED**. Without
confirmed aggregate execution or surviving singleton coverage it is **NOT RUN**, with unknown
(`null` / N/A) metrics. Surviving singleton images from aborted aggregates are partial diagnostics.

The command discovers tests through static imports (including literal dynamic imports,
re-exports, `require`, `#src`, admin aliases), feature/own `__tests__` directories and report
paths. It ranks relevant report tests first, own directory/feature next, direct one-hop importers
by path proximity next, then wider transitive importers. Standalone report tests are retained.
Only git tracked plus nonignored untracked tests are eligible; `_tmp-*` paths are never selected.
It prints why each test was selected and exact omitted paths. Default cap: **20 tests per changed
file**, `--max-tests N` (1–200). Round-robin allocation serves each file before filling its next
slot. The total cap defaults to **200**; `--max-total-tests N` (1–2000) changes it. A total cap
too small to serve every file emits a warning naming the unserved files.
Computed imports are not statically discoverable.
Missing report tests fail rather than being quietly ignored. Browser E2E paths are reported as
unsupported tool errors; this command does not start browsers or build desktop preloads.

Each test command goes through `ADS-memory/.local-artifacts/test-slots/run-gated.sh`, sequentially,
with one worker and `TOVU_ADMIN_PASSWORD` **unset**. Singleton gate timeout is 600 seconds;
aggregate timeout is twice observed singleton durations plus 60 seconds (minimum 600), or
600 seconds per selected test file when durations are unavailable. Website/server/dev
use Node/tsx coverage with site-chat tsconfig; admin uses its existing Vitest configuration and V8
provider plus a generated exact-file include whitelist; desktop reuses its canonical bare-Node vs
renderer/contracts tsx pass arguments. The gate and the owner `common.md` rules file must exist.

`report.md`, `report.json` and the ready-to-launch **code-only** `fix-prompt.md` appear in `--out`
(default `ADS-memory/.local-artifacts/coverage-changed`). Every invocation creates a fresh `run-*`
subdirectory for raw LCOV, generated admin configs and test logs. It never reads saved
`development/coverage/` output. Reusing `--out` replaces only the three summary files; retained
run directories identify each measurement. Give simultaneous invocations different output roots.

For multiple selected tests on one runner, singleton probes establish which tests recorded real
instrumented hits and one aggregate pass supplies the percentages. Thus the cap bounds unique
test paths, and execution costs up to twice that test set. No branch identities are merged between
the differently scoped probes. Duplicate `SF` records in an aggregate artifact union their hits;
incompatible layouts or dual-instantiation contamination invalidate the measurement. The existing
integrity detector is reused without baseline suppression, also for development source.
If an aggregate aborts or loses sources present in singleton LCOV, surviving whole singleton
images appear as **partial singleton; aggregate incomplete / NOT EVIDENCE**, never false
NOT LOADED zeroes. They cannot authorize code fixes. A gate timeout names the timeout and
completed test points rather than claiming no tests executed; incomplete TAP remains an error.

The report lists line/branch/function percentages, distance in percentage points from 100%,
uncovered LCOV ranges, named functions, branch gap counts/opaque IDs, actual hit provenance and
deterministic advisory triage. `refactor-candidate` means complexity over 9 (AST estimate), hard
runtime/network/process calls, or all selected importing tests using at least four module mocks.
It is an inspection suggestion for trustworthy measured rows, never proof that a gap is
unreachable or exempt from coverage. NOT RUN, missing/deleted and NOT LOADED rows cannot
receive a refactor diagnosis based on static complexity alone. Unknown or failed measurements
are listed for remeasurement in the fix prompt before any production-code fix is proposed.

**Measurement limits:** tsx LCOV positions are instrumented indices, not trustworthy source line
anchors. Its branch IDs cannot identify source arms. Node includes comments/blanks in line totals;
Vitest's source-mapped coverage has a different denominator. Where different runners measure a
file, the tool keeps the most complete *whole* image and retains other artifacts for inspection.
Overall file means include NOT LOADED files at zero and are unknown when any file is NOT RUN;
deleted/missing paths are outside the denominator. Measured hit/total counters are shown
separately per runner because executable counts for unloaded files are unknown. Source changes
during measurement invalidate results only for changed-set files and selected tests.
Other inventoried source/test edits appear as informational notes. Coverage cannot prove assertions or execution in a
serialized browser/process context. Test failure marks all coverage **NOT EVIDENCE**.

The headline explicitly says **no tests ran: reason** when no test executions are confirmed.
Exit: **0** all eligible changed sources have trustworthy 100% lines + branches + functions; **1** gaps, unrun scope or
test failure; **2** tool/input/runner/integrity error. An empty source set exits 0 with zero files
explicitly reported when any explicitly reported tests pass; those tests still run with an empty
coverage include scope. Failed runs still write reports when output creation is possible.

No new dependency: reuses TypeScript, tsx, admin's V8/Istanbul pipeline, desktop TEST_PASSES and
the integrity detector. Installed Istanbul coverage/report APIs do not parse Node LCOV, and
lcov-parse/c8/v8-to-istanbul are absent. The narrow adapter handles the repository's merge and
integrity rules. [diff-cover](https://github.com/Bachmann1234/diff_cover) measures changed *lines*;
a future `--changed-lines` view is useful once source-position accuracy is reliable and would
supplement the whole-file denominator. Pure policy/model are **JINI CANDIDATE** modules; the
sibling Jini checkout is outside this job's writable roots.

Coordinator verification paths (implementation dispatch did not run them):

- `development/scripts/__tests__/coverage-changed-model.test.ts`
- `development/scripts/__tests__/coverage-changed-discovery.test.ts`
- `development/scripts/__tests__/coverage-changed.test.ts`
- `development/scripts/__tests__/coverage-changed-cov3.test.ts` (verbatim trial2 LCOV/TAP fixtures)
