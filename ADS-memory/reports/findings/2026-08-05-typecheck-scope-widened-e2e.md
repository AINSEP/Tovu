# Typecheck scope widened to `development/e2e/**` — done, and the one step still gated

Date: 2026-08-05
Agent: `DevOps-TypecheckScope` (DevOps persona, Sonnet 5), dispatched by Coordinator
Commit: **`76865b7`** on `refactor/jini-admin-extraction`
Status: **first half of Decision 3 COMPLETE and independently verified.** Second half gated on `npm install`.

## Why this existed

`development/e2e/surface-live-agent.spec.ts:72-82` hand-mirrors the agent wire envelope because
`@jini-ai/protocol` isn't resolvable from Tovu — and a hand-mirrored shape is what caused the bug that
spec was written to guard. The recon (`2026-08-05-protocol-wiring-recon.md`) found the fix is one
devDependency line, but flagged that **nothing type-checks `development/e2e/**` today**, so wiring the
protocol alone would buy IDE-time detection only, *not a CI gate*. The user decided: widen scope first,
then wire.

## Mechanism chosen: standalone `development/tsconfig.e2e.json`, NOT a widened root `include`

The decisive reason, verified independently by the Coordinator rather than taken on trust:

**Root `tsconfig.json` is also `npm run build`'s `-p` target**, and that invocation has **no `--noEmit`**
(`package.json`: `"build": "tsc -p tsconfig.json && ..."`), with `rootDir: "."` and `outDir: "dist"`.
Widening root's `include` to reach `development/e2e/**` would have started **emitting compiled e2e specs
into `dist/development/e2e/*.js`** — shipping test code in the production build.

Secondary reason: root's `exclude` deliberately drops `**/__tests__/**` and `**/*.test.ts` to keep dozens
of real `src/**/__tests__` unit tests (run via `node --test`, not tsc) out of typecheck. Changing that
semantics for an e2e-scoped ask is a wider blast radius than the task called for.

Precedent for the standalone-config shape already existed in-repo:
`development/experiments/jini-agent-runtime/ts/tsconfig.json`.

### Wiring (no CI workflow change needed)

```
"typecheck":     "tsc -p tsconfig.json --noEmit && npm run typecheck:e2e"
"typecheck:e2e": "tsc -p development/tsconfig.e2e.json --noEmit"
```

CI's existing step (`.github/workflows/ci.yml:36`, `run: npm run typecheck`) picks up both.

**`allowImportingTsExtensions: true` lives ONLY in the e2e config** — scoped to the single dynamic
`import()` at `byok-ssrf-guard.spec.ts:108` that reaches directly into a Jini `.ts` source file. It is
**not a repo-wide policy**; root `tsconfig.json` is untouched by it. Requires `noEmit` (already set) and
does not change runtime resolution — Playwright's esbuild transform handles that independently of tsc.

## Errors surfaced and fixed: 17 → 0, nothing suppressed

| Count | Code | File | Fix |
|---|---|---|---|
| 16 | TS18047 | `admin-fab-position.spec.ts` | Playwright's `expect(x).not.toBeNull()` is a runtime check that does **not** narrow TS's `BoundingBox \| null`. Added `node:assert/strict` `assert()` calls immediately after — runtime-redundant (the `expect()`s already threw), purely for compiler narrowing. Pattern already used in `__tests__/daemon-ready.unit.test.ts`. |
| 1 | TS5097 | `byok-ssrf-guard.spec.ts:108` | `allowImportingTsExtensions` in the e2e-only config (above). |

Zero fallout in `apps/admin/src/` — no collision with the concurrent dropdown work.

## Coordinator's independent verification (do not re-do)

A mis-scoped `include` produces the identical "0 errors" output, so green alone proves nothing.
Two checks were run:

1. **Coverage:** `tsc -p development/tsconfig.e2e.json --listFiles` → **31 files** under `development/e2e/`,
   including `surface-live-agent.spec.ts` (the spec this task exists to protect) and
   `__tests__/daemon-ready.unit.test.ts`.
2. **Negative verification:** planted `development/e2e/__coordinator-probe.ts` containing
   `const n: number = "deliberate type error"` → typecheck **exit 2**, error reported by file and line.
   Removed the probe → **exit 0**. No residue (`git status` clean for that path).

**The gate bites.** This is not vacuous green.

## Separated results (root vs e2e — report them separately, always)

Because `typecheck` is `root && e2e`, a root failure short-circuits and the e2e result is never
reported. Two other sessions are live in `src/` and `apps/admin/src/`, so root can go red for reasons
unrelated to e2e. Always run both independently when reporting:

- `npx tsc -p tsconfig.json --noEmit` → exit 0
- `npm run typecheck:e2e` → exit 0

The `&&` chaining itself is correct and stays.

## THE ONE REMAINING STEP — gated on a quiet tree for `npm install`

1. Add to root `package.json` **`devDependencies`** (not `dependencies` — only an e2e spec consumes it,
   never bundled by `npm run build`): `"@jini-ai/protocol": "file:../Jini/packages/protocol"`.
   Exact diff/placement in `2026-08-05-protocol-wiring-recon.md`.
2. `npm install` at repo root — regenerates the `node_modules/@jini-ai/protocol` symlink and touches
   `package-lock.json`. **Barred while other sessions are live** (an install prunes `node_modules` they
   depend on).
3. Verify: `node -e "console.log(require.resolve('@jini-ai/protocol'))"` from Tovu root.
4. In `surface-live-agent.spec.ts`, replace the hand-mirrored `RunWireEvent` interface with
   `import type { RunProtocolEvent } from "@jini-ai/protocol"`. **The recon's illustrative diff does not
   carry this through:** the loop bodies at `:197-208` and `:243-247` will likely need explicit
   `event.payload.type === "..."` narrowing once it is a real discriminated union.
5. Re-run `npm run typecheck` — now CI-enforced end to end.

**Known permanent partial coverage:** the `mcp-ui` `resource` field is typed `unknown` in protocol *by
design* (validated downstream by `@jini-ai/ui`'s `parseUIResource`), so the spec's
`resource.resource.text` assumption stays outside what `@jini-ai/protocol` can ever validate. Don't chase it.

## Concurrency notes

- `development/e2e/admin-fab-drag-onto-dock.spec.ts` appeared mid-task — **another session's untracked,
  in-flight work.** Not edited, not committed, not excluded from the config. It type-checks clean under
  the new gate as of this writing. If it ever fails, that is a finding to report, not to patch.
- Commit `76865b7` contains exactly three files: `development/tsconfig.e2e.json` (new),
  `development/e2e/admin-fab-position.spec.ts`, `package.json`.

## Handoff Contract

- **Inputs used:** `2026-08-05-protocol-wiring-recon.md`; root `tsconfig.json`/`package.json`;
  `.github/workflows/ci.yml`; the `development/experiments/jini-agent-runtime/ts` precedent; a dry-run
  typecheck against a scratch config.
- **Output summary:** `development/e2e/**` (31 files) now under a CI-enforced typecheck gate, verified by
  probe to actually fail on a type error. 17 pre-existing errors root-cause fixed, zero suppressed.
- **Risks:** the protocol wiring still needs an `npm install` on a quiet tree; root and e2e results must
  be reported separately or a red root will mask/misattribute the e2e result.
- **Suggested next assignee:** Programmer or DevOps, for steps 1-5 above, once the tree is quiet.
