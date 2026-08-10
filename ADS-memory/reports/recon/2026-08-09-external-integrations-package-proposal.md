# `@jini-ai/external-integrations` packaging proposal

**Date:** 2026-08-09
**Author:** Software Architect (dispatched recon)
**Status:** Proposal — read-only investigation, nothing changed in either repo
**Repos:** Jini = `/Users/la/Programming/Jini`, Tovu = `/Users/la/Programming/Tovu`

## Recommendation (lead)

Create `@jini-ai/external-integrations` as a **single, Node-only, backend package** and move
**only** the Composio backend into it — `git mv packages/admin/src/server/composio` →
`packages/external-integrations/src/composio`. Do **not** move the connectors UI, the
media-providers UI, `@jini-ai/media`, `@jini-ai/mcp`, or anything from `Tovu/src/integrations/`.

This is a **conditional** recommendation, not an unqualified one. Composio has zero consumers
today, exactly as it did on 2026-08-01 when it was folded *into* `@jini-ai/admin/server` for the
explicit reason that "a standalone package was a boundary that bought nothing." Pulling it back
out into a *different* standalone package one week later reduces sprawl only if there is a real,
near-term second integration planned to join it — otherwise this proposal nets +1 package for
zero consumer-facing benefit, which cuts directly against the owner's stated goal. If no second
integration is on the near-term roadmap, the leaner move is to leave composio where the
2026-08-01 fold put it and revisit when a real second vendor connector shows up. Section 7 makes
this case in full; I'm not manufacturing support for the package if the roadmap doesn't justify
it, but the packaging shape below is ready either way.

## Cross-import ledger (recommended option)

| Edge | Before | After | Change |
|---|---|---|---|
| `@jini-ai/admin` (devDependency) → `@jini-ai/protocol` | present (all 7 refs are `import type { JsonValue }`, confined to `server/composio/**`) | removed | **-1** |
| `@jini-ai/external-integrations` (devDependency) → `@jini-ai/protocol` | n/a | added (same 7 type-only refs, relocated) | **+1** |
| `@jini-ai/admin`'s `./server` export subpath | present, empty of anything but composio | removed entirely | package surface shrinks by one subpath |
| Any package/app → `@jini-ai/external-integrations` | n/a | **none** — zero consumers before, zero after | **0** |

**Net new package→package edges: 0.** The one edge that exists (protocol, type-only) relocates
from admin to the new package; it does not multiply. No other package or app in either repo
imports `@jini-ai/admin/server` today (verified — see §6), so nothing needs to change its import
path. **Net package count: +1** (18 → 19 Jini packages), justified only by the forward-looking
argument in the recommendation above, not by any present consumer relief.

---

## 0. Corrections to the brief's measurements

Two of the brief's four "already measured" packages turned out to have **comment-contaminated**
consumer counts once checked against real (non-comment) import statements — exactly the trap my
memory of this codebase flags: long evidence-shaped prose in these repos has encoded inference as
observation before. Both packages are full of doc comments that cross-reference sibling packages
by name for documentation purposes (e.g. "`@jini-ai/mcp`'s `okResult()` JSON.stringifies…") without
ever importing them. A naive `grep -rl` on the package name — which is what produced the "5,094
lines, mature, real consumers" framing — catches all of these as false positives.

| Package | Grep hits (naive) | Real value-import consumers (verified) |
|---|---|---|
| `@jini-ai/media` | 5 files across `deploy`, `http-kit`, `capability-providers` | **1**, and it's `examples/reference-web/src/daemon.ts` — a reference example, not shipped product code. Zero consumers inside `packages/`. Zero in Tovu. |
| `@jini-ai/mcp` | 7 files across `ui`, `protocol`, `daemon`, `http-kit` | **0** inside Jini's own `packages/` (all 7 hits are doc-comment cross-references). **Real and load-bearing in Tovu**, though: `Tovu/src/assistant/mcp-injection.ts:36` calls `require.resolve("@jini-ai/mcp")` to locate the package's CLI entry point for agent-runtime PATH detection — a genuine runtime dependency, not a comment. |

This matters directly for Q3 below: `@jini-ai/media` is far less "mature" than it looks (real
usage is one example app), and `@jini-ai/mcp` is genuinely load-bearing but *only* via one runtime
resolution call in Tovu, not via any Jini-internal wiring. Neither finding changes the
recommendation, but both change *why*.

---

## 1. File-level inventory

| Location | Lines (source) | Lines (tests) | Real consumers | Verdict |
|---|---|---|---|---|
| `packages/admin/src/server/composio/` (11 `.ts` files + `source-map.md`) | 5,709 | 5,599 (9 test files) | **Zero**, anywhere in Jini or Tovu. Confirmed independently three ways: (a) no import of `@jini-ai/admin/server` in either repo's source, (b) Tovu's own i18n string says outright *"Composio-backed third-party connectors aren't wired up in Tovu yet"*, (c) the 2026-08-01 fold changeset's own zero-consumer pickaxe check, which this recon re-verified still holds. | **Move** — conditional on a real forward roadmap (§7). |
| `packages/ui/src/features/connectors/` (23 `.ts`/`.tsx` files) | 5,804 | included above | **Real**: `Tovu/apps/admin/src/features/settings/SettingsUi.tsx` mounts `ConnectorsBrowser` today (rendered `unlocked={false}`, a disabled reference placeholder — matches the "not wired up" i18n string; the UI ships, the backend behind it doesn't). | **Stay in `@jini-ai/ui`.** See §2. |
| `packages/ui/src/features/media-providers/` (11 files) | 2,014 | included above | **Real**: `Tovu/apps/admin/src/features/media/Media.tsx` and `SettingsUi.tsx` both import `MediaProvidersTab` / `createFakeMediaProvidersPort`. Same "shown for reference and disabled" placeholder pattern, per Tovu's own i18n copy: *"Tovu doesn't have a media-provider backend yet."* | **Not in scope at all** — unrelated domain (media generation, not vendor-account connectors) and already correctly homed. Don't touch. |
| `Tovu/src/integrations/` (14 `.ts` files) | 2,787 | ~1,600 (8 test files) | Deeply embedded in Tovu itself: `src/server/routes/admin/integrations/**`, `src/server/modules/integrations*.ts`, `src/assistant/{byok-credential,site-credential-store,execution-credential-store,live-model-cache}.ts`, `src/newsletter/unsubscribe.ts`, `apps/admin/src/features/integrations/**`. Imports `@jini-ai/cms/core` types directly. | **Not in scope.** See below — this is a false-cognate collision on the word "integrations." |

### Why `Tovu/src/integrations/` is out of scope

Its own `INFO.md` states its job plainly: "Owns the outbound webhook subsystem (ADR-036):
subscription CRUD, HMAC-signed delivery on the outbox pattern, and retry/backoff to a
dead-letter state." This is Tovu's **outbound** webhook delivery system — Tovu CMS domain events
fanned out to *subscriber-supplied* URLs — not inbound third-party OAuth connectors. `KeyringPort`
(the one piece that looks generic) is reused by Newsletter's unsubscribe tokens and Analytics'
salt derivation, which are Tovu product features, not shared engine capability. Everything here
imports `@jini-ai/cms/core` types and is consumed by Tovu's own server routes and admin panels —
it is Tovu application code built *on* the engine, not engine code. Moving any of it into a Jini
package would also violate the R5 no-product-identity-strings boundary the moment it touched
anything CMS-subscription-shaped. The word "integrations" here and the word "integrations" in
"third-party integration code" are two unrelated meanings that happen to share a directory name;
the brief's inclusion of this path as a candidate was reasonable to ask about, but the evidence
says no part of it belongs in `@jini-ai/external-integrations`.

---

## 2. Does the UI move too, or stay in `@jini-ai/ui`?

**Stay.** Three independent reasons converge:

1. **Established pattern.** Every other Jini integration already splits this way: `@jini-ai/media`
   (backend, `packages/media/`) has its settings UI in `@jini-ai/ui/features/media-providers/`;
   `@jini-ai/mcp` (backend + CLI) has no UI of its own in this codebase. Composio would be the
   *exception* if its UI moved with the backend, not the rule.
2. **Zero package-specific imports.** I read `features/connectors/dependencies.ts` and
   `features/media-providers/dependencies.ts` in full — both import only from their own sibling
   files (`./ports.js`, `./types.js`, `./rules.js`, `./constants.js`) and ship an in-memory fake
   port as the only concrete implementation. Neither imports Composio, `@jini-ai/media`, or
   anything package-specific. There is nothing to "un-couple" by moving them; they were built
   host-agnostic from the start, per the file's own header comment: *"a real host supplies its own
   `ConnectorsPort` implementation."*
3. **Live import edge in Tovu.** `SettingsUi.tsx` imports `ConnectorsBrowser` and
   `MediaProvidersTab` from `@jini-ai/ui` today. Moving either would force an import-path edit in
   Tovu for a component that already works exactly as designed (a disabled placeholder awaiting a
   real backend) — a real cost for zero benefit.

`@jini-ai/ui`'s `core.ts` re-exports the full non-React connectors surface (`constants`, `ports`,
`rules`, `types`) and `index.ts` re-exports the React component — this mirrors the "old ui-core"
barrel shape by design (see the comment at `packages/ui/src/core.ts:63-66`), and nothing about
consolidating the *backend* changes that shape.

---

## 3. Does it absorb `@jini-ai/media` and `@jini-ai/mcp`?

**No, beside them, not into them.** With corrected consumer counts (§0):

- **`@jini-ai/media`** is a `domain: "capability"` package (image/video/audio generation gateway)
  — conceptually distinct from "third-party vendor-account connector," Composio's actual job.
  Merging domains the `packages/README.md` taxonomy deliberately keeps separate (`capability` vs
  `integration`) just to relocate an under-used package would trade one file organization problem
  for a worse one. Its real problem — one consumer, and that consumer is an example app, not
  product code — isn't solved by a rename; it's solved by someone wiring it into a real product
  surface, which is a different task entirely.
- **`@jini-ai/mcp`** already carries `jini.domain: "integration"` — the *closest* domain match of
  anything examined — but it is genuinely mature: it has a published `bin` (`jini-mcp`), and Tovu's
  `mcp-injection.ts` resolves it at runtime via `require.resolve("@jini-ai/mcp")` to locate that
  CLI entry point, which is how Tovu's agent-runtime finds an installed MCP server. Renaming or
  relocating it risks that resolution path for a package that would otherwise sit untouched inside
  the merge. There is no second consumer to *consolidate against* — absorbing it doesn't reduce
  the Jini package count in any way that matters, since it's already exactly one package; it would
  just be a riskier name for the same one package, breaking `require.resolve("@jini-ai/mcp")` and
  the `jini-mcp` bin name unless carefully aliased.

Absorbing either would be pure relocation churn: neither has a second real consumer to merge
*against*, which is the actual test for whether combining two packages reduces sprawl. Composio
qualifies for the founding move because it currently has **no home that fits its own domain** — it
sits in `admin/server` only because "admin was the only consumer" was true in 2026-07-23 and is no
longer true today (admin doesn't consume it either — nothing does). Media and mcp are each
correctly and stably domain-matched to their current package identity; moving them is not tidying,
it's shuffling into a superficially bigger box.

---

## 4. Concrete package shape

### `packages/external-integrations/package.json`

Follows `packages/media/package.json`'s single-root-export shape (no React, no subpaths needed —
composio's own docs already establish it needs nothing from admin's `/core` or `/browser`) rather
than `packages/admin`'s multi-entry shape, since there is no browser/React half to separate:

```json
{
  "name": "@jini-ai/external-integrations",
  "version": "0.1.0",
  "description": "Backend adapters for third-party vendor-account connectors: OAuth-authenticated tool catalog discovery and execution. Currently Composio.",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/AINSEP/Jini.git",
    "directory": "packages/external-integrations"
  },
  "jini": {
    "domain": "integration",
    "kind": "vendor-connector-gateway",
    "runtime": "node"
  },
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "!dist/**/*.test.js",
    "!dist/**/*.test.d.ts",
    "!dist/**/*.test.js.map",
    "!dist/**/*.test.d.ts.map",
    "!dist/**/__tests__/**"
  ],
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@jini-ai/protocol": "workspace:*"
  }
}
```

`domain: "integration"` matches `@jini-ai/mcp`'s existing classification — the taxonomy already
has the right bucket. `runtime: "node"` because composio's code touches `node:fs`, `node:crypto`,
`node:path` directly (same reason it landed under `admin/server`, not `admin/core`, in the fold).
No `jini.entries` needed — single runtime, single export, no split.

### `src/` layout

```
packages/external-integrations/
  src/
    composio/
      bounded-data.ts
      catalog.ts
      composio-config.ts
      composio-descriptions.ts
      composio.ts
      errors.ts
      file-lock.ts
      json-schema.ts
      output-protection.ts
      service.ts
      source-map.md
      __tests__/
        *.unit.test.ts
        *.contract.test.ts
    index.ts   # re-exports composio's public surface (was admin/src/server/composio/index.ts)
```

Namespacing composio under `src/composio/` rather than flattening it into `src/` costs nothing
today (it's a `git mv` either way) and avoids a second reshuffle if a real second vendor connector
arrives — at that point it gets `src/<vendor2>/` as a sibling, and only then does a `./composio`
export subpath get added (if some future consumer needs to cherry-pick just Composio without
pulling in others). No subpath is added speculatively now — nothing consumes this package yet, so
there's no caller shape to design against.

---

## 5. Cross-import ledger — detail

Verified by reading every `@jini-ai/protocol` reference inside `admin/src/**`: all seven are
confined to `server/composio/**`, and all seven are `import type { JsonValue }` (composio's own
provenance note: *"Replaced the product-owned bounded JSON schema dependency with
`@jini-ai/protocol`'s `JsonValue`"*). Nothing in `admin/core`, `admin/browser`, or `admin/react`
references `@jini-ai/protocol`. So:

- **Removed:** `@jini-ai/admin` → `@jini-ai/protocol` (devDependency, type-only) — this edge exists
  *only* because of composio; once composio leaves, admin's `package.json` drops the
  `@jini-ai/protocol` devDependency entirely, and admin's `jini.entries` shrinks from
  `{".", "./core", "./browser", "./react", "./server"}` to `{".", "./core", "./browser", "./react"}`.
- **Added:** `@jini-ai/external-integrations` → `@jini-ai/protocol` (devDependency, type-only,
  same seven references, unchanged).
- **Unchanged:** everything else. No package or app anywhere imports `@jini-ai/admin/server` today
  (checked: `grep -rln "@jini-ai/admin/server"` across both repos returns nothing outside admin's
  own `package.json`/`package-lock.json`), so no consumer needs an import-path update.

**Net: the one real edge relocates, it doesn't multiply. Zero new package→package edges are
created by this move**, because zero packages currently point at the code being moved.

---

## 6. Migration plan

Composio's zero-consumer status is what makes this unusually cheap — normally relocating 5,709
lines of source + 5,599 lines of tests across a package boundary means updating every import site
that pointed at the old location. Here that number is **zero**, verified independently of the
brief's own claim (search methodology in §0 applies equally here: I grepped for real import
statements, not just the string `composio`, and found none outside the package's own directory and
Tovu's disabled-placeholder UI copy, which references the *word* "Composio" in a translation
string, not the package).

1. `git mv packages/admin/src/server/composio packages/external-integrations/src/composio` —
   preserves file history (matches this codebase's established "move, don't re-author" convention
   for cross-package relocations).
2. Move `packages/admin/src/server/index.ts`'s composio re-exports into a new
   `packages/external-integrations/src/index.ts`; delete `packages/admin/src/server/` entirely
   (it contained nothing else — verified: `find packages/admin/src/server -maxdepth 1` shows only
   `index.ts` and `composio/`).
3. New `packages/external-integrations/package.json` (§4), `tsconfig.json` matching
   `include: ["src"]` (so tests under `src/**/__tests__/` get type-checked from day one — the
   2026-08-01 fold's own postmortem flagged that composio's tests were *never* type-checked in its
   original standalone `tsconfig.json`, which had `include: ["src"]` while tests lived in a
   top-level `tests/` dir; don't reintroduce that gap), and a `vitest.config.ts` carrying the
   100% statement/branch/function/line coverage threshold **package-wide** now (no longer needs to
   be a scoped `src/server/**` glob, since the whole package is composio — see the comment at
   `packages/admin/vitest.config.ts:29-37` this replaces).
4. Edit `packages/admin/package.json`: remove `./server` from `exports` and `jini.entries`; drop
   `@jini-ai/protocol` from `devDependencies`.
5. Edit `packages/admin/vitest.config.ts`: remove the `src/server/**` coverage threshold block
   entirely (nothing left under that glob).
6. Two changesets: `@jini-ai/admin: minor` ("removed the `./server` subpath; Composio moved to the
   new `@jini-ai/external-integrations` package") and the new package's own initial-publish entry.
7. Verify: `pnpm --filter @jini-ai/external-integrations run typecheck && run test:coverage`, then
   `pnpm --filter @jini-ai/admin run typecheck && run test` to confirm admin is clean with the
   subpath gone. Run `scripts/check-engine-boundaries.ts` (R5 in particular) against the new
   package — composio's own source-map already documents it was ported with product-identity
   strings stripped, so this should pass without changes, but it's the actual gate, not an
   assumption.
8. No Tovu-side change needed — Tovu never imported `@jini-ai/admin/server`, and doesn't need to
   import `@jini-ai/external-integrations` either, unless/until someone wires a real backend behind
   the already-live `ConnectorsBrowser` placeholder (a separate, future task).

Nothing here is gated on Tovu at all — that's the direct payoff of composio's zero-consumer state,
and it's also exactly why "cheap to move" and "worth moving" are different questions (§7).

---

## 7. Risks / the case against doing this

**The strongest argument against: this reverses a one-week-old decision made for the identical
reason this proposal would use to justify undoing it.** The 2026-08-01 fold's changeset is
explicit: *"Composio's only consumer is the admin surface, so a standalone package was a boundary
that bought nothing — the same reasoning that retired `@jini-ai/ui-core` into `@jini-ai/ui/core`."*
Today, composio's consumer count is not "the admin surface" — it's **zero**. If "zero real
consumers → don't pay for a standalone package boundary" was correct on 2026-08-01, it is *more*
true now, not less. A new `@jini-ai/external-integrations` package, populated by exactly one
tenant with exactly zero consumers, is the same boundary-bought-nothing situation the fold was
written to close, just relocated one level up.

The proposal only earns its +1 package if there is a **real, near-term second integration** that
would otherwise also get bolted onto whatever package happens to consume it first (repeating
composio's own history — it was folded into admin only because admin was its one caller at the
time). That is a legitimate, forward-looking reason to want a stable, non-admin-coupled home
*before* the second vendor connector arrives, so it doesn't repeat the same "wherever it landed"
drift. But it is a bet on a roadmap this recon has no visibility into, not a claim this recon can
verify from the code. I was told the package name is decided, which reads as evidence such a
roadmap exists — but the proposal should say plainly that the packaging shape is ready either way,
and the actual "should we do this now" call depends on information outside this codebase.

Secondary risks, all minor given the zero-consumer state:

- **Coverage-threshold discipline is easy to lose in the move.** Composio's 100% branch/statement
  bar survived the 2026-08-01 fold as a scoped glob specifically so it wouldn't be diluted or
  imposed retroactively on siblings. The same discipline has to survive a *second* move — it's a
  one-line vitest config, but it's exactly the kind of thing that silently regresses when nobody's
  forced to look at it (see the fold's own note about composio's tests never having been
  type-checked at all until the move surfaced it).
- **The `@jini-ai/protocol` devDependency is fragile the same way it already was in admin** — it's
  a type-only edge that works today because nothing consumes the package's `.d.ts` output at all.
  The moment a real consumer imports `@jini-ai/external-integrations`, that consumer's own
  toolchain needs `@jini-ai/protocol`'s types resolvable too (same latent question the 2026-08-01
  fold left unresolved for admin — this move doesn't fix it, just carries it forward unchanged).
- **Migration cost is low but not zero**, even with no consumers to update: changeset, two
  package.json edits, a new tsconfig/vitest config, and a boundary-checker run. Cheap, not free.

If there is no second integration in flight, my recommendation is to **not** create the package
yet — leave composio under `@jini-ai/admin/server` where the 2026-08-01 fold correctly put it, and
revisit this exact proposal (the packaging shape above doesn't change) the day a second real vendor
connector needs a home neither `admin` nor `capability-providers` fits.
