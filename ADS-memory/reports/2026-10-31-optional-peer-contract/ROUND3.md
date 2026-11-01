Programmer(Execution): Programmer persona for dependency contracts and focused source-guard regressions.

# Required and optional dependency contract — Round 3

Status: requested source contract complete. The changed test file passes all 41 tests, including the real agent-runtime default entry and every real workspace default-entry optional-peer check. Installed/published artifacts and release validation still require the Coordinator follow-up recorded below.

## Inputs, reuse and boundaries

Authority: the Round 3 dispatch decisions D1–D3 and `ROUND2.md`; no separate spec version/hash was supplied. Loaded the mandatory bootstrap and canonical Programmer persona. Architecture chapters 13/14 are absent from this clone, so their canonical `/Users/la/Programming/Tovu/` copies were consulted. The clone's project memory and governance ADR index are also absent. No graph MCP tool is exposed; the local knowledge graph contains no matching guard/optional-peer ownership entries. Current source and manifests supplied the evidence.

Reuse: extended `scripts/check-subpath-isolation.ts`, its existing TypeScript import walker, and the existing devops optional-peer classification helper. No second checker, parser, resolver or additional tooling dependency was introduced. D1–D2 settle the prior ownership/pattern question; the existing guard and object-argument public contracts remain the approved implementation pattern.

No Git writes/commits, builds, installs, servers, lockfile edits or background jobs were performed. Only `scripts/__tests__/optional-peer-contract.test.ts` was run in this round, with the supplied fork caps; every launched test runner exited. No other job's application/admin, site-backup, local-site/smoke or chat display files were changed.

## Delivered behavior

- D1: moved agent-runtime → platform and all other default-entry → optional-peer edges to regular dependencies. The full real-source check originally exposed 167 findings covering 30 distinct owning-package/dependency pairs. Removing the old deferred-module exemption exposed daemon → node-pty as the 31st pair. No new exemption was added; `optionalPeerModules` was removed from the guard, shared manifest type and daemon manifest.
- D2: static imports and re-exports in classified opt-in subpaths remain synchronous and allowed. The green fixture covers static import, static re-export and deferred import. Metadata now names a real public subpath for all 78 runtime optional-peer classifications with reachable subpaths. Examples use the actual exports: `@jini-ai/ui/sketch-editor`, `@jini-ai/ui/lexical-rich-text-editor`, `@jini-ai/ui/html-editor`, and `@jini-ai/sandbox/e2b`. No export was renamed. Type-only peers retain their existing classification and have no runtime edge to guard.
- The real-source test asserts both zero optional-peer findings and that runtime classifications name a reachable non-default public import. Classification never authorizes default-entry reachability, including deferred loads.
- D3: retained Round 2's Sharp error type/cause, asset-cache status/type/cause and deferred ws loading fixes without editing their implementations. Feature-message assertions retain the full owning message after the subpath prefix; libraries now required by D1 are instead checked for a regular dependency declaration. Prior direct error/cause tests remain unchanged.
- Updated only the dependency-contract documentation, including the daemon native row because node-pty actually moved. The unrelated inaccuracies listed below remain untouched.

## Final dependency moves, rounds 1–3

These are all new regular dependencies relative to HEAD. Third-party peer ranges are preserved; Jini edges use `workspace:^`. Each moved peer loses its peer declaration, optional flag and optional classification. Existing required dependencies remain required. Required host-framework peers (`react`, `react-dom`, `vue`, `express`) retain the Round 2 policy.

| Owning package | Moved dependency | Former peer range → regular range | Round |
|---|---|---|---|
| `@jini-ai/agent-runtime` | `@jini-ai/integrations` | `^0.6.10` → `workspace:^` | 1–2 |
| `@jini-ai/agent-runtime` | `@github/copilot-sdk` | `*` → `*` | 1–2 |
| `@jini-ai/agent-runtime` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/agentic` | `zod` | `^3.25.76` → `^3.25.76` | 3 |
| `@jini-ai/chat` | `@jini-ai/agentic` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/chat` | `@jini-ai/db` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/chat` | `@jini-ai/diagnostics` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/chat` | `kysely` | `^0.29.6` → `^0.29.6` | 3 |
| `@jini-ai/cli` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/cli` | `@jini-ai/sidecar` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/cms` | `unpdf` | `^1.8.1` → `^1.8.1` | 1–2 |
| `@jini-ai/cms` | `mammoth` | `^1.12.3` → `^1.12.3` | 1–2 |
| `@jini-ai/daemon` | `smol-toml` | `1.9.1` → `1.9.1` | 1–2 |
| `@jini-ai/daemon` | `@jini-ai/agent-runtime` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/daemon` | `@jini-ai/db` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/daemon` | `@jini-ai/http-kit` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/daemon` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/daemon` | `kysely` | `^0.29.6` → `^0.29.6` | 3 |
| `@jini-ai/daemon` | `node-pty` | `^1.1.0` → `^1.1.0` | 3 |
| `@jini-ai/db` | `kysely` | `^0.29.6` → `^0.29.6` | 3 |
| `@jini-ai/diagnostics` | `jszip` | `^3.10.1` → `^3.10.1` | 3 |
| `@jini-ai/http-kit` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/mcp` | `@cfworker/json-schema` | `^4.1.1` → `^4.1.1` | 1–2 |
| `@jini-ai/mcp` | `@modelcontextprotocol/sdk` | `^1.29.0` → `^1.29.0` | 1–2 |
| `@jini-ai/mcp` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/platform` | `undici` | `^7.25.0` → `^7.25.0` | 3 |
| `@jini-ai/registry` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/server` | `@jini-ai/agent-runtime` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/server` | `@jini-ai/daemon` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/server` | `@jini-ai/db` | `^0.6.13` → `workspace:^` | 3 |
| `@jini-ai/server` | `@jini-ai/http-kit` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/server` | `@jini-ai/registry` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/server` | `@jini-ai/sidecar` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/sidecar` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/ui` | `@jini-ai/agentic` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/ui` | `@jini-ai/platform` | `^0.6.10` → `workspace:^` | 3 |
| `@jini-ai/ui` | `micromark` | `^4.0.0` → `^4.0.0` | 3 |
| `@jini-ai/ui` | `micromark-extension-gfm` | `^3.0.0` → `^3.0.0` | 3 |
| Tovu desktop | `@jini-ai/integrations` | undeclared → `^0.6.15` | 1–2 |

Jini: 38 new regular edges total, comprising seven from rounds 1–2 and 31 from round 3. There are 100 remaining optional declarations, each classified. The native installation cost of node-pty now follows D1; the README row reflects that move.

## Files changed in Round 3

Jini: these 27 manifests plus `packages/README.md`, `packages/devops/src/packaging/electron/optional-peers.ts`, `scripts/check-subpath-isolation.ts`, and `scripts/__tests__/optional-peer-contract.test.ts` (31 files total).

```text
packages/admin/package.json
packages/agent-plugins/package.json
packages/agent-runtime/package.json
packages/agentic/package.json
packages/capability-providers/package.json
packages/chat/package.json
packages/cli/package.json
packages/cms/package.json
packages/commerce/package.json
packages/daemon/package.json
packages/db/package.json
packages/devops/package.json
packages/diagnostics/package.json
packages/http-kit/package.json
packages/infra/package.json
packages/integrations/package.json
packages/mcp/package.json
packages/platform/package.json
packages/plugins/package.json
packages/registry/package.json
packages/sandbox/package.json
packages/search/package.json
packages/server/package.json
packages/sidecar/package.json
packages/ui/package.json
packages/user-management/package.json
packages/vibecoding/package.json
```

Tovu: this report only. Test captures and machine-readable discovery/move evidence are in ignored `ADS-memory/.local-artifacts/optional-peer-contract-round3/`.

## Red → green evidence

Fresh command, from `prov2-jini`:

```bash
node_modules/.bin/vitest run scripts/__tests__/optional-peer-contract.test.ts --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1 --testTimeout=120000
```

Observed output:

```text
Baseline, before Round 3:
  1 failed | 34 passed (35)
  agent-runtime default source entry: eight @jini-ai/platform load-site findings

After adding source/default and opt-in regressions, before production changes:
  3 failed | 36 passed (39)
  deferred-module exemption wrongly accepts default-path dynamic driver import
  agent-runtime: eight findings
  full real workspace: 167 optional-peer findings

After the 31 dependency moves and strict default guard, before subpath metadata:
  1 failed | 40 passed (41)
  agent-runtime default source entry passes
  all real default entries have zero optional-peer findings
  78 runtime classifications lack their opt-in public import

Final:
  ✓ scripts/__tests__/optional-peer-contract.test.ts (41 tests)
  ✓ agent-runtime default source entry never reaches an opt-in peer
  ✓ all real default entries keep runtime libraries required and classify opt-in subpaths
  Test Files  1 passed (1)
       Tests  41 passed (41)
```

The final tests also prove unclassified peer rejection, default optional-peer rejection, opt-in static import/re-export acceptance, and that deferred-module metadata cannot bypass the default rule. Existing neutral-driver and adapter-layer tests in this file still pass. No test was deleted. Assertions changed only where D1–D2 superseded the earlier contract (deferred exemptions, required libraries and subpath-prefixed classification text). `git diff --check` passed in both repos.

These are source-contract results, not a claim that every unrelated domain-isolation rule or installed release closure is green. No Tovu test was rerun in Round 3 because no Tovu behavior/test file changed.

## Architecture and function-quality checks

Architecture audit: PASS for D1–D3. Generic ownership stays in Jini devops/scripts/core; Tovu remains a thin packaging consumer. No public loading API was made async, no provider-specific abstraction was added, and no optional boundary escapes the default-entry guard.

| Assessed changed unit | Disposition | Findings | Local fix |
|---|---|---|---|
| `auditSubpathIsolation.checkDefaultLoad` | NO_RECORDED_FINDINGS | none remaining | removed deferred-module bypass |
| Optional-peer manifest contract | NO_RECORDED_FINDINGS | none remaining | removed obsolete exemption field |

`checkDefaultLoad` retains its private enclosing traversal signature for compatibility; exported functions keep the two-object convention. Its unchanged file-owner cache bounds owner lookup to one linear package search per distinct file; later lookups are constant time. Time/space rationale is documented beside it. It has four guard decisions and no loop; manual review found complexity within the requested ceiling of 10. No metric/test machinery was restored.

Zero-findings second pass checked variable names, owning-package attribution, static versus deferred loads, transitive reachability, type-only edges, message preservation and optional metadata removal. Adversarial fixture: a default barrel re-exporting an optional feature remains rejected even when legacy deferred-module metadata claims an exemption, for both static and deferred imports. No new external I/O or runtime lifecycle was introduced. Coverage percentages were not collected under the test-only command restriction; focused fixtures directly cover default/subpath, optional/required and classified/unclassified outcomes.

Pre-completion: D1–D3 re-read; current real source tested; no test removed; scope checked; only the installed/release follow-up below remains. Runtime server self-validation is not required for these manifest/guard changes and was not run under the explicit no-server/no-build instruction.

## Remaining release follow-up and logged inaccuracies

Coordinator must rebuild/publish the changed Jini artifacts and refresh the consumer lockfiles through the normal release workflow. Round 2's installed Tovu peer test failed because the installed devops artifact lacks `optionalPeerContractProblems`; source edits cannot refresh that artifact, and builds/installs are forbidden here. That installed failure was not hidden by a source fallback. No lockfile or generated dist output belongs in this dispatch's commit lists.

Unrelated documentation inaccuracies from Round 2 remain: the native explanation omits Sharp/Argon2 and calls everything else pure JS; the optional examples list undeclared `recharts`; the global ESM-only statement conflicts with sandbox's existing CJS build. Inherited staging findings also remain untouched: package-name staging can retain the wrong nested version, and the declared-closure inventory only covers top-level packages. These are logs, not extra work added to this dispatch.

## EXACT commit file lists — rounds 1+2+3

Only the paths below belong to this work. They preserve the Round 2 curated lists and add this report. Exclude all unrelated concurrent edits, raw logs, generated output and toolkit bootstrap files. No commit was made. Both repos remain on `merge-1029`.

Jini (`prov2-jini`):

```text
packages/README.md
packages/admin/package.json
packages/agent-plugins/package.json
packages/agent-runtime/package.json
packages/agentic/package.json
packages/analytics/package.json
packages/capability-providers/package.json
packages/capability-providers/src/adapters/ws/__tests__/optional-peer.test.ts
packages/capability-providers/src/adapters/ws/index.ts
packages/chat/package.json
packages/cli/package.json
packages/cms/package.json
packages/cms/src/media/__tests__/image-transformer.sharp.test.ts
packages/cms/src/media/document-ingress.ts
packages/cms/src/media/image-transformer.sharp.ts
packages/cms/src/media/sanitize-svg.ts
packages/commerce/package.json
packages/core/package.json
packages/core/src/__tests__/optional-peer.test.ts
packages/core/src/optional-peer.ts
packages/daemon/package.json
packages/daemon/src/__tests__/terminal-optional-peer.test.ts
packages/daemon/src/agent-executor/codex/isolation.ts
packages/daemon/src/store/event-log/sqlite-kernel.ts
packages/daemon/src/terminal-session.ts
packages/db/package.json
packages/devops/README.md
packages/devops/package.json
packages/devops/src/packaging/electron/__tests__/staged-closure.test.ts
packages/devops/src/packaging/electron/__tests__/typescript.test.ts
packages/devops/src/packaging/electron/entry.ts
packages/devops/src/packaging/electron/optional-peers.ts
packages/devops/src/packaging/electron/ports.ts
packages/devops/src/packaging/electron/staged-closure-node.ts
packages/devops/src/packaging/electron/staged-closure.ts
packages/devops/src/packaging/electron/typescript.ts
packages/diagnostics/package.json
packages/http-kit/package.json
packages/infra/package.json
packages/integrations/package.json
packages/integrations/src/media-providers/sqlite-driver.adapter.ts
packages/mcp/package.json
packages/mcp/src/federation/adapter.http.ts
packages/platform/package.json
packages/platform/src/__tests__/asset-cache-dispatcher.test.ts
packages/platform/src/__tests__/asset-cache-optional-peer.test.ts
packages/platform/src/asset-cache.adapter.ts
packages/platform/src/asset-cache.ts
packages/plugins/package.json
packages/registry/package.json
packages/sandbox/package.json
packages/search/package.json
packages/server/package.json
packages/sidecar/package.json
packages/ui-kit/package.json
packages/ui/package.json
packages/ui/src/renderers/shiki.ts
packages/user-management/package.json
packages/user-management/src/server/hasher.ts
packages/vibecoding/package.json
scripts/__tests__/check-package-layers.test.ts
scripts/__tests__/check-subpath-isolation.test.ts
scripts/__tests__/optional-peer-contract.test.ts
scripts/__tests__/walk-imports.test.ts
scripts/check-driver-isolation.ts
scripts/check-package-layers.ts
scripts/check-subpath-isolation.ts
scripts/lib/publish-hygiene-self-test.ts
scripts/lib/walk-imports.ts
vitest.config.ts
```

Tovu (`prov2-tovu`):

```text
ADS-memory/reports/2026-10-31-optional-peer-contract/REPORT.md
ADS-memory/reports/2026-10-31-optional-peer-contract/ROUND2.md
apps/desktop/package.json
apps/desktop/scripts/verify-package.ts
apps/desktop/scripts/verify-staged-closure.ts
apps/desktop/src/jini-mcp-peers.test.ts
apps/desktop/src/jini-mcp-peers.ts
apps/desktop/src/staged-closure.test.ts
apps/desktop/src/verify-package-cli.test.ts
apps/desktop/src/verify-package-cli.ts
ADS-memory/reports/2026-10-31-optional-peer-contract/ROUND3.md
```

`apps/desktop/src/jini-mcp-peers.ts` is a deletion. The removed untracked staging script and earlier changes restored to HEAD produce no commit entry. All listed non-report paths were checked for a remaining diff or untracked file; no other task's file was added to these lists.

Suggested next assignee: Coordinator for review, then release/artifact/lock regeneration and the installed-package verification gate. Round 3 has no remaining source-contract blocker.
