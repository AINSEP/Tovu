# navigation Overview

Owns the menus/navigation write-service and render-time read model for
ADR-029: menu trees as editable content, a derived location→menu binding
index, and the resolved render model themes consume.

## Responsibilities

- validate and persist whole-menu-tree edits (create, whole-tree replace with
  OCC, soft-delete → hard-purge)
- maintain the derived `nav_location_bindings` index (one menu per location,
  last-writer-wins reassignment) alongside each menu's own `locations` field
- resolve a bound menu's item tree into a render-ready `ResolvedNav` for
  themes, marking unresolvable/unavailable targets rather than dropping them

## Rules

- Keep navigation business rules inside this library, not in Express routes,
  shells, or theme code (ADR-020 §6 — themes receive resolved data only).
- `entryRef`/`termRef`/`route` targets are resolved through the injected
  `ResolveTargetHrefFn` seam (`resolver.ts`), never by importing `src/routing`
  directly — that library is owned and built separately (ADR-039). Wiring the
  real implementation in later is a DI swap, not a rewrite.
- Repositories stay behind their ports (`MenuRepoPort` in `repo.memory.ts`,
  `NavLocationBindingRepoPort` in `ports.ts`). No direct SQL from feature code.
- The binding index is derived and rebuildable, never a second source of
  truth — do not write it outside `menu-service.ts`'s `assignLocation`/
  `deleteMenu` (ADR-029 §Consequences load-bearing discipline).

## Known simplifications (this build)

- **"A menu is an entry" (ADR-029 §2) vs. this build's storage.** ADR-022's
  generic content-entries system is not implemented as reusable code yet
  (only `post` exists as a concrete type). Rather than force-fitting menus
  into a not-yet-generic system, this build ships a **self-contained**
  `InMemoryMenuRepo` (`repo.memory.ts`) storing `NavMenuEntry` records
  directly, behind a local `MenuRepoPort` interface that exists only to make
  the eventual swap to an entries-backed adapter a drop-in. When the generic
  entries system ships, this repo and port should be retired in favor of it.
- **No real cross-write transaction.** `assignLocation`'s two writes (the
  menu's own `locations` field + the derived binding-index row) are, per
  ADR-029 §4 and the Round-3 audit fold item 2, logically one transaction and
  a second in-tx participant alongside routing's `SlugChangeCapture` slot.
  Neither real transactions nor a generalized in-tx registry exist as running
  code yet, so the writes happen sequentially with no rollback on partial
  failure — documented in `menu-service.ts`'s `assignLocation` doc comment.
- **`termRef` link integrity is a named Wave-1 blocker, not implemented.**
  Per the ADR-029 Round-3 audit fold item 1, `entry_refs` (ADR-022 §5) is
  entry-to-entry only; there is no accepted term-target schema yet. This
  build's resolver seam treats `termRef` the same as any other kind it hands
  to the injected `resolveTargetHref` — a real resolver has nothing to
  consult and should return `null`, which resolves to `available: false` on
  that item only. See `resolver.ts`'s file header and test fake.
- **Id-stability is validated, not diffed.** `validateAndCloneTree`
  (`menu-service.ts`) rejects duplicate/missing ids within a submitted tree,
  but does not diff against the previous version to catch a *specific*
  surviving node losing its original id (full stability enforcement needs a
  tree-diff mechanism, out of scope here).
- **Label fallback to target title is not implemented.** `resolver.ts`
  resolves an absent `label` to `""` rather than a target's title, since the
  injected `ResolveTargetHrefFn` seam does not return title metadata yet.

## Future direction

- Swap `InMemoryMenuRepo` for an entries-backed adapter once the ADR-022
  generic entries system exists as reusable code; add the SQLite
  `NavLocationBindingRepoPort` adapter (ADR-015 core migration engine).
- Wire `resolver.ts`'s `ResolveTargetHrefFn` to `src/routing`'s real
  `urlFor`/`isActive` once that library's shape is stable (ADR-039).
- Add the `term_refs` (or extended `entry_refs`) schema once content-lib
  signs off, then promote `termRef` from "resolves to unavailable" to real
  integrity tracking.
- Route all mutations through the ADR-008 command gateway once it exists,
  retiring the "call these functions directly" stand-in.
