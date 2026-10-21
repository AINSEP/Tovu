# SonarJS lint without Docker

Run `npm run quality:sonar` from the repository root. It uses the installed
ESLint/SonarJS dependencies without a server, scanner, Docker or network request.
CI uses `continue-on-error: true` and excludes this report from its gate summary.
The formatter prints file/warning/error totals and counts per firing rule.
Parse/config errors preserve ESLint's nonzero status and include file locations.
No fixes run. This is lint coverage, not the full SonarQube analyzer.

## Shared policy and scope

`policy.mjs` exports `sonarRules`, `sonarSkippedRules` and `sonarSourceConfig`.
All 279 installed SonarJS 4.2.0 rules were reviewed. The flat
`sonarjs.configs.recommended.rules` map is demoted to warnings, preserving options,
and every nonrecommended rule is added except the documented exclusions below.
All bug, security-hotspot and reliability rules are included except the
name-resolution configuration exclusion. Deprecated security rules are retained
for coverage; reassess replacements when upgrading the plugin. Framework rules
remain enabled even when their framework is not used here.

Scope: `apps/*/src` and `content/agent-plugins`, with JS, JSX, MJS, CJS, TS, TSX,
MTS and CTS. Shared globs exclude tests, measurements, mocks, fixtures, declarations,
build output and vendor code. Test-specific rules remain in the policy but cannot
inspect excluded tests. Duplicate strings warn at five occurrences, functions at
nesting depth four and switches at 30 cases. `no-small-switch`, PRNG, cleartext
protocol, credential and regex rules are enabled for human triage, including
rules whose earlier survey found benign matches.

The isolated config loads only SonarJS and a dedicated no-emit TS project with
`allowJs`. It supplies type information for rules such as `no-ignored-return`,
`prefer-immediate-return` and regex rules. It does not run tsc, tests or builds,
but may use more memory than syntax-only lint. The normal root config reuses the
policy without adding typed lint to complexity runs; type-dependent coverage
comes from `quality:sonar`. Existing core/cognitive complexity thresholds, debt
overrides and desktop registration retain precedence. Existing rules outside
production scope, including test relaxations, remain unchanged.

`complexity:strict` was absent in the incoming Tovu manifest; it now follows
Jini's existing convention: CLI overrides to error/10 for core/cognitive
complexity. Pass explicit source paths. CLI overrides still take precedence.

Inspected `@jini-ai/devops` 0.5.5 has no Sonar policy export. The owner authorized
this local definition; import the Jini export once published. The extraction
follow-up is in the local Tovu-to-Jini survey backlog.

## Additional rules outside recommended

`no-commented-code`, `elseif-without-else`, `nested-control-flow`, `too-many-break-or-continue-in-loop`, `no-nested-incdec`, `no-collapsible-if`, `expression-complexity`, `useless-string-operation`, `no-duplicate-string`, `no-sonar-comments`, `prefer-immediate-return`, `no-variable-usage-before-declaration`, `array-constructor`, `no-function-declaration-in-block`, `for-in`, `no-nested-switch`, `no-built-in-override`, `prefer-object-literal`, `web-sql-database`, `no-incorrect-string-concat`, `arguments-usage`, `destructuring-assignment-syntax`, `class-prototype`, `operation-returning-nan`, `values-not-convertible-to-numbers`, `non-number-in-arithmetic-expression`, `declarations-in-global-scope`, `no-inconsistent-returns`, `no-for-in-iterable`, `no-return-type-any`, `os-command`, `bool-param-default`, `no-unsafe-unzip`, `no-intrusive-permissions`, `hidden-files`, `no-mixed-content`, `frame-ancestors`, `confidential-information-logging`, `no-ip-forward`, `unicode-aware-regex`, `aws-iam-all-resources-accessible`.

## Skipped rules

Each name below has the `sonarjs/` prefix in the exported map.

| Rule | Reason |
| --- | --- |
| `no-unused-function-argument` | Required (input, options = {}) signatures retain unused options. |
| `function-name` | React components use PascalCase. |
| `variable-name` | API fields and imported contracts retain their external names. |
| `class-name` | Naming conventions belong to existing formatter/type tooling. |
| `file-name-differ-from-class` | Framework entry filenames need not match exports. |
| `file-header` | No mandatory per-file header template exists. |
| `comment-regex` | No project comment pattern is prescribed. |
| `arrow-function-convention` | Formatting belongs to Biome. |
| `shorthand-property-grouping` | Property ordering is cosmetic. |
| `conditional-indentation` | Indentation belongs to Biome. |
| `no-tab` | Whitespace belongs to Biome; generated fixtures contain tabs. |
| `no-redundant-parentheses` | Parentheses formatting belongs to Biome. |
| `max-lines` | Raw file size is not a standalone quality finding. |
| `max-lines-per-function` | Raw function size is not a standalone quality finding. |
| `cyclomatic-complexity` | Keep the existing core complexity rule and scope thresholds. |
| `no-implicit-dependencies` | Does not resolve the project tsconfig aliases reliably. |
| `no-reference-error` | Mixed browser/Node hosts lack a shared globals contract; TypeScript owns name resolution. |
| `no-undefined-assignment` | Optional properties deliberately use undefined for absence. |
| `no-wildcard-import` | Barrel exports and namespace imports are intentional. |
| `max-union-size` | Discriminated unions routinely exceed the default cap of three. |
| `strings-comparison` | Canonical timestamps and other ordered string values use lexical comparison. |
| `no-require-or-define` | Desktop CommonJS entries intentionally use require. |
| `no-unused-vars` | Already covered by Biome. |
| `unused-import` | Already covered by Biome. |

## Coordinator verification

This dispatch checked syntax and config resolution using existing packages from
the primary checkout. No source lint, tests, installs, builds, Docker or background
processes ran. The scratch workspace has no node_modules. First reconcile the
prior quality-tooling manifest/lockfile changes in an authorized dependency setup,
then run `npm run quality:sonar`. Review parser diagnostics and rule counts before
considering enforcement. Verify complexity gates separately; no green source
baseline is claimed.
