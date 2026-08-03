# `@jini-ai/cms` — identity canary port

**2026-08-02.** Branch `refactor/jini-admin-extraction` (Tovu) + uncommitted (Jini).
Companion measurement: `2026-08-02-zana-portability-measurement.md`.

## Why identity, and why it was cheap

Module-level closure over-counts — importing one file from a module does not drag the module. At
**file** level, `src/identity` minus its two composition files closes over **21 files across 2
modules with zero host and zero AI-layer files**. No Phase 4 applier redesign was needed.

Two prep changes in Tovu made that true (both landed, see below):

1. `core/tools/registration-kit.ts` imported `ForbiddenError`/`AuthorizeFn` from the `../commands`
   **barrel**, which re-exports `appliers.ts`, which names `features/post` and `features/settings`.
   Every domain's `tool-registrations.ts` imports that kit, so one barrel hop put a dependency on
   two content features into every domain in the tree. Both symbols live in `../commands/command`.
2. `identity/index.ts` re-exported `./wiring` (host composition naming `ContentDb`). Dropped; the
   only two consumers were `server/deps.ts` and `server/app.ts`.

## State: DONE

### Tovu (`refactor/jini-admin-extraction`, uncommitted)

- `core/tools/registration-kit.ts` — barrel import narrowed to `../commands/command`.
- `identity/index.ts` — `./wiring` re-export removed, with the reason recorded in the file.
- `server/deps.ts`, `server/app.ts` — import `../identity/wiring` directly.
- `npm run typecheck` clean; `node --test src/identity src/core` → **285 pass, 0 fail**.
- `check:architecture`: propagation cost **10.34 → 10.23**, core size **12.59 → 12.29**, module API
  surface **210 → 211**. Baseline updated. The +1 is `identity/wiring.ts`: it was public through
  the barrel before and is public through a deep import now — same public-ness, but the metric only
  counts deep-imported files. Intended, not a regression to chase.

### Jini `packages/cms` (uncommitted)

Layout — `./core` (universal), `./identity` (node), `./identity/hasher` (node), `./server`
(placeholder). Subpaths so a consumer takes identity without taking the whole CMS.

- `/core`: `ports.ts`, `commands/command.ts`, `commands/change-set.ts`, `tools/registration-kit.ts`.
- `/identity`: 17 files + `hasher.ts` behind its own subpath.
- `argon2` is an **optional peer** (`peerDependenciesMeta.optional`) + devDep, not a hard dep — the
  domain, its ports, and its in-memory repos must not require a native binary to import.
- **97 tests pass** (7 files), typecheck clean, build clean, `npm run guard` clean for cms.

## Things the port changed on purpose — read before reviewing

1. **`SeedIdentityInput.ownerPassword` is now required, with no default.** The original read
   `process.env.TOVU_ADMIN_USER` / `TOVU_ADMIN_PASSWORD` with a `"tovu-dev"` fallback. A package
   cannot read the host's env, and a library-supplied default owner password would mean every host
   that forgot to pass one shipped the same admin credential. Tovu preserves its exact behavior by
   passing `process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev"` from its own caller — **this is not yet
   wired, see REMAINING.**
2. **`identityInput()` returns `{ req, opt }` instead of `Readonly<Record<string, string>>`.** Jini
   compiles with `noUncheckedIndexedAccess`, which made all 17 field reads `string | undefined`.
   Asserting the type away would have hidden the one failure that can actually happen — a handler
   reading a field the published `inputSchema` forgot to mark `required`, silently passing
   `undefined` into a service call that stores it. `req()` re-checks and throws naming the field.
   This is strictly safer than the Tovu original.
3. **Optional properties widened to `?: T | undefined`** across `identity/types.ts`,
   `core/commands/{command,change-set}.ts`, and the service input types, for
   `exactOptionalPropertyTypes`. Runtime behavior identical — the alternative (conditional spread)
   would have changed key presence, which matters for persistence.
4. **`Argon2PasswordHasher` is not exported from `./identity`** — it is a concrete adapter, and the
   layering rule puts adapters in `/server` or the host. Reachable at `@jini-ai/cms/identity/hasher`.

## REMAINING — the important part

**Tovu is NOT rewired. The identity code is currently DUPLICATED in both repos.** That is the risky
state and the next task. Nothing in Tovu imports `@jini-ai/cms` yet.

1. **Rewire Tovu**: `src/core/{ports,commands/command,commands/change-set,tools/registration-kit}.ts`
   become re-export shims over `@jini-ai/cms/core` (chosen over rewriting imports because
   `core/ports` alone has **164 importers**, `core/commands` 63, `registration-kit` 23 — ~200
   rewrites is a separate mechanical slice, not part of a canary). `src/identity/` shrinks to
   `repo.sqlite.ts` + `wiring.ts` + a barrel re-exporting `@jini-ai/cms/identity`. Delete the
   duplicated sources and the 7 moved test files only after Tovu is green.
2. **`wiring.ts` must supply `ownerPassword`** — `process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev"`.
   Missing this changes first-boot behavior.
3. **Coverage gaps the port left, deliberately, rather than faking:**
   - `permission-migrations.ts` has **no test in the package** — its test imports
     `NAVIGATION_PERMISSIONS` from Tovu's `navigation` module. The test stays in Tovu, where it
     pins the real migration against the real list. The package's copy of the mechanism is
     untested until a generic test exists.
   - `repo.contract.test.ts` stayed in Tovu — it is a contract suite parameterized over the
     in-memory **and** SQLite repos. The right end state is the suite in the package and Tovu
     running it against its SQLite adapter; that is a real refactor, not a move.
   - `hasher.test.ts`, `wiring.test.ts` stayed in Tovu.
4. **`/server` layer**: `identity/repo.sqlite.ts` needs `db/schema.ts` (1,246 lines, shared by
   every domain). Untangling that is its own slice.
5. **The wider slice** still needs the other 5 min-cut edges from the measurement report — the
   load-bearing one is `core/commands/appliers.ts → features/post` (Phase 4).

## Not a problem

`npm run guard` reports one R2-deep-path violation in
`packages/ui/src/__tests__/utils/endpoint-policy.parity.test.ts`. It predates this work (committed
in `4082999e9`, and `packages/ui` has no uncommitted changes).
