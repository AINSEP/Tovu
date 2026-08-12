# CTX-jini-infra-db-2026-08-11 — Round 1 (blind)

**Packet ID:** `CTX-jini-infra-db-2026-08-11`

Before doing anything else, reply on your first line with exactly:

`ACK_PACKET_RECEIVED CTX-jini-infra-db-2026-08-11 -- I received the packet and will work on it.`

Then answer. Do NOT read `AGENTS.md`, `CLAUDE.md`, or `CONTEXT.md` in any repository. Do not run any repo startup ceremony. You have no assigned persona beyond "independent senior architect".

---

## 1. Who is asking, and what they are building

A **solo developer** maintaining two separate git repositories on one machine:

- **Tovu** — the product: a self-hosted CMS / website engine. Ships a public site, an admin UI, themes, plugins, media handling, newsletters, forms, a store, and an AI assistant. TypeScript, CommonJS, Node 24.
- **Jini** — a pnpm monorepo of ~26 reusable `@jini-ai/*` packages that Tovu consumes. Jini is the developer's reusable engine layer: the intent is that other, future products can be built on it without Tovu.

Tovu currently links Jini packages by local path (`"@jini-ai/x": "file:../Jini/packages/x"`), not by publishing to a registry. Publishing to npm is set up but dormant.

## 2. What exists today (neutral inventory, verified by reading the repos)

**Tovu's database layer, `src/db/`:**
- `schema.ts` — a single Drizzle schema, **64 `sqliteTable(...)` declarations**, zero `pgTable`.
- `drizzle/` — **35 generated migration `.sql` files** plus a `meta/_journal.json`, produced by `drizzle-kit`. Applied at boot by Drizzle's own migrator, which tracks state in a `__drizzle_migrations` table.
- `sqlite/` — ~20 files. A mix of: connection bootstrap (`content-db.ts`), a shared query helper (`repo-helpers.ts`, used by 19 files), database-level operations (`db-ops.ts` — online backup, atomic-rename restore, WAL sidecar cleanup), a write-watermark/journal subsystem, and per-domain repository adapters named `*-repo.sqlite.ts` (media, origin, outbox, several credential stores).
- `postgres/` — exactly one file, `db-ops.ts`. No Postgres schema exists anywhere.
- The live database is an ~11MB `content.db` with ~65 tables, holding content, users, sessions, credentials, members, store orders, analytics, and plugin data. It is multi-tenant: several workspaces share the one file.

**Tovu's architecture around it:** domain code depends on ports (interfaces); the `*-repo.sqlite.ts` files are the adapters implementing those ports. Roughly 19 such adapter files exist. Domain/slice code does not import SQLite directly.

**Jini side:** a package `@jini-ai/infra` was recently created with two subpath exports — `./db/core` (driver-neutral ports and pure helpers, zero runtime dependencies) and `./db/sqlite` (a `better-sqlite3` driver). `better-sqlite3` and `drizzle-orm` are declared as optional peer dependencies. There is deliberately no `.` root export. A separate long-standing package `@jini-ai/sqlite` already exists serving Jini's *own* daemon data (event log, agent sessions, chat history, tool catalog) — a different database from Tovu's content database.

## 3. What the developer wants

Stated in their own words, then expanded:

> "I want to get as much database infrastructure to Jini as I can, because then I can reuse it for other projects."

> "I'm a bit worried if somebody switches to Postgres, or an even better use case if somebody wants to migrate from WordPress's MySQL to SQLite or Postgres. Do I have the infrastructure to do that? I probably need — I'm not really sure what I need."

> "The structure of `jini/infra/db` — storage should be the same way. Storage being videos, media, pictures, maybe voice notes. But the main thing is the database right now."

**Confirmed requirement, and it is a real near-term goal, not a hypothetical:** migrating a WordPress site's MySQL database into Tovu's database must be possible — **and it must be performed by an AI agent conversationally.** The developer's example: a user tells an agent *"please migrate stuff from the WordPress MySQL DB to Tovu's database system"* and the agent does it. This is not a hand-written one-off ETL script; the capability must be something an agent can drive.

## 4. The question you are being asked

Answer from first principles. There is no proposal on the table for you to approve — the developer explicitly does not know what they need yet, and wants the requirements interrogated before any design is chosen.

1. **What does a system actually need** to support (a) more than one database backend, and (b) agent-driven migration from a foreign database (WordPress MySQL) into it? Enumerate the real capabilities, not a layer diagram. Be concrete about what an agent needs to be handed in order to perform a migration safely — and what must never be left to the agent's judgement.

2. **Where should the boundary sit** between the reusable engine (Jini) and the product (Tovu)? What genuinely belongs in a reusable package, and what is product-specific and would poison a reusable package if moved into it? Justify by naming what breaks if the line is drawn wrongly in each direction.

3. **What is the internal structure** of the reusable database layer? Name the modules/subpaths and what each owns. This structure is also intended to be the template that a sibling storage subsystem (video, images, audio/voice notes) will mirror — so say whether that mirroring is sound or a mistake, and why.

4. **Is multi-backend support worth building at all here?** The developer has 64 SQLite-specific table declarations, zero Postgres tables, and is one person. Argue both sides. If you think this is premature generalization, say so directly and say what you would build instead.

5. **Failure modes.** What will be broken or regretted in 12 months under whatever you propose? What is the most likely way this specific developer, working alone, ends up with something unmaintainable?

## 5. How to answer

- Be adversarial and specific. Attack the requirements themselves if they deserve it; "you should not build this" is a valid and welcome answer if you can defend it.
- Do not propose a single blessed answer and stop. Name the genuine alternatives and what each costs.
- Prefer naming a concrete failure mode over stating a general principle.
- State explicitly what evidence or fact would change your position.
- Do not assume any design decision has already been made. Nothing is locked.
- Target 800–1400 words. End your response with `<<SWARM_END>>`.
