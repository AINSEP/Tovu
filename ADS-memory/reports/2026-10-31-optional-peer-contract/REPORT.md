Programmer(Execution): Programmer and TDD personas for dependency enforcement and tests that fail before implementation.

# Optional peer contract handoff — 2026-10-31

Both checkouts are on `merge-1029`. No Git writes, installs, servers, workspace builds, or lockfile changes were made. All test children exited. Other participants' unrelated edits were left intact.

## Inputs and ownership

Authority: the owner's 10-31 policy and the dispatched brief in this session (no separate spec version/hash supplied). Read the governing bootstrap, Programmer/TDD personas, Jini extraction authority, and architecture chapters 13/14 from the canonical Tovu checkout because those chapters are absent in the integration clone. Graph MCP tools were not exposed; the local knowledge index and direct source verification supplied discovery evidence.

Reuse decision: extend Jini's existing `check-subpath-isolation.ts`, `@jini-ai/devops/packaging/electron` policies/ports, its TypeScript AST adapter, and Tovu's existing staging/verification composition. The supplied audit walker established useful traversal cases. Its handwritten exports resolver and ancestor fallthrough were not copied: native Node resolution retains exact conditional exports/imports/nested versions and the auditor rejects any target outside the staged root. TypeScript's already-installed maintained parser handles syntax; no new parser/resolver dependency was introduced. Reference checked: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API.

## Delivered behavior

- Published optional peers need `jini.optionalPeers[name] = "opt-in: feature — actionable message"`. The existing subpath guard checks classification even when there is no exports map, follows root/main runtime closures, and rejects optional loads reached there, including deferred `createRequire` and `require.resolve` loads.
- For activation that cannot be inferred from a module graph, `jini.optionalPeerModules` explicitly records a deferred feature module. This never exempts an eager load. Review must still verify that the host does not invoke that feature by default. The only current instance is daemon terminals.
- Removed the subset-install rejection and its package-specific exemptions. Subpath/domain isolation remains; the fraction of entry closures using a dependency no longer determines whether installation is optional.
- Preserved neutral-driver and integration-adapter boundaries when peers become required. The old guards coupled those architectural boundaries to `optional: true`, which would otherwise undermine this policy. Required integration peers remain confined to approved adapter subtrees; direct upward dependencies and neutral-core imports still fail.
- A single maintained AST reader now handles static imports/re-exports, literal dynamic imports, CommonJS, createRequire aliases/direct calls, and require.resolve. It preserves erased-type information for existing source guards and handles lexical require shadowing.
- `auditStagedClosure` inventories every staged Jini dist tree, including nested versions, and scans host runtime files. It checks the importing tree using Node's import or require conditions and rejects absent files, ancestor resolutions, escaping links, and invalid export targets. Only the importing Jini package's classified optional peer may exempt a missing load. Third-party packages retain ownership of their own optional internals.
- Tovu stages a shell production closure alongside the existing payload, then checks both before electron-builder. `verify-package.ts` additionally extracts/checks the actual shipped asar and its Resources/tovu sibling after packaging. Both desktop-release build jobs run the pre-package check; all existing archive verification paths now invoke the actual closure check too.
- Replaced the MCP peer test's manual allow-list with the owning Jini classifications across both installed production dependency graphs. Removed the unused Tovu-only helper.
- Both repositories' CI reject a dependency-to-optional-peer demotion without a valid classification. The shared diff implementation reads Git only and compares base manifests to the final working tree; full checkout history supplies the base revision.

## Classification decisions

Known default paths receive regular production dependencies: daemon's `smol-toml`; CMS document readers' `mammoth`/`unpdf`; agent-runtime's integrations catalog and Copilot SDK; MCP's SDK/schema libraries. Desktop also declares `@jini-ai/integrations` directly. The Codex parser is eagerly imported again; the prior lazy-import workaround is removed.

Other former optional peers become **required peers**, preserving consumer-owned framework instances and integration dependency boundaries. This is conservative: a secondary export alone does not prove an opt-in feature with a clear missing-library failure. It does increase install/packaging cost, including native/framework adapters. Review that footprint before publication; future optionality needs a genuine guarded feature contract rather than a manifest-only exemption. The Copilot SDK retains its existing `*` range, moved into dependencies; regenerated locks must pin the installed version.

`node-pty` stays optional: Tovu does not enable terminal sessions by default. A real missing-addon activation now reports exactly: `Interactive terminals need node-pty. Install node-pty to enable this feature.` The test uses a real isolated module tree with the real platform package and no node-pty; no failed import is mocked.

| Package | Former optional peers moved to dependencies | Former optional peers now required peers | Remaining optional peers |
|---|---|---|---|
| `@jini-ai/commerce` | — | `@jini-ai/db`, `kysely`, `express`, `react`, `@jini-ai/agentic`, `@jini-ai/ui`, `@jini-ai/cms` | none |
| `@jini-ai/ui` | — | `@tanstack/react-query`, `@excalidraw/excalidraw`, `@lexical/react`, `@lexical/utils`, `@mcp-ui/client`, `@radix-ui/react-checkbox`, `@radix-ui/react-label`, `@radix-ui/react-radio-group`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `grapesjs`, `lexical`, `react`, `react-dom`, `@jini-ai/platform`, `@jini-ai/agentic`, `class-variance-authority`, `clsx`, `micromark`, `micromark-extension-gfm`, `parse5`, `shiki`, `tailwind-merge`, `zod` | none |
| `@jini-ai/infra` | — | `@jini-ai/db` | none |
| `@jini-ai/devops` | — | `parse5`, `typescript`, `@jini-ai/platform`, `undici` | none |
| `@jini-ai/ui-kit` | — | `react`, `react-dom`, `vue` | none |
| `@jini-ai/core` | — | `express` | none |
| `@jini-ai/chat` | — | `react`, `react-dom`, `@jini-ai/db`, `kysely`, `better-sqlite3`, `@electric-sql/pglite`, `pg`, `@ag-ui/core`, `@mcp-ui/client`, `@radix-ui/react-checkbox`, `@radix-ui/react-label`, `@radix-ui/react-radio-group`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `@jini-ai/agent-runtime`, `@jini-ai/agentic`, `@jini-ai/protocol`, `@jini-ai/ui`, `@jini-ai/diagnostics` | none |
| `@jini-ai/plugins` | — | `@jini-ai/platform`, `semver`, `kysely`, `@jini-ai/db` | none |
| `@jini-ai/platform` | — | `undici`, `hast-util-from-parse5`, `hast-util-to-mdast`, `mdast-util-to-markdown`, `mdast-util-gfm-table`, `parse5` | none |
| `@jini-ai/admin` | — | `react`, `react-dom`, `@jini-ai/agentic`, `@jini-ai/ui`, `@jini-ai/ui-kit`, `@jini-ai/agent-plugins`, `@jini-ai/cms`, `@jini-ai/core` | none |
| `@jini-ai/server` | — | `better-sqlite3`, `@jini-ai/agent-runtime`, `@jini-ai/daemon`, `@jini-ai/http-kit`, `@jini-ai/sidecar`, `express`, `@jini-ai/db`, `@jini-ai/chat`, `@jini-ai/registry`, `@jini-ai/platform`, `kysely` | none |
| `@jini-ai/agentic` | — | `@jini-ai/protocol`, `zod`, `@jini-ai/core` | none |
| `@jini-ai/mcp` | `@cfworker/json-schema`, `@modelcontextprotocol/sdk` | `@jini-ai/platform` | none |
| `@jini-ai/cli` | — | `@jini-ai/platform`, `@jini-ai/sidecar` | none |
| `@jini-ai/search` | — | `@jini-ai/agent-plugins` | none |
| `@jini-ai/integrations` | — | `@jini-ai/db`, `better-sqlite3`, `@jini-ai/platform`, `@jini-ai/oauth`, `@cfworker/json-schema` | none |
| `@jini-ai/cms` | `unpdf`, `mammoth` | `sharp`, `express`, `kysely`, `@jini-ai/db`, `parse5`, `@jini-ai/http-kit`, `dompurify`, `jsdom`, `@jini-ai/platform` | none |
| `@jini-ai/daemon` | `smol-toml` | `@jini-ai/db`, `kysely`, `better-sqlite3`, `@electric-sql/pglite`, `pg`, `@jini-ai/http-kit`, `express`, `@jini-ai/agent-runtime`, `@jini-ai/platform` | `node-pty`: terminal opt-in; off by default, explicit error |
| `@jini-ai/http-kit` | — | `@jini-ai/platform`, `express` | none |
| `@jini-ai/sandbox` | — | `@e2b/code-interpreter` | none |
| `@jini-ai/diagnostics` | — | `jszip` | none |
| `@jini-ai/registry` | — | `better-sqlite3`, `@jini-ai/db`, `@jini-ai/platform` | none |
| `@jini-ai/db` | — | `better-sqlite3`, `@electric-sql/pglite`, `pg`, `kysely`, `@jini-ai/platform` | none |
| `@jini-ai/agent-plugins` | — | `yauzl`, `@jini-ai/platform`, `@cfworker/json-schema`, `semver` | none |
| `@jini-ai/sidecar` | — | `@jini-ai/platform` | none |
| `@jini-ai/capability-providers` | — | `better-sqlite3`, `ws`, `@jini-ai/platform` | none |
| `@jini-ai/user-management` | — | `argon2`, `react`, `react-dom`, `@jini-ai/ui`, `@jini-ai/admin`, `@jini-ai/agentic`, `@jini-ai/ui-kit` | none |
| `@jini-ai/agent-runtime` | `@jini-ai/integrations`, `@github/copilot-sdk` | `@jini-ai/platform` | none |
| `@jini-ai/vibecoding` | — | `react`, `react-dom`, `parse5` | none |
| `@jini-ai/analytics` | — | `@jini-ai/agent-runtime` | none |

Unchanged required dependencies, including OAuth protocol libraries and ui-kit's existing owner declarations, remain required. All other published manifests have no optional peer requiring classification.

## Files changed by this task

Jini:

- The 30 `packages/<name>/package.json` files listed above; root `package.json`; `.github/workflows/ci.yml`.
- `packages/README.md`, `packages/devops/README.md` document the replacement policy.
- `packages/devops/src/packaging/electron/{entry,ports,typescript,optional-peers,optional-peer-review,staged-closure,staged-closure-node}.ts`.
- `packages/daemon/src/agent-executor/codex/isolation.ts`, `packages/daemon/src/terminal-session.ts`.
- `scripts/{check-subpath-isolation,check-driver-isolation,check-package-layers,check-optional-peer-diff}.ts`.
- `scripts/lib/{walk-imports,publish-hygiene-self-test,optional-peer-diff}.ts`.
- `scripts/__tests__/{check-subpath-isolation,check-package-layers,walk-imports,optional-peer-contract,optional-peer-quality}.test.ts`.
- `packages/devops/src/packaging/electron/__tests__/typescript.test.ts`, `packages/daemon/src/__tests__/terminal-optional-peer.test.ts`.

Tovu:

- `package.json`, `apps/desktop/package.json`, `.github/workflows/{ci,desktop-release}.yml`.
- `development/scripts/check-optional-peer-diff.mjs`.
- `apps/desktop/scripts/{stage-desktop-closure,verify-staged-closure,verify-package}.ts`.
- `apps/desktop/src/{coverage-floors,verify-package-cli}.ts`; removed `apps/desktop/src/jini-mcp-peers.ts`.
- `apps/desktop/src/{jini-mcp-peers,staged-closure,verify-package-cli,coverage-runner-split}.test.ts`.
- This handoff and scratch test captures under `ADS-memory/.local-artifacts/optional-peer-contract/`.

## Red → green evidence

Actual observed red excerpts, before the corresponding implementation/refinement:

```text
optional-peer-contract.test.ts: 7 failed | 2 passed
  rejects an unclassified optional peer: expected [] to contain SI-optional-peer
  default path import/createRequire/require.resolve: expected [] to contain SI-optional-peer
  old subset rule: received "declare an optional peer and a development dependency"

staged-closure.test.ts (initial): ERR_MODULE_NOT_FOUND .../staged-closure.ts

terminal-optional-peer.test.ts: 1 failed
  expected: Interactive terminals need node-pty. Install node-pty to enable this feature.
  received: Cannot find package 'node-pty' imported from .../terminal-session.ts

optional-peer-contract.test.ts (isolation coupling): 2 failed | 11 passed
  required backend peer: driver guard returned []
  required integration peer: approved src/admin adapter rejected

optional-peer-quality.test.ts: 1 failed, six reported complexity violations
  parser bindings 11, erased 14, reference 11;
  staged scan 11/cognitive 16; classification 11

staged-closure.test.ts (nested vendor ownership): 1 failed | 6 passed
  vendor's optional implementation incorrectly treated as Jini; fixed actual package ownership
```

Final Jini command, from prov2-jini:

```bash
node_modules/.bin/vitest run scripts/__tests__/check-subpath-isolation.test.ts scripts/__tests__/check-package-layers.test.ts scripts/__tests__/walk-imports.test.ts scripts/__tests__/optional-peer-contract.test.ts scripts/__tests__/optional-peer-quality.test.ts packages/devops/src/packaging/electron/__tests__/typescript.test.ts packages/daemon/src/__tests__/terminal-optional-peer.test.ts --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1
```

```text
Test Files 7 passed (7)
Tests 125 passed (125)
```

This includes strict no-emit type checking of the new public packaging contracts and ESLint cyclomatic/cognitive complexity ≤10 for every new generic packaging function. The original subset-demotion assertions were deliberately replaced by the owner's new required-dependency contract while retaining closure assertions and the source-isolation checks; test count was preserved. No production fix relies on weakening an assertion, mocking a missing library, or deferring the broken import.

Final Tovu command, from prov2-tovu:

```bash
JINI_PACKAGING_SOURCE=file:///Users/la/Programming/tovu-integration-clones/prov2-jini/packages/devops/src/packaging/electron/ node --experimental-import-meta-resolve --import ./apps/desktop/scripts/resolve-ts-ext.ts --test --test-concurrency=1 --test-timeout=120000 apps/desktop/src/staged-closure.test.ts apps/desktop/src/verify-package-cli.test.ts apps/desktop/src/coverage-runner-split.test.ts apps/desktop/src/jini-mcp-peers.test.ts
```

```text
tests 27
pass 26
fail 1
AssertionError: .../prov2-tovu cannot resolve packaged dependency mammoth
```

The eight staged-closure fixtures are green, including missing/present smol-toml, ancestor isolation, conditional exports, deferred modules, owning-package exemptions, both resource layouts, nested vendor ownership, and release wiring. Archive selection/verification and runner-flag tests are also green. The remaining real installed-closure guard is intentionally red: the coordinator must regenerate/install dependencies. The source override selects the real unpublished Jini implementation for tests only; it does not replace the installed dependency graphs inspected by that guard. Normal CI uses the published package and no override.

Full final output: `ADS-memory/.local-artifacts/optional-peer-contract/jini-green.log` and `tovu-installed-boundary.log`.

## Coordinator actions / limits

1. Regenerate Jini `pnpm-lock.yaml`. Rebuild `@jini-ai/devops` and `@jini-ai/daemon` (and their normal workspace prerequisites). Publish/version all 30 changed package manifests together using the existing release process; rebuilding only a consumer will not update npm's immutable package metadata.
2. Refresh the consumers to those releases and regenerate Tovu `package-lock.json` and `apps/desktop/package-lock.json`. Also refresh `apps/admin/package-lock.json` and `apps/site-chat/package-lock.json` because they consume the changed Jini dependency manifests/framework peers. Install the regenerated locks. No lockfile was edited here.
3. Run the changed Tovu tests without `JINI_PACKAGING_SOURCE`, then build/stage normally and run `npm run check:staged-closure` from apps/desktop. Package and run the existing verify/native/bridge smoke steps. Actual payload/asar artifacts were not built or checked in this dispatch because builds and installs were forbidden.
4. Preserve any further missing-library findings exposed by the actual stage; do not add blanket exemptions. The checker resolves literal module loads; arbitrary computed module names and proving whether a host calls an optional feature need manifest/review evidence. It audits host/Jini files, not third-party optional implementations.

## Bugs found

- Fixed: making peers required disabled neutral-driver enforcement because it derived drivers only from optional metadata; `prov2-jini/scripts/check-driver-isolation.ts:116`.
- Fixed: required integration peers were rejected in approved adapter subtrees, pressuring authors to mark them optional; `prov2-jini/scripts/check-package-layers.ts:81`.
- Unfixed: staging two installed versions of one transitive dependency can silently keep the first version because the destination is keyed only by package name; `apps/desktop/src/stage-payload-lib.ts:155`.
- Unfixed: the declared-closure assertion enumerates only top-level staged packages, so a missing dependency owned by a nested package can escape that assertion; `apps/desktop/src/stage-payload-lib.ts:227`.

Suggested next assignee: Coordinator for release/lock regeneration, followed by package verification on real artifacts. Implementation is handed off; the actual installed/release closure is not claimed green.
