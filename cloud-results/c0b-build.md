DONE 9746d583f be416ea0a

# C0b build — site-key DTO cutover (P9U C0b, per `plans/P12-cut-plan.md` @ `origin/plan/whats-left-1122`)

| repo | branch | base | head |
|---|---|---|---|
| Jini | `codex/c0b-build-jini` | `origin/integ/merge-14-2026-11-22` @ `4902a6a1a` | `9746d583f6302cda6d142c46561f478402dba2cc` |
| Tovu | `codex/c0b-build-tovu` | `origin/integ/merge-13-2026-11-22` @ `f7185f153a` | `be416ea0acbcded5b609b829f9ab2c8db83cb910` (C0b.T commit) + this report commit |

## Jini
Cherry-picked `648f96558` → `571a7e68`, `fd73c289b` → `29d8b950`, `56c604159` → `9746d583`, in order.
`56c604159` also edited `cloud-results/ex3-c0b-jini.md` (a report file absent on merge-14, conflict: deleted-by-us);
that file is outside the approved write set, so it was dropped from the pick. Resulting diff vs merge-14 is exactly the
approved write set: `packages/core/src/contracts/site/site-key.ts`, `packages/core/src/__tests__/site-key.unit.test.ts`,
`packages/core/package.json` (`jini.entries` + `exports`), `api-baseline/jini-ai__core.json` (`./contracts/site/site-key` block),
`.changeset/p9u-c0b.md`. Declarations match the sheet's approved declarations exactly.

- `pnpm --filter @jini-ai/core run typecheck` — exit 0
- `pnpm --filter @jini-ai/core test src/__tests__/site-key.unit.test.ts` — 1 file, 4/4 passed
- `pnpm api:check` — exit 0, `[api] checked 40 packages, 696 entries, 17255 symbols` (after `pnpm -r build`; the first run before any build
  failed only because `dist/` was absent in the fresh clone)

## Tovu (C0b.T)
Setup: `npm ci` (root, apps/admin), `@tovu/sdk` build, `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` at Jini `9746d583f`.

STOP checks: subpath present in linked Jini (yes); consumers of the copied DTOs = exactly the 12 listed importers + the parity
fixture + the website union (no extra consumer); Tovu wire shapes identical to the Core declarations, member for member (yes).

### Baseline (unmodified merge-13 tree, linked Jini)
- `npm --prefix apps/admin run typecheck` — **exit 2, 4 pre-existing errors**, all AdminKit wiring, none in C0b files:
  `src/integrations/jini-kits.ts(20,3)` TS2741 `Icon`, `(22,3)` TS2741 `useT`, `src/main.tsx(89,25)` TS2741 `values`,
  `src/__tests__/render-with-jini-kits.tsx(23,104)` TS2769. Cause: merge-13 lacks the sheet's prerequisite branches
  (`codex/ex2-tovu-halves` edits `jini-kits.ts`). Indicative only: a no-commit trial octopus merge of
  `codex/ex2-tovu-halves` + `codex/ex2-holds-tovu` on top of C0b.T gave admin typecheck exit 0, but that merge reported a
  conflict, so it is not a clean proof; it was aborted and not pushed. Per the dispatch, the prerequisites were **not** merged.
- `npm run typecheck` (website + e2e) — exit 0.

### Tests first
`lib/__tests__/site-key-state-parity.unit.test.ts`: `expectTypeOf` added to the Vitest import,
`import type { AdminSiteKeyState } from "@jini-ai/core/contracts/site/site-key";` added, new case
"matches the Core state union in both directions" (`expectTypeOf<AdminSiteKeyState>().toEqualTypeOf<(typeof ADMIN_SITE_KEY_STATES)[number]>()`),
existing website runtime comparison kept. Header rewritten to describe the Core union, the host tuple and the website union it reads.
Test count in that file: 2 → 3.

### Mutations
- **`core-only-site-key-state`** (Tovu): added `| "rotating"` to `AdminSiteKeyState` in the linked Jini contract
  (`packages/core/dist/contracts/site/site-key.d.ts`, the file Tovu resolves). Admin typecheck: **RED** — new
  `src/lib/__tests__/site-key-state-parity.unit.test.ts(30,53): error TS2344` on the parity assertion (plus the 4 baseline errors).
  Restored from backup; Jini tree clean.
- **Jini review mutation**: added `hex?: string` to `AdminGeneratedSiteKey`. Core typecheck: **RED** —
  `src/__tests__/site-key.unit.test.ts(85,12): error TS2322: Type 'true' is not assignable to type 'false'` (the non-reveal shape fixture).
  Restored (`git checkout`); core typecheck back to exit 0.

### FILES MOVED (Tovu, all under `apps/admin/src/`)
- `features/sites/api/sites-api.types.ts` — deleted the ten copied declarations and their comments (`AdminSiteKeyRuntimeMode`,
  `AdminSiteKeyState`, `AdminSiteKeyStatus`, `AdminSiteKeyGenerateOutcome`, `AdminGeneratedSiteKey`, `AdminImportedSiteKey`,
  `AdminSiteKeyAffectedWebhook`, `AdminSiteKeyStartFreshPreview`, `AdminStartedFreshSiteKey`, `AdminRevealedSiteKey`);
  kept `ADMIN_SITE_KEY_STATES` with a comment pointing to the Core union and the parity test. Declarations now live in
  `@jini-ai/core/contracts/site/site-key` (Jini `packages/core/src/contracts/site/site-key.ts`).
- Repointed to `import type { … } from "@jini-ai/core/contracts/site/site-key";` with the exact listed bindings:
  `features/dashboard/hooks/dashboard-dependencies.hooks.ts:1`, `features/dashboard/hooks/dashboard-port.hooks.ts:1`,
  `features/dashboard/rules.ts:1`, `features/security/__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx:8`,
  `features/security/__tests__/SiteKeyTab.unit.test.tsx:10`, `features/security/__tests__/use-site-key-recovery.unit.test.ts:4`,
  `features/security/__tests__/use-site-key.unit.test.tsx:4`, `features/security/hooks/site-key-status.rules.ts:1`,
  `features/security/hooks/use-site-key.hooks.ts:4`, `features/security/hooks/use-site-key-recovery.hooks.ts:3`,
  `features/security/hooks/site-key-port.hooks.ts:1`, `features/sites/api/sites-api.ts:4` (split: Core import, then the
  remaining `./sites-api.types` import exactly as the sheet lists).
- `features/sites/api/sites-api.ts` doc comment (sheet's line 68, now 69 after the split): `{@link AdminSiteKeyGenerateOutcome}` → plain backticked text `AdminSiteKeyGenerateOutcome` (no link).
- No re-export shells; types only; no runtime change.

### Verification (after C0b.T)
- `npm --prefix apps/admin run typecheck` — exit 2, **the same 4 baseline errors, zero new**.
- `npm run typecheck` (website + e2e) — exit 0.
- `npm --prefix apps/admin test -- --maxWorkers=2 <the 10 listed files>` — **10 files, 379/379 passed**.

## Note
**Publish the new `@jini-ai/core` subpath (`./contracts/site/site-key`, changeset `.changeset/p9u-c0b.md`) before any
registry-built merge** of `codex/c0b-build-tovu`: Tovu's `@jini-ai/core` is a registry dep (`^0.7.3-next.2`); this build was
verified only against a `link:jini` local link. Nothing was published and no tags were created.
