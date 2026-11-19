# arch-120 v4 — lane index (dependency order)

Base: Tovu `origin/integ/merge-3-2026-11-18` @ `2d82735a`, Jini same branch @ `d37821a4`.
Supersedes INDEX-v3. Finding → fix table: [`REVISION-4.md`](REVISION-4.md). Sheets: [`v4/`](v4/).
Expected edge set: `v4/edges/all-115.txt` (the 115 `NEW cross-feature edge` lines the tip's
`npm run check:architecture` prints), partitioned exactly by `v4/edges/L01.txt … L14.txt`.
L00 states the set and the 124-row baseline prune as data.

## Rule (owner, binding)

An edge leaves the report only because the source file stops importing the other feature. The
moves are:

| code | move | when |
|---|---|---|
| **J** | import the canonical `@jini-ai/*` export directly | the symbol is a Jini type forwarded by a sibling barrel |
| **D** | move the declaration down to `apps/website/src/contracts/core/<file>.ts`, repoint every importer, no forwarder | pure type, constant or function whose own imports are only `@jini-ai/*`, `node:*` or `contracts/` |
| **S** | the consumer declares the structural shape it reads; conformance is checked where composition assigns the provider | type-only edge to a Tovu-local type |
| **I** | the consumer takes the function in its deps (required); composition passes the provider's function | value edge to behaviour with state, I/O or a feature-owned repo |
| **H** | rehome code to the module that owns its job, with no forwarder | wiring (the publish bag), or code whose only production user is elsewhere |
| **E** | import through the target's declared entry, adding the symbol to that entry (L15 only) | non-feature boundary error where the entry already exports from the same file |

No allow-list, filter, rank exemption, baseline addition or `.dependency-cruiser.mjs` edit. No new
layer. A new file or port exists only where an edge removal needs it.

## Roles

- **Executor (Codex):** edits code from one sheet. It runs **no** gate, test or type-check, because
  it cannot run them on its machine. It commits, pushes the lane branch and reports.
- **Verifier (Opus cloud test-and-fix run):** runs the gate below on the parent commit and on the
  candidate. It fixes what fails (type errors in fixtures the sheet could not list, a missed
  repoint) without changing the sheet's design, and records each fix in the PR. If a fix would
  need a design change, it stops at the sheet's STOP condition.

## Gate (the verifier runs it; it is the only gate)

Setup once per run (Node 24; checkouts named exactly `Tovu` and `Jini`, side by side): Jini
`git checkout --detach d37821a4 && pnpm install --frozen-lockfile && pnpm --no-bail -r build`. Tovu
`npm ci --ignore-scripts`, `JINI_PACKAGES_DIR=<abs>/Jini/packages node development/scripts/link-jini.mjs`,
then build `packages/contracts` and `packages/sdk`.

On the **parent** commit (the lane's base) and on the **candidate** (the lane's head), run each of
these repo commands from the Tovu root. Record each one's exit status and its full output:

```
npm run typecheck
npm run typecheck:tests
npm run check:architecture
npm run check:boundaries
npm run check:size
npm run check:complexity
npm run check:hooks
npm run check:why-comments
node:test on the lane's named test files (the sheet's characterization files plus its "Named test files" list), with the repo's runner flags:
  TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <files>
```

**PASS** requires all four of the following:
1. Every command's exit status on the candidate is no worse than on the parent: 0 stays 0, and a
   non-zero status may only become 0 or stay the same. (`check:architecture` stays exit 1 until the
   last lane.)
2. `check:architecture` and `check:boundaries`: the verifier diffs the parent output against the
   candidate output and confirms that **no error line appears on the candidate that is absent on
   the parent**. For `check:architecture` that covers every `NEW cross-feature edge` line and every
   `FAILED`/regression line. For `check:boundaries` it covers every `  error ` line.
3. The lane's expected removals are gone. Every line of `v4/edges/<lane>.txt`, and every boundary
   error the sheet names, is absent from the candidate's output.
4. The verifier reads the diff and confirms that it adds no suppression (`@ts-ignore`,
   `@ts-expect-error` other than the sheet's named type-pin cases, `eslint-disable`, `as any`, a
   new `as unknown as`). It also confirms that no comment is deleted except on moved lines, which
   keep their comments, and that no test assertion is weakened or deleted. The test count in the
   named files must not drop.

The gate contains no scripts, `comm` pipelines, `test -z` wrappers or output parsing. The
comparison is a plain diff, which the verifier reads.

## Lanes

| # | sheet | edges | mix | depends on | one repo | executor |
|---|---|---|---|---|---|---|
| L00 | `v4/L00-ratchet-prune.md` | 0 (baseline −124 rows) | data | — | Tovu | **Codex-ready** |
| L01 | `v4/L01-jini-direct.md` | 10 | J | L00 | Tovu | **Codex-ready** |
| L02 | `v4/L02-contracts-down-a.md` | 15 | D | L00 | Tovu | **Codex-ready** |
| L03 | `v4/L03-contracts-down-b.md` | 13 | D | L00 | Tovu | **Codex-ready** |
| L04 | `v4/L04-settings-write.md` | 2 | I, S | L02 | Tovu | **Codex-ready** |
| L05 | `v4/L05-credential-store.md` | 10 | D, I, S | L01, L02 | Tovu | Opus (fixtures found by typecheck) |
| L06 | `v4/L06-credentials-source-control.md` | 3 (+1 boundary) | I | L05 | Tovu | **Codex-ready** |
| L07 | `v4/L07-static-export.md` | 4 | S, H, I | L03 | Tovu | **Codex-ready** |
| L08 | `v4/L08-media-door.md` | 9 (+4 boundary) | I, S, D | L00 | Tovu | Opus (two roots, many fixtures) |
| L09 | `v4/L09-theme-assets.md` | 8 | I, D | L03 | Tovu | **Codex-ready** |
| L10 | `v4/L10-post-readers.md` | 9 | D, I, S, H | L03, L04 | Tovu | Opus |
| L11 | `v4/L11-plugins-connections.md` | 8 | D, I, S | L01, L05 | Tovu | **Codex-ready** |
| L12 | `v4/L12-single-call.md` | 3 | I, S | L00 | Tovu | **Codex-ready** |
| L13 | `v4/L13-publish-consumer-shapes.md` | 4 | S | L00 | Tovu | **Codex-ready** |
| L14 | `v4/L14-publish-bag.md` | 17 | S, H, I, D | L01, L08, L13 | Tovu | Opus (generic migration) |
| L15 | `v4/L15-boundary-doors.md` | 0 (9 boundary) | E, I, H | L06, L08, L12 | Tovu | Opus |

All 16 lanes touch only the Tovu repo. L01 and L14 read Jini types but change no Jini file.
"Codex-ready" means the sheet pins the whole design: every production file, binding site,
caller and test to add. The executor needs no command output to finish. A test fixture that
builds a deps object by hand and now misses a new required field is the only residue. The verifier
fixes it mechanically by adding the field with the real function, as the sheet says. "Opus" lanes
have a fixture set too large or too generic-dependent to list (two-root wiring, generic
migration). They need `typecheck:tests` during the edit, so they run in the cloud.

**Merge order (one branch per lane off the current integ tip, one PR, merged in this order):**
L00 → L01 → L02 ∥ L13 → L03 → L04 → L05 → L06 → L07 → L08 → L09 → L10 → L11 → L12 → L14 → L15.
L02 and L13 is the only parallel pair (judge 3: disjoint files). Every other lane starts from the
tip that contains its predecessor. These are the overlaps that force the order:
- L03 and L10 share search files.
- L04 and L10 share `server/runtime/composition/modules/site-search.ts` (L04 first).
- L06 and L14 both touch publish and credential tool registration wiring (L06 first).
- L12 binds members functions in `composition/modules/members.ts`. L15 does not touch that file
  (its row 9 moves code inside `features/members`), and L12 goes first.

## API-surface budget (hard metric; baseline 821, tip 806)

New `contracts/core` files: `operator-locale`, `settings-vocabulary`, `credential-store`,
`secret-scan` (L02); `theme-ids` (L03, with L09's constants added); `declared-content-type-owners`,
`redirect-tables`, `fs-folder-recovery`, `post-kind`, `export-report` (L03); `declared-api-connection`
(L11); `term-ids` (L14); `media-chat-preview` (L08, neutral: its old home was already deep-imported
by two siblings). New non-contracts files: `platform/html/source-edits.ts` and
`features/site-backup/static-download-html.ts` (L07). Worst case is 806 + 14 = 820 ≤ 821, before
counting the deep imports that the I and H moves delete. v3's `contracts/core/media-access-evidence.ts`
is gone, because the cache stays in media (F8). Criterion 2 of the gate catches any API-surface
regression line.

## Final acceptance (integrated tip after L15)

`npm run check:architecture` exit 0, `npm run check:boundaries` exit 0, `npm run typecheck` and
`npm run typecheck:tests` exit 0, and `npm run test:ci` followed by `npm run check:test-baseline`,
both exit 0 by the runner's own status.
