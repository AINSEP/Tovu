# N1 sheet: create `@jini-ai/node-adapters` (one Sonnet run, ~70k)

Read `COMMON.md` first. Planning only; nothing here was executed.

**Owner decision OD-3 (2026-11-16):** the Node runtime adapters (fs / lock / process bindings) live in a NEW small package `@jini-ai/node-adapters`, package kind `runtime-adapter`. It imports `@jini-ai/platform` and the **port types** of the domains it binds, exports **bindings only**, and assembles nothing. The server preset and Tovu both import it. This replaces DESIGN §7 Q8 ("adapters go to the host preset") everywhere in these sheets.

```
id: N1-node-adapters
wave: 0b (after G-STALE-DEPS, before every lane that binds a platform function: R11a, R11b, R11c, R10b, R8b)
jini_files:
  - scripts/lib/injection-edges.ts                                   | edit (new kind rule)
  - scripts/__tests__/check-package-layers.injection.test.ts         | edit (6 new cases)
  - packages/README.md                                               | edit (document the kind)
  - packages/node-adapters/{package.json,tsconfig.json,vitest.config.ts,README.md,source-map.md} | NEW
  - packages/platform/src/runtime-ports/fs.ts       -> packages/node-adapters/src/fs.ts       | git mv (19 lines)
  - packages/platform/src/runtime-ports/process.ts  -> packages/node-adapters/src/process.ts  | git mv (40 lines)
  - packages/platform/src/__tests__/runtime-ports.test.ts, runtime-ports.typecheck.ts -> packages/node-adapters/src/__tests__/ | git mv
  - packages/platform/package.json                                   | edit (delete the two `./runtime-ports/*` exports, their `jini.entries` and `jini.isolation` lines)
  - packages/platform/src/secrets/__tests__/exports.test.ts          | edit only if it pins the two deleted entries (it names `runtime-ports`)
  - pnpm-lock.yaml, the API baseline, .changeset/n1-node-adapters.md | same commit as the change that needs them
tovu_files: none (no Tovu file imports `@jini-ai/platform/runtime-ports/*`; step 0 proves it)
```

## Facts checked on merge-a `dde69a6d` + merge-b `9c982fd9` (2026-11-17)
- `platform/src/runtime-ports/fs.ts` exports `nodeFileLock` (`satisfies FileLockPort`) and `nodeAtomicWriter` (`satisfies AtomicFileWriterPort`); `process.ts` exports `ProcessFunctions`, `createProcessControlPort`, `nodeProcessControl`. Both import only `@jini-ai/core/contracts/runtime` and platform's own files. They came from daemon R8a step 1.
- **No importer** of `@jini-ai/platform/runtime-ports/*`, `nodeFileLock`, `nodeAtomicWriter` or `nodeProcessControl` exists outside `packages/platform` in Jini `packages`/`examples` or in Tovu `apps`/`packages`.
- The gate has no adapter rule: `scripts/lib/injection-edges.ts` `l5Reason` (`:74-82`) knows base packages, host presets and exception entries only. Package kinds are free strings in `package.json` (`jini.kind`); 30 kinds are in use, `runtime-adapter` is not.
- `packages/server/src/adapters/node-pty.ts` (daemon R8a step 3a) is a vendor binding with a native dependency. **It stays in the preset**: moving it would give every importer of the small package a native build. (Recorded as OD-8 in INDEX; no sheet depends on the answer.)

## The rule this package must obey (and the command that enforces each line)
| Rule | Enforced by |
|---|---|
| imports only `core`, `protocol`, `platform` (any kind) and **type-only** imports of a domain package | gate rule below + T1c |
| only a host or a host preset imports it | gate rule below + T1d |
| it never imports a host preset | existing rule "nothing may import a host-preset package" + T1f |
| exports bindings only, assembles nothing | T3 surface pin + `rg -n "createLocalNodeDaemon\|create[A-Z][A-Za-z]*(Daemon\|Server\|Kernel\|App)\(" packages/node-adapters/src` prints nothing |
| no root barrel: there is **no `"."` export**; one subpath per binding family | T3 (`exports` keys equal the checked-in list) |
| every export-map entry exists and builds in the commit that adds it (lesson 25) | `pnpm --filter @jini-ai/node-adapters build && node -e "for (const k of ['fs','process']) await import('@jini-ai/node-adapters/'+k)"` run from `packages/server` |
| declared deps are imported statically | `rg -n "await import\(\|loadOptionalPeer\|require\(" packages/node-adapters/src` prints nothing |

### Gate rule (edit `scripts/lib/injection-edges.ts`; keep each function ≤ 50 lines, `(required, optional = {})`)
```ts
/** Owner decision OD-3 (2026-11-16): Node bindings of ports live in `runtime-adapter` packages. Such a package
 * may import `platform` and may name a domain's port TYPES; it never runs a domain's code and never assembles
 * a service. Only a host or a host preset may import it. */
export function runtimeAdapters(required: { packages: readonly SourcePackage[] }, _optional: Record<string, never> = {}): Set<string>
// same shape as hostPresets(): owners whose manifest has jini.kind === 'runtime-adapter'. No named fallback list.
```
`l5Reason` gains `adapters: ReadonlySet<string>` in its required object and three checks, placed **after** the base-package check and the preset checks:
1. `adapters.has(edge.target)` and the owner is not a preset → `'only a host or a host preset may import a runtime-adapter package'`.
2. `adapters.has(edge.owner)` and `edge.target === 'platform'` → allowed.
3. `adapters.has(edge.owner)` and the edge is type-only or a manifest peer → allowed. Read `scripts/lib/import-sites.ts` for the real `SiteKind` member that means type-only and use that member; `manifest-peer` is the kind `manifestEdges` gives a peer (`injection-edges.ts:69`). A **value** import of a domain package, or a domain package in `dependencies`, keeps the normal L5 reason.
Thread `adapters` through `injectedEdgeFindings` and its caller (`rg -n "injectedEdgeFindings\|hostPresets\(" scripts`). `advisoryTestEdges` is unchanged.

## Package shape (step 2)
```jsonc
// packages/node-adapters/package.json: copy the script, files, engines, publishConfig and license fields from packages/platform/package.json
{ "name": "@jini-ai/node-adapters", "type": "module",
  "jini": { "domain": "platform", "kind": "runtime-adapter", "runtime": "node",
            "entries": { "./fs": "node", "./process": "node" } },
  "exports": {
    "./fs":      { "types": "./dist/fs.d.ts",      "import": "./dist/fs.js",      "default": "./dist/fs.js" },
    "./process": { "types": "./dist/process.d.ts", "import": "./dist/process.js", "default": "./dist/process.js" } },
  "dependencies": { "@jini-ai/core": "workspace:*", "@jini-ai/platform": "workspace:*" } }
```
- Take the exact version, `workspace:` range style, `tsconfig.json` and `vitest.config.ts` from `packages/platform` (same compiler flags: lesson 22). If `pnpm guard` demands `jini.entries["."]` or an `isolation` block for a package without a root entry, **STOP** and paste the message (command: `pnpm guard`).
- Inside the moved files the relative imports become package imports: `../fs/backup-once.js` → the platform entry that exports `backupOriginalOnce` (`rg -n "backupOriginalOnce\|writeFileAtomicAsync\|withFileLock\|listProcessSnapshots" packages/platform/package.json packages/platform/src/fs/index.ts packages/platform/src/index.ts`; use the narrowest existing entry: `@jini-ai/platform/fs`, `@jini-ai/platform/process`). If a function has **no** public platform entry, **STOP** (command: the `rg` above prints no export for it): adding a platform export is a separate decision.
- The header comment of each moved file moves with it; reword only the sentence that names `./runtime-ports/*` (why-comments move with the code).
- Later lanes add **their own entry in their own commit**, each with its source file and test: R11a `./agent-plugins`, R11b-3 `./http`, R10b-1 `./agent-runtime`. N1 does not pre-create empty entries.

## Tests to write first
| # | Where | Asserts | Fails when |
|---|---|---|---|
| T1a–f | `scripts/__tests__/check-package-layers.injection.test.ts` (use its `manifest()` helper, `:174`) | (a) adapter → `platform` value import: no finding; (b) adapter → domain type-only import: none; (c) adapter → domain **value** import: L5 finding; (d) domain → adapter: finding with the new reason; (e) host preset → adapter: none; (f) adapter → host preset: finding | rule missing, or allows a value import |
| T2 | moved `runtime-ports.test.ts` + `.typecheck.ts` | unchanged assertions pass from the new package (they already use recording fakes of the three process functions) | an argument is reshaped by the move |
| T3 | `packages/node-adapters/src/__tests__/surface.test.ts` (new) | `Object.keys(pkg.exports)` equals `['./fs','./process']` (sorted); each entry's exported names equal a checked-in list; every `dist` target named in `exports` has a matching `src` file | an entry without a source, a root barrel, an unlisted export |
T1 is RED before step 1's rule. T3 is RED before step 2's package exists (run it from the new package once its manifest is in place, before the `git mv`).

## Steps (each commit green alone; nothing is left for a coordinator)
0. Baseline (COMMON §Base) + prove the "no importer" fact: `rg -n "platform/runtime-ports\|nodeFileLock\|nodeAtomicWriter\|nodeProcessControl" packages examples -g '!**/dist/**' -g '!packages/platform/**'` in Jini and the same names over Tovu `apps packages`. Any hit: repoint it in step 2's commit (Jini) or a paired Tovu commit; more than 5 hits: **STOP** (the fact base changed).
1. Gate rule + T1a–f + `packages/README.md` paragraph for the kind. `pnpm guard && npx vitest run scripts/__tests__/check-package-layers.injection.test.ts` (use the scripts test command from root `package.json`). Commit.
2. Package + the two moves + tests + platform manifest edit + `pnpm install --config.prefer-workspace-packages=true` (lockfile) + `pnpm api:update` + changeset (node-adapters: new package; platform: the two removed entries are a breaking change, follow `.changeset/README.md`). Checks: `pnpm --filter @jini-ai/platform --filter @jini-ai/node-adapters build`, both packages' tests, `pnpm guard`, `pnpm api:check`, `pnpm typecheck`. Test count: platform loses exactly the moved cases, node-adapters gains the same number + T3. Commit.
3. Report `cloud-results/xpkg/N1.md` (COMMON §Git).

## STOP (each with its command)
- `pnpm guard` rejects the manifest shape (no root entry / kind) → paste output.
- A moved file needs a platform function that has no public entry → the `rg` in "Package shape".
- Step 0 finds more than 5 importers.
- The gate change makes any **existing** package pass or fail differently: `pnpm guard` output before and after step 1 must be identical (`diff <(git stash list >/dev/null; pnpm guard 2>&1) …` is not allowed here: run `pnpm guard > /tmp/guard-before.txt` at step 0 and `pnpm guard > /tmp/guard-after.txt` after step 1, then `diff` them; any difference is a STOP).
