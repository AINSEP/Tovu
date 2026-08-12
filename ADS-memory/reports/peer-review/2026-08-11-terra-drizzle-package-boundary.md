# Peer review — drizzle type identity across the @jini-ai/infra boundary

- **Peer:** `gpt-5.6-terra`, `model_reasoning_effort=xhigh`, codex-cli 0.147.0
- **Date:** 2026-08-11
- **Framing:** adversarial — asked to attack the recommendation, not validate it
- **Verdict:** stop after `db-ops`. Do NOT do the proposed raw-connection reshape yet.

## Corrections it made to the reviewed recommendation

1. "Drizzle's blast radius becomes one folder" is **false**. It removes drizzle from Jini only;
   Tovu still has 64 dialect-specific tables + ~19 drizzle adapters to replace.
2. The migration rationale was **overstated**. Moving migration orchestration would not require
   reimplementing `__drizzle_migrations` bookkeeping — the package already just calls drizzle's
   own migrator. 35 migrations argue against writing a NEW migrator, not against calling the
   existing one.
3. The rejected published-package alternative was **under-credited**. The failed `paths`
   experiment condemns the local symlink topology, not published peer dependencies.

---

I’ll test the stated repository facts only where they materially affect the architecture, then pressure-test the boundary and the “one install” alternative.

The source confirms the nominal boundary is real: `@jini-ai/infra` currently exports Drizzle handles and `SQL`/`SQLiteTable`-based helpers, while its raw backup adapter stays structurally typed. I’m checking the package/runtime resolution implications next, because that is where the local-link result can be misleading.

I would keep the successful SQLite backup/restore extraction, but I would not approve the broader “database infra” extraction yet. Your boundary recommendation fixes the immediate TypeScript failure; it also risks making a small shared helper look like a portable persistence platform that Tovu demonstrably does not have.

The strongest objection to your recommendation is that “Drizzle’s blast radius becomes one folder” is false. It merely removes Drizzle from Jini. Tovu still has 64 dialect-specific table declarations and ~19 Drizzle-backed repository adapters. Replacing Drizzle later still means replacing the schema DSL, generated migrations, and likely the adapters’ sync query idioms. The real win is narrower: *Jini’s* public API stops inheriting Drizzle’s nominal types.

The current source proves exactly why it failed: `openSqliteDb` returns a `BetterSQLite3Database`-derived type and calls `drizzle()`/`migrate()` directly ([open.ts](/Users/la/Programming/Jini/packages/infra/src/db/sqlite/open.ts:44)); `findOneBy` exposes `SQL`, `SQLiteTable`, and `BetterSQLite3Database` in its signature ([find-one-by.ts](/Users/la/Programming/Jini/packages/infra/src/db/sqlite/find-one-by.ts:21)). Those are not shareable across two physical Drizzle declarations. By contrast the backup adapter needs only `backup`, behind a structural `better-sqlite3` interface ([db-ops.ts](/Users/la/Programming/Jini/packages/infra/src/db/sqlite/db-ops.ts:25)). That is the natural package boundary.

Your proposed raw-connection API has costs you should make explicit:

- It still exposes a third-party type across the boundary. It happens to be structural today; that is an implementation accident, not a durable integration strategy. It is far less risky than Drizzle, but not dependency-free.
- Connection ownership becomes Tovu’s problem: close-on-bootstrap-failure, orderly shutdown, preventing plugins/workers from opening competing handles, and coordinating restore. The existing restore implementation explicitly requires a restart because open descriptors continue to serve the old inode ([db-ops.ts](/Users/la/Programming/Jini/packages/infra/src/db/sqlite/db-ops.ts:76)). A raw open helper makes accidental extra handles easier.
- Change `SqliteDbOpsAdapter` to accept `Pick<Database.Database, 'backup'>` directly. Its current `{ $client: ... }` input preserves a gratuitous Drizzle-shaped seam after the proposed demotion.
- `DEFAULT_PRAGMAS` is policy, not neutral infrastructure. WAL is usually right, but it affects deployment and backup behavior. Tovu should own the policy or pass it explicitly; Jini can provide an `applyPragmas(conn, pragmas)` primitive.

Your migration rationale is overstated. Moving migration orchestration does **not** require reimplementing Drizzle bookkeeping. The current package already delegates to Drizzle’s migrator unchanged ([open.ts](/Users/la/Programming/Jini/packages/infra/src/db/sqlite/open.ts:56)); that migrator creates/reads `__drizzle_migrations`, compares the latest timestamp, and wraps application in a transaction. So 35 existing migrations are an argument against writing a new migrator, not against calling the existing one. If you keep migrations in Tovu, do it because migrations are product schema ownership—not because centralizing the call would replay production history.

The rejected published-package alternative deserves more credit. A peer dependency is exactly the normal solution for a library whose API exposes another library’s types. With a real installed tarball/registry package, `drizzle-orm` is resolved from the consumer’s dependency graph; the outside-repo symlink instead realpaths Jini and discovers Jini’s separate install. Your failed `paths` experiment condemns that local development topology, not published peers.

It does impose a compatibility commitment: `^0.44.7` means Tovu must stay in the `0.44.x` line while using the Drizzle-facing Jini API ([package.json](/Users/la/Programming/Jini/packages/infra/package.json:55)). But that is not a permanent two-repo lock; it is an honest API contract for consumers that opt into `db/sqlite`. The neutral `db/core` remains independent. A shared workspace plus one lockfile/override makes this easy, although a workspace alone does not magically prevent separate peer contexts—enforce it and test it.

Tradeoff surface:

| Option | Upside | Downside |
|---|---|---|
| Raw SQLite connection; Drizzle stays Tovu-local | Solves nominal types; no Drizzle peer in Jini; appropriate to current architecture | Jini’s portable-db story is largely fiction; lifecycle and policy move to Tovu; no meaningful reduction in Tovu migration-away cost |
| Published Drizzle-facing extension with peers | Reuses `open`, migration runner, and helper; one type identity in normal consumer install | Jini now promises Drizzle compatibility and must release/test against it |
| Unified workspace | Best local developer ergonomics; one lockfile and type graph | Couples checkout/release workflow; still need dependency discipline |
| Stop at `db-ops` | Honest reuse of the one proven neutral capability; lowest solo-maintenance cost | Some duplicated bootstrap lines remain in future hosts |

Options you missed:

- Use `pnpm pack` and install the tarball into a disposable Tovu integration fixture. This distinguishes a real peer-package design from the symlink artifact before redesigning APIs.
- Use `--preserve-symlinks` plus matching TypeScript `preserveSymlinks` as a local-dev workaround. It may make both resolve through Tovu, but it is brittle across tooling and can create duplicate runtime singletons; do not make it the product architecture.
- Keep a Drizzle-specific package/subpath, but only publish it once it has at least a second real consumer. Do not force `db/core` to pretend it supports Postgres today.
- Generate/copy the tiny `findOneBy` helper into each host, or make it Tovu-local. Thirty-eight lines are cheaper than a transitive nominal-type contract.
- If backend portability is truly a requirement, define ports in domain terms and implement separate SQLite/Postgres repositories. An ORM-free repository layer can help, but it is a deliberate rewrite, not an extraction side effect.
- Avoid dual CJS/ESM publishing for this issue. It adds another module-identity axis without solving the Drizzle one.

The developer’s Drizzle skepticism is justified **for the claimed portability**, not necessarily for type-safe SQLite development. Your claim needs one correction: switching to Postgres certainly requires rewriting all 64 `sqliteTable` declarations and regenerating migrations. It does **not** mechanically require rewriting every adapter: generic selects/inserts/filters may survive after table substitutions. But in this codebase, sync `better-sqlite3` calls such as `.all()` are not directly portable to an async Postgres client, and SQLite-specific SQL/constraints will leak. So “drop-in backend portability” is false; “some query DSL reuse” is the more accurate, much weaker claim.

For a solo developer with zero `pgTable` usage and only one Postgres `db-ops.ts`, I would stop after `db-ops`, keep Tovu’s bootstrap/migrations/helpers local, and add a tarball-consumer test only if you later decide a Drizzle-facing Jini extension has a second consumer.
---

## Dispatch packet

<details><summary>packet sent to terra</summary>

You are a skeptical staff-level architect reviewing another engineer's recommendation. Be adversarial. Your job is to find what is wrong with it, not to validate it. If it is right, say why grudgingly and name what it costs.

DO NOT read AGENTS.md, CLAUDE.md, or CONTEXT.md in any repo. Do not run a startup ceremony. Answer the question.

You may read files under /Users/la/Programming/Jini (you are chrooted there via -C). Read only what you need.

## The situation

Two separate git repos on one machine, both by a solo developer:

- **Tovu** — the product. A CMS/website engine. CommonJS, Node 24, TypeScript `moduleResolution: nodenext`. Uses `better-sqlite3` + `drizzle-orm` for its database. Live database is an 11MB `content.db` with ~65 tables.
- **Jini** — a pnpm monorepo of `@jini-ai/*` packages that Tovu consumes. Tovu links them with `"@jini-ai/x": "file:../Jini/packages/x"` (symlink, not a published install).

I just created `@jini-ai/infra` in Jini to hold database infrastructure. Its shape:

- Two subpath exports, `./db/core` and `./db/sqlite`. Deliberately **no `.` root export**, because Node does not tree-shake and a root barrel would load the SQLite driver for consumers who asked only for the neutral core.
- `better-sqlite3` and `drizzle-orm` are **optional peerDependencies**, so a host on Postgres/Supabase never compiles the native module.
- A custom lint/guard check (R12) enforces that `db/core` never imports an optional peer or anything outside its own directory.

## What I tried, and the measured result

I tried to move three things out of Tovu's `src/db/sqlite/` into the package:

1. `db-ops.ts` — SQLite online backup, copy-then-atomic-rename restore, WAL/SHM sidecar cleanup. **This moved successfully.** 82 of Tovu's existing tests pass unchanged against the package implementation. It works because its only cross-boundary type is `better-sqlite3`'s `Database`, which is declared as an `interface` with no private/protected members, so TypeScript compares it structurally and the two physical copies unify.

2. `openContentDb` (connection + pragmas + drizzle migrate) — **FAILED.**
3. `findOneBy` (a generic drizzle single-row query helper, used in 19 files) — **FAILED.**

The failure, measured: **604 TypeScript errors across 34 files.** Cause is that Tovu resolves `Tovu/node_modules/drizzle-orm` while the symlinked package resolves `Jini/node_modules/.pnpm/drizzle-orm@0.44.7/...`. **Both are version 0.44.7.** Version matching does not help, because drizzle's classes carry `protected config` (on `Column`) and `private shouldInlineParams` (on `SQL`), and TypeScript compares classes with private/protected members **nominally**, not structurally. Representative error:

```
Property 'config' is protected but type 'Column' is not a class derived from 'Column'
Types have separate declarations of a private property 'shouldInlineParams'
```

A tsconfig `paths` mapping pointing both at Tovu's copy made it **worse (629 errors)**, because `paths` does not redirect the imports inside the linked package's own `.d.ts` files, which resolve relative to themselves under `nodenext`.

## Additional facts I verified

- Tovu's schema is **64 `sqliteTable` calls and zero `pgTable`** anywhere in the codebase. `src/db/postgres/` contains exactly one file (`db-ops.ts`).
- Tovu has **35 drizzle-kit-generated migrations** and a populated `__drizzle_migrations` table in the live database.
- Tovu already has a ports-and-adapters layer: domain code depends on ports, and `*-repo.sqlite.ts` files implement them. There are ~19 such adapter files.
- The developer has independently said they are skeptical of drizzle ("I don't believe in it").

## My recommendation, which you should attack

**Never let drizzle types cross the package boundary. Demote drizzle to an implementation detail of Tovu's adapter folder.**

Concretely: change the package API from `openSqliteDb({schema}) -> DrizzleHandle` to `openSqliteConnection(opts) -> better-sqlite3 Database`. Tovu calls `drizzle(conn, {schema})` itself. `findOneBy` stays in Tovu permanently. Migrations stay in Tovu too — I explicitly declined to move the migration runner into the package, because reimplementing drizzle's `__drizzle_migrations` bookkeeping risks re-running all 35 migrations against existing production databases.

Result claimed: the package never mentions drizzle at all, so no peer dep, no version lock, no nominal-type problem, and if drizzle is dropped later the blast radius is one folder.

**The alternative I rejected:** unify the two repos into one workspace (or publish `@jini-ai/infra` properly so the peer dep resolves at the consumer's root), giving exactly one drizzle install. I rejected it as permanently version-locking two repos for the benefit of sharing a few dozen lines.

## What I want from you

1. **Attack the recommendation.** Where is it wrong, naive, or hiding a cost? What breaks in 12 months that I am not seeing?
2. **Steelman the rejected alternative.** Is "version-locks two repos" actually a serious objection, or am I overweighting it? Note that peer dependencies are the standard mechanism here and I may be misusing the failure of a *local symlink* to condemn a *published-package* design.
3. **Upsides AND downsides of each option, explicitly.** Not a verdict only — I want the tradeoff surface.
4. **Name options I did not consider.** Be concrete. (Examples of the space, not a menu to pick from: `paths`+`declaration` tricks, generating schema-independent adapter interfaces, an ORM-free repo layer, dual-package publishing, `pnpm link` vs `file:`, TypeScript project references, giving up on the SQLite/Postgres switch entirely as a YAGNI.)
5. **Is the developer's skepticism of drizzle justified given these facts?** Specifically: is my claim correct that drizzle does NOT deliver backend portability, since `sqliteTable`/`pgTable` are different APIs and switching means rewriting all 64 tables plus every adapter? If I am wrong about that, say so plainly.
6. If you think the entire `@jini-ai/infra` extraction is not worth doing at all for a solo developer, say that outright.

Be specific and concrete. Cite file paths or evidence where you check something. Prefer naming a real failure mode over a general principle. Keep it under ~1200 words.

</details>
