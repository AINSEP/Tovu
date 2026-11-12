# Quality audit 2026-11-11 — SEC: floating promises, security scans, accessibility

Report only: nothing in either repo was changed outside `development/cloud/quality-1111/sec/`.
Brief: `development/cloud/quality-1111/BRIEF-SEC.md` + `COMMON.md`. No subagents were used.

- Tovu `a9c1184` (branch content of `cloud/quality-1111`), Jini `f6fa96a`. Container: 4 cores, 16 GB.
- Scope: Tovu `apps/`, `packages/`, `content/`; Jini `packages/*/src`. Skipped: tests, `__tests__`, `__mocks__`,
  fixtures, mocks, `test(s)/`, `e2e/`, dist, build, node_modules, vendor, `.d.ts`, stories, built plugin bundles.
- Every list is complete in its `.tsv` next to this file; this page gives totals and the top 50 of each.
- Raw tool output is in `raw/` (eslint JSON per unit, osv JSON, audit JSON, semgrep JSON).
- Scripts/configs used: `scripts/` (`promises.eslint.config.mjs`, `a11y.eslint.config.mjs`, `run-promises.sh`,
  `run-all-promises.sh`, `run-semgrep.sh`, `build_tsv.py`, `build_results.py`).

## Tool versions

| tool | version | how installed |
|---|---|---|
| Node | v24.22.3 (npm 11.19.1, pnpm 10.33.2 via corepack) | nodejs.org tarball, sha256 checked, `~/.local/node24` |
| eslint | 9.39.1 | pinned, container-only tool dir (scratchpad, `npm install --ignore-scripts`) |
| typescript-eslint / @typescript-eslint/parser | 8.46.4 | same tool dir |
| typescript (driving typed lint, both repos) | 5.9.3 | same tool dir (Jini's own root `tsc` is also 5.9.3) |
| eslint-plugin-jsx-a11y | 6.10.2 | same tool dir |
| osv-scanner | 2.2.2 (osv-scalibr 0.3.1), linux-amd64 release binary, sha256 checked against the release's `SHA256SUMS` | GitHub release |
| OSV database | offline npm `all.zip` downloaded 2026-11-12 ~01:43 UTC | `--offline-vulnerabilities --download-offline-databases` |
| semgrep | 1.95.0 | `pip install --user semgrep==1.95.0` |
| semgrep-rules | `semgrep/semgrep-rules` @ `a5ad1714` (2026-11-10) | git clone (registry blocked, see ENV) |
| njsscan rules (for p/nodejsscan) | njsscan 0.4.3 wheel, `rules/semantic_grep/**` YAML only (64 files, `good/` excluded) | `pip download --no-deps`, unzipped, never installed/executed |
| npm audit / pnpm audit | npm 11.19.1 / pnpm 10.33.2 | read-only, never `audit fix` |

