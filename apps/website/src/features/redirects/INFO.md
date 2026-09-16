# `redirects`

Tier-2 core library implementing SPEC-009 (Redirects admin section), per
ADR-033 (design), ADR-PIPE-009 (implementation architecture).

## Purpose

Redirect rule lifecycle (manual CRUD + import), bounded exact/prefix/wildcard
matching, hit-count telemetry, and the `SlugChangeCapture` auto-capture
implementation that keeps a renamed entry's old URL alive as a 301 the moment
the rename commits (never-break-links).

## Module map

- `types.ts` — `RedirectRecord`/`RedirectRevision`/`RedirectHitStats` and the
  command envelopes + typed errors (unchanged from the pre-existing stub,
  except this feature's deletion of the stale `SlugChangeCapture` shape and
  addition of `RedirectTargetNotAllowedError`).
- `ports.ts` — `RedirectRepoPort` (a genuine ADR-006 port, two adapters),
  `RedirectMatcher`/`RedirectHitSink`/`RedirectResolver` (internal seams).
- `ports.internal.ts` — package-private shared insert helper
  (`insertRedirectAndRevision`), the sole path INV-01 depends on. Imported
  only by `redirects.ts` and `capture.ts`.
- `redirects.ts` — THE write chokepoint: `createRedirect`/`updateRedirect`/
  `tombstoneRedirect`/`importRedirects`.
- `capture.ts` — `RedirectSlugChangeCapture`, the routing-owned
  `SlugChangeCapture` implementer. Performs NO transaction control of its own
  (Decision A) — relies on the caller's already-open ambient transaction.
- `phase-handler.ts` — `RedirectPhaseHandlerResolver` (read-path resolution,
  owns the open-redirect oracle gate, INV-03) + `registerRedirectsPhaseHandlers`
  (routing-chain registration).
- `reserved-destination.ts` — the one "same-origin destination lands on /admin or /api" verdict,
  shared by the read gate (`phase-handler.ts`) and the write gate (`redirects.ts`).
- `referrer-alias.ts` — the exact `Location` value `back`, which Express's `res.redirect` sends as
  the visitor's `Referer`; refused by both gates.
- `matcher.ts` — pure, bounded exact/prefix/wildcard matching + write-time
  pattern validation. No I/O.
- `hit-sink.ts` — off-hot-path hit aggregation + its outbox subscriber.
- `repo.memory.ts` / `repo.sqlite.ts` — the rule-of-two `RedirectRepoPort`
  adapters.
- `index.ts` — public barrel. `ports.internal.ts` is NOT re-exported.

## Known scope boundary

`src/features/post/post.ts`'s `updatePost` does not call the
`SlugChangeCapture` slot — wiring that is an explicitly out-of-scope follow-up
feature owed to the content-lib owner (see ADR-PIPE-009 Migration Safety).
REQ-15/16/17 (auto-capture correctness) are certified against a direct
`onSlugChange()` call inside a manufactured transaction, not a real
rename-through-the-admin-UI.

## Dependencies

`core` (ports/types), `routing` (phase registration + capture slot),
`origin` (open-redirect oracle), `identity` (`authorize()`).
