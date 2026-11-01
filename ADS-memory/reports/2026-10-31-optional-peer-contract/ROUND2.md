Programmer(Execution): Programmer persona for dependency contracts, guarded load sites, and focused regressions.

# Required and optional peer contract Round 2 handoff

Status: partial, with unresolved blockers. The install-size over-correction and requested staging trims are corrected. Default-entry ownership and the remaining static optional-library imports still need Coordinator resolution; the complete requested runtime contract is not claimed finished.

The supplied Round 2 brief and owner policy are the authority. The governing bootstrap and Programmer persona were loaded. Architecture chapters 13/14 are absent from this clone, so their canonical Tovu copies were read. No graph MCP tools were exposed; the available local knowledge index had no relevant loader/packaging owner entries. Direct manifests, source chains and HEAD comparisons supplied the evidence. No Git writes, commits, installs, servers, workspace builds, or lockfile edits were performed by this dispatch. Test children exited.

## Dependency moves retained

These are the complete new regular production dependencies relative to HEAD. Original version ranges are retained; workspace package edges use the existing workspace convention.

| Package | Dependencies |
|---|---|
| `@jini-ai/agent-runtime` | `@jini-ai/integrations`, `@github/copilot-sdk` |
| `@jini-ai/cms` | `unpdf`, `mammoth` |
| `@jini-ai/daemon` | `smol-toml` |
| `@jini-ai/mcp` | `@cfworker/json-schema`, `@modelcontextprotocol/sdk` |
| Tovu desktop | `@jini-ai/integrations` (`^0.6.15`) |

Host frameworks remain normal required peers, rather than dependencies. Their peer ranges match HEAD:

| Package | Required host peers |
|---|---|
| `@jini-ai/admin` | `react`, `react-dom` |
| `@jini-ai/chat` | `react`, `react-dom` |
| `@jini-ai/cms` | `express` |
| `@jini-ai/commerce` | `express`, `react` |
| `@jini-ai/core` | `express` |
| `@jini-ai/daemon` | `express` |
| `@jini-ai/http-kit` | `express` |
| `@jini-ai/server` | `express` |
| `@jini-ai/ui` | `react`, `react-dom` |
| `@jini-ai/ui-kit` | `react`, `react-dom`, `vue` |
| `@jini-ai/user-management` | `react`, `react-dom` |
| `@jini-ai/vibecoding` | `react`, `react-dom` |

All other formerly optional peers retain HEAD's peer ranges and optional metadata. There are 131 restored or retained optional declarations, each with a `jini.optionalPeers` feature and “could not load” message:

| Package | Optional peers |
|---|---|
| `@jini-ai/admin` | `@jini-ai/agentic`, `@jini-ai/ui`, `@jini-ai/ui-kit`, `@jini-ai/agent-plugins`, `@jini-ai/cms`, `@jini-ai/core` |
| `@jini-ai/agent-plugins` | `yauzl`, `@jini-ai/platform`, `@cfworker/json-schema`, `semver` |
| `@jini-ai/agent-runtime` | `@jini-ai/platform` |
| `@jini-ai/agentic` | `@jini-ai/protocol`, `zod`, `@jini-ai/core` |
| `@jini-ai/analytics` | `@jini-ai/agent-runtime` |
| `@jini-ai/capability-providers` | `better-sqlite3`, `ws`, `@jini-ai/platform` |
| `@jini-ai/chat` | `@jini-ai/db`, `kysely`, `better-sqlite3`, `@electric-sql/pglite`, `pg`, `@ag-ui/core`, `@mcp-ui/client`, `@radix-ui/react-checkbox`, `@radix-ui/react-label`, `@radix-ui/react-radio-group`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `@jini-ai/agent-runtime`, `@jini-ai/agentic`, `@jini-ai/protocol`, `@jini-ai/ui`, `@jini-ai/diagnostics` |
| `@jini-ai/cli` | `@jini-ai/platform`, `@jini-ai/sidecar` |
| `@jini-ai/cms` | `sharp`, `kysely`, `@jini-ai/db`, `parse5`, `@jini-ai/http-kit`, `dompurify`, `jsdom`, `@jini-ai/platform` |
| `@jini-ai/commerce` | `@jini-ai/db`, `kysely`, `@jini-ai/agentic`, `@jini-ai/ui`, `@jini-ai/cms` |
| `@jini-ai/daemon` | `node-pty`, `@jini-ai/db`, `kysely`, `better-sqlite3`, `@electric-sql/pglite`, `pg`, `@jini-ai/http-kit`, `@jini-ai/agent-runtime`, `@jini-ai/platform` |
| `@jini-ai/db` | `better-sqlite3`, `@electric-sql/pglite`, `pg`, `kysely`, `@jini-ai/platform` |
| `@jini-ai/devops` | `parse5`, `typescript`, `@jini-ai/platform`, `undici` |
| `@jini-ai/diagnostics` | `jszip` |
| `@jini-ai/http-kit` | `@jini-ai/platform` |
| `@jini-ai/infra` | `@jini-ai/db` |
| `@jini-ai/integrations` | `@jini-ai/db`, `better-sqlite3`, `@jini-ai/platform`, `@jini-ai/oauth`, `@cfworker/json-schema` |
| `@jini-ai/mcp` | `@jini-ai/platform` |
| `@jini-ai/platform` | `undici`, `hast-util-from-parse5`, `hast-util-to-mdast`, `mdast-util-to-markdown`, `mdast-util-gfm-table`, `parse5` |
| `@jini-ai/plugins` | `@jini-ai/platform`, `semver`, `kysely`, `@jini-ai/db` |
| `@jini-ai/registry` | `better-sqlite3`, `@jini-ai/db`, `@jini-ai/platform` |
| `@jini-ai/sandbox` | `@e2b/code-interpreter` |
| `@jini-ai/search` | `@jini-ai/agent-plugins` |
| `@jini-ai/server` | `better-sqlite3`, `@jini-ai/agent-runtime`, `@jini-ai/daemon`, `@jini-ai/http-kit`, `@jini-ai/sidecar`, `@jini-ai/db`, `@jini-ai/chat`, `@jini-ai/registry`, `@jini-ai/platform`, `kysely` |
| `@jini-ai/sidecar` | `@jini-ai/platform` |
| `@jini-ai/ui` | `@tanstack/react-query`, `@excalidraw/excalidraw`, `@lexical/react`, `@lexical/utils`, `@mcp-ui/client`, `@radix-ui/react-checkbox`, `@radix-ui/react-label`, `@radix-ui/react-radio-group`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `grapesjs`, `lexical`, `@jini-ai/platform`, `@jini-ai/agentic`, `class-variance-authority`, `clsx`, `micromark`, `micromark-extension-gfm`, `parse5`, `shiki`, `tailwind-merge`, `zod` |
| `@jini-ai/user-management` | `argon2`, `@jini-ai/ui`, `@jini-ai/admin`, `@jini-ai/agentic`, `@jini-ai/ui-kit` |
| `@jini-ai/vibecoding` | `parse5` |

A classification is metadata, not proof that the current default entry satisfies it. The source guard still rejects eager/default reachability. No new `optionalPeerModules` exemptions were added.

## Delivered changes and reuse

- Restored the native-dependency table and its explanations exactly from HEAD, as requested; no native dependency moved. Updated the optional-peer convention and default-library list to the new policy. Pre-existing documentation inaccuracies are listed under Bugs found.
- Added the dependency-free `@jini-ai/core/optional-peer` helper. It accepts an injected literal loader, handles synchronous require and asynchronous import without changing their return contracts, formats a feature-specific error, and retains the original error as `cause`. An optional error factory preserves feature-owned error types.
- Applied the helper to the existing terminal, Sharp, SVG/Office DOM, SQLite media opener, daemon SQL schema, Shiki, Argon2, platform dispatcher and deferred MCP HTTP load sites. Runtime-message tests compare these call sites to their owning manifest messages.
- Deferred the WebSocket adapter's real require to native server construction. Injected servers need no ws library. No server is started by its missing-peer test.
- Sharp keeps `ImageTransformUnavailableError` and its original cause, including injected-loader failures. Asset-cache loading keeps `AssetCacheError` status 500 and its original cause.
- Removed `stage-desktop-closure.ts`, `check:staged-closure`, the stage/package additions and both release workflow steps. Those workflow/script changes now have no diff against HEAD. Restored the original desktop test/coverage flags because generic closure fixtures moved into Jini.
- Retained `verify-package.ts`'s post-package check of the real archive. Trimmed `verify-staged-closure.ts` to its archive path; the obsolete pre-package mirror mode is gone.
- Moved all seven generic `auditStagedClosure` fixture cases to Jini beside the implementation. Tovu retains its release composition check and adds a real archive negative/positive test.
- Removed `JINI_PACKAGING_SOURCE` from `jini-mcp-peers.test.ts`. That installed-dependency test has no source fallback. Isolated archive and terminal fixtures explicitly resolve the real new source through test-local Node hooks because building is forbidden; this does not change the installed-dependency test.
- Kept Round 1's import reader, strict optional classification/default closure guard, driver/layer isolation fixes and actual archive audit. Reviewer-removed demotion/quality machinery was not restored.

Reuse: optional-library loading; searched CAPABILITIES, core errors and platform/cms/daemon loading adapters; inspected `terminal-session.ts`, `image-transformer.sharp.ts`, `asset-cache.adapter.ts` and `core/model-facing-tool-errors.ts`; no shared feature-load error owner existed, so the smallest injected-loader helper lives in core. The owner-supplied node-pty example supplied the error pattern. No parallel product helper or new dependency was introduced.

Reuse: archive/source checks; extended the existing devops packaging contracts, TypeScript AST reader and Tovu verification composition. The native Node resolver remains authoritative. The seven tests use bounded real Node children because Vite SSR does not expose native `import.meta.resolve`.

Changed production units were manually reviewed for branching within the requested complexity ceiling of 10. The helper and error factories are small; literal imports remain visible to the guard. Existing why comments were retained. No metrics/build command was run under this dispatch's command restrictions.

## Blockers and incomplete behavior

1. The instruction to restore every other peer conflicts with the requirement that default behavior never depend on an optional library. The real agent-runtime default source check reports eight `@jini-ai/platform` loads: `model-discovery-adapters.ts`, `invocation.ts`, `providers/connection-guard.ts`, `claude-code-models.ts`, `claude-filesystem-policy.ts`, `executables.ts`, `env.ts` and `providers/elevenlabs.ts`. The guard remains strict and the new source-entry regression stays red. Simply classifying those peers or adding deferred-module exemptions would conceal the problem. Coordinator must choose a revised required dependency set or approved changes to default entry behavior. An asynchronous clarification was sent; no answer was received during this dispatch.
2. Static optional imports/re-exports remain in other opt-in subpaths, including Excalidraw, Lexical, GrapesJS and E2B, and in some cross-Jini imports. Native ESM fails during linking before a local catch can execute. Consequently these sites do not yet satisfy the custom-message requirement. Converting their public module/loading contracts, and selecting a helper dependency for packages whose core peer is itself optional, needs the same ownership decision. They were not silently rewritten into asynchronous public APIs.
3. Tovu's installed Jini devops package lacks the new `optionalPeerContractProblems` export. The installed-peer test fails during import. Builds/install/publication are forbidden here, so release validation requires Coordinator to refresh the actual package artifacts and dependency locks after resolving item 1. The installed runtime tree is not claimed green.

## Test evidence

Observed red → green results for implemented slices:

```text
Peer restoration regression, before manifest correction:
  optional-peer-contract.test.ts: 12 failed | 21 passed (33)
  expected peerDependenciesMeta[dependency].optional to be true; received undefined
After correction:
  34 policy/metadata/message cases pass, including unclassified-peer rejection,
  restored classified set, required seven default libraries, and smol-toml/mammoth demotion rejection.
  The separate real-source default-entry case remains red with eight platform findings.

Shared helper before implementation:
  optional-peer.test.ts: failed suite, ../optional-peer.js did not exist
After implementation:
  6 passed, including sync/async loads, real missing imports/requires, native ABI cause,
  and feature-owned error type/cause.

Sharp feature error regression before correction:
  image-transformer.sharp.test.ts: 1 failed | 11 passed
  expected “Image transformations could not load sharp”;
  received old “not installed” error that discarded cause
After correction:
  12 passed

Archive acceptance (retained production check, negative → positive fixture):
  missing smol-toml: child exit 1; byte comparison succeeds; staged-closure names smol-toml
  add smol-toml and repack the real archive: child exit 0; 0 missing runtime imports
  verify-package-cli.test.ts: 10 passed
```

Final Jini command, from `prov2-jini`:

```bash
node_modules/.bin/vitest run scripts/__tests__/check-subpath-isolation.test.ts scripts/__tests__/check-package-layers.test.ts scripts/__tests__/walk-imports.test.ts scripts/__tests__/optional-peer-contract.test.ts packages/devops/src/packaging/electron/__tests__/typescript.test.ts packages/devops/src/packaging/electron/__tests__/staged-closure.test.ts packages/daemon/src/__tests__/terminal-optional-peer.test.ts packages/core/src/__tests__/optional-peer.test.ts packages/cms/src/media/__tests__/image-transformer.sharp.test.ts packages/capability-providers/src/adapters/ws/__tests__/optional-peer.test.ts packages/platform/src/__tests__/asset-cache-optional-peer.test.ts packages/platform/src/__tests__/asset-cache-dispatcher.test.ts --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1 --testTimeout=120000
```

```text
Test Files  1 failed | 11 passed (12)
Tests       1 failed | 179 passed (180)
Failure: real agent-runtime default entry reaches optional @jini-ai/platform at eight load sites
```

Final Tovu command, from `prov2-tovu`:

```bash
node --import ./apps/desktop/scripts/resolve-ts-ext.ts --test --test-concurrency=1 --test-timeout=120000 apps/desktop/src/staged-closure.test.ts apps/desktop/src/verify-package-cli.test.ts apps/desktop/src/coverage-runner-split.test.ts apps/desktop/src/jini-mcp-peers.test.ts
```

```text
tests 16
pass 15
fail 1
jini-mcp-peers.test.ts: installed devops does not provide optionalPeerContractProblems
```

Both final outputs are retained under `ADS-memory/.local-artifacts/optional-peer-contract-round2/`. Only test files changed by this task/Round 1 were run, in the foreground with the supplied caps. `git diff --check` passed in both repos.

## Bugs found

- Unresolved: required default paths and static optional load sites described above. They prevent full completion of the requested contract.
- Fixed within this task: Sharp replaced every loader failure, including an incompatible native binary, with “not installed” and lost its cause.
- Fixed within this task: static ws import required ws even when the caller injected its own server.
- Preserved within this task: asset-cache error type/status while replacing the loading error; its previous missing-peer message discarded the original cause.
- Inherited Round 1 finding, untouched: `apps/desktop/src/stage-payload-lib.ts` stages by package name and can keep the wrong version when multiple installed versions are encountered.
- Inherited Round 1 finding, untouched: its declared-closure assertion inventories only top-level packages, so nested owners can escape that assertion. The new staged auditor scans nested Jini dist trees, but staging itself is unchanged.
- Documentation, preserved because native rows only change for actual moves: the native explanation omits Sharp/Argon2 and incorrectly calls everything else pure JS. Restored optional-peer examples list `recharts`, but neither UI nor chat currently declares it as an optional peer. The README's global ESM-only statement also conflicts with sandbox's existing CJS build script.

## Exact commit file lists

These lists include Round 1 changes that remain. They exclude every other job's files, generated outputs and scratch logs. No commit was made.

Jini (`prov2-jini`, branch `merge-1029`):

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

Tovu (`prov2-tovu`, branch `merge-1029`):

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
```

`apps/desktop/src/jini-mcp-peers.ts` is a deletion. The trimmed staging script was untracked, so its deletion creates no commit entry. The workflow, suite flag and coverage changes that returned to HEAD are likewise intentionally absent from these lists.

Suggested next assignee: Coordinator to resolve the default-entry ownership conflict and dispatch the remaining static-load boundaries; then rebuild/publish/refresh locks and rerun the installed-package check. This handoff is not a release-ready completion claim.
