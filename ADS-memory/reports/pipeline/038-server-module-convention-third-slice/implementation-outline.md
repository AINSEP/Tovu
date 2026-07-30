# Implementation Outline: Server Module Convention — Third Slice (content + members)

- Spec: SPEC-038 v1.0.0
- Status: PRODUCED (retroactive, backfilled after implementation per explicit user request)
- Trigger result: System Wiring only — the architectural pattern itself (ServerModuleHandle) was already decided by ADR-046 and exercised twice before (SPEC-031, SPEC-034); this slice makes no new design decision, it applies an established one to 2 more domains.
- Date: 2026-07-16T00:00:00Z (backfilled)
- Author: Software Architect (in-session, direct — Claude Code host, per explicit user request)

> This outline does not re-derive the ServerModuleHandle pattern — that decision belongs to ADR-046 and its first-slice outline (if one exists for SPEC-031/034). This document records what THIS slice specifically moved and why the two non-obvious deps-field findings mattered.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence |
|---|---:|---|
| Boundary Cross | yes | 11 content registrars + 6 members registrars, moved from inline `app.ts` calls into 2 new module files |
| Contract Change | no | Zero registrar function bodies changed — pure re-typing + relocation |
| System Wiring | yes | `app.ts`'s composition-root call sites changed (17 imports removed, 2 module-factory calls added) |
| Critical Cross-Boundary Invariant | no | No invariant introduced; behavior required to be byte-identical (REQ-05/AC-03) |
| Parallelization Ambiguity | no | Content and members are independent domains, done sequentially by one implementer without ordering conflict |

## Module/File Map

| File | Change | Notes |
|---|---|---|
| `src/server/routes/admin/content/deps.ts` | new | `ContentRouteDeps` — final field set: `workspaceId`, `authorize`, `clock`, `idGen`, `postRepo`, `changeSets`, `outbox`, `bus`, `settingsRepo`, `presentationRepo`, `themes` |
| `src/server/modules/content.ts` | new | `createContentModule` — wraps 11 registrars |
| `src/server/modules/members.ts` | new | `createMembersModule({admin, public})` — wraps 6 registrars, reuses pre-existing `MembersRouteDeps`/`MemberPublicRouteDeps` unchanged |
| 11 posts/pages/change-sets/presentation registrar files | retyped | `RouteRegistrar` → `ContentRouteRegistrar`, no body changes |
| `src/server/app.ts` | changed | 17 dead imports removed, inline blocks replaced with 2 module-factory calls at original position |

## Non-Obvious Finding (why this wasn't a blind guess)

The spec's own guessed `ContentRouteDeps` field list omitted 2 fields that turned out load-bearing, confirmed only by reading all 11 registrar bodies directly (not by inference from the spec's guess):
- `bus` — `posts/update.ts` calls `processOutbox({outbox, bus, clock})` to synchronously drain the SEO sitemap-cache-invalidation subscriber.
- `settingsRepo` — `change-sets/revert.ts`'s reverter needs it for the SPEC-007 settings-ledger applier `core.commands.appliers` reverts through.
- `themes` was also missing from the spec's guess — needed by `presentation/{get,patch-active-theme}.ts`'s `validThemeIds(deps.themes)` call.

This is exactly the failure mode a spec-only Implementation Outline (without reading the actual registrar bodies) would have missed — confirms the value of "read the file, don't guess" as a standing instruction for this class of spec, not just a one-off caution.

## Test Expectations (mapped to spec ACs)

Unlike SPEC-036/037, this domain HAS pre-existing integration test coverage (this is backend route relocation, not new frontend surface) — the regression gate is re-running existing suites unmodified, not new smoke scripts.

| AC | Verified by |
|---|---|
| AC-01 (content domain unchanged) | Existing content-domain test suites re-run unmodified against real `createApp()` — pass |
| AC-02 (members domain unchanged) | Existing members admin+public test suites re-run unmodified — pass |
| AC-03 (full suite unchanged) | Full suite: 1697/1695/2 before and after (Coordinator independently re-ran, not just trusted) |
| AC-04 (typecheck clean, no dead imports) | `npx tsc --noEmit -p .` clean (Coordinator independently re-ran); `grep` for the 17 relocated registrar names in `app.ts` — zero matches (Coordinator independently re-ran) |

## Critical Invariants

None new. The implicit invariant carried forward from ADR-046/SPEC-031 (byte-identical external behavior across the extraction) is the entire point of AC-03/AC-04 above.

## Downstream Handoff Notes

- Confirms the established pattern generalizes cleanly to a 3rd/4th domain pair — no scaling friction found.
- The 2 missed deps fields (`bus`, `settingsRepo`, `themes`) are a useful data point for SPEC-040/041/042's implementers: always read every registrar body directly, a spec's own guessed field list is a starting point, not ground truth.
