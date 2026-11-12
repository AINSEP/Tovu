**The semgrep.dev registry is blocked in this container (ENV)**, so `--config p/security-audit --config p/typescript
--config p/javascript --config p/nodejsscan` could not be fetched. The scan used the same rules from their sources,
offline, with `--metrics=off`:

| registry pack | offline substitute |
|---|---|
| `p/javascript` | `semgrep-rules/javascript/**` (all rules) |
| `p/typescript` | `semgrep-rules/typescript/**` (all rules) |
| `p/nodejsscan` | njsscan 0.4.3 `rules/semantic_grep/**` (the rule set that pack is built from; `good/` "control present" rules excluded) |
| `p/security-audit` | its JS/TS rules are already inside the two dirs above; plus every rule in `semgrep-rules/{html,generic,bash,dockerfile,yaml,json}` with `metadata.category: security` and `subcategory: audit` (97 rule files) |

So the rule set is a close superset of the four packs for JS/TS (the dirs include a few non-security
correctness/best-practice JS rules the registry packs may leave out; every hit keeps its full rule id, so they
can be filtered) and an approximation for the non-JS part of `p/security-audit`. Rule ids below are shortened to
start at `semgrep-rules.` / `njsscan.` / `rules-audit-other.`. Targets: Tovu `apps packages content`, Jini
`packages/*/src`, git-tracked files, with `--exclude` for tests/`__tests__`/`__mocks__`/fixtures/mocks/e2e/dist/
build/node_modules/vendor/`*.test.*`/`*.spec.*`/`*.d.ts`/stories; `--timeout 30`, `--max-target-bytes 1000000`, `-j 2`.
Paths and rule ids only — no exploit detail.
