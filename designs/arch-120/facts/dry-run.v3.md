# v3 design dry-run (local, never pushed as product code)

Tree: Tovu `2d82735a` + `dry-run.v3.L01-L02a-L08a.patch` (29 files, +37/−37); Jini `d37821a4` built
(`pnpm install --frozen-lockfile && pnpm --no-bail -r build`) and linked with `npm run link:jini`.
Applied: all of **L01** (10 edges), L02's `operator-locale` move (7 edges), L08's
`media-access-evidence` move (4 edges) = 21 edges.

| gate (INDEX-v3) | result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` (the `typecheck` tsc step) | first run **1 error** (`server/runtime/composition/deps.ts:1008`, SigV4 client) — pristine tip **0**. Cause: `deployments/deploy-targets/types.ts:32` forwards Jini's `PluginDeployHostKit` *renamed* to `DeployHostKit`. Fixed in the sheet (`import type { PluginDeployHostKit as DeployHostKit }`); re-run **0** |
| `typecheck:tests` | **0** errors, exit 0 |
| G2 `check:architecture` (INDEX-v3 snippet verbatim, lane file = the 21 edges) | **PASS**: exit 1, `FAILED: 1 metric(s)`, NEW 115 → **94**, all ⊆ `all-115.txt`, none of the 21 left; cross-feature edges 417 → 396; API surface 806 → **807** (operator-locale +1, evidence cache neutral); cycles 2, SCC 2 |
| G3 `check:boundaries` | exit 10 (was 14): the 4 `no-deep-imports:features/media` access-evidence errors gone, **0 new** |
| G4 `check:size`, `check:complexity` | exit 0, exit 0 |
| G5 node:test, 10 files (operator-locale unit, agent-plugin uninstall integration, post-trash media evidence integration, entries repo characterization, trash-aware memory repo characterization, object-storage ×3, connect-tool ×2) | **138/138 pass**, exit 0 |
| G-RATCHET (separately, on the pristine tip) | numstat `0 124`; rows 426 → 302; NEW still 115; still `1 metric(s)` |

What this proves: the J and D moves compile and pass their suites without behaviour change; the
gate snippet is executable as written and order-independent; the rename trap is real and caught by
G1 (now written into L01). What it does not prove: the I/S/H lanes (L04–L07, L09–L14) — they are
unexecuted designs.
