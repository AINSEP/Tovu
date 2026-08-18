# Settings exception removal — scoping measurement

**Status: measurement only. No files edited.**
**Date:** 2026-08-17 (session 15)
**Supersedes the recommendation in:** `2026-08-17-settings-blocker-investigation.md`

## Decision reversal

The earlier investigation recommended **leaving** the 3 side-door files as direct imports and
accepting `settings` as a permanent one-off exception, on the grounds that removing them "only
moves RATCHET-tier metrics (propagation cost, API surface)" and fixes no HARD_CONSTRAINT.

**The owner reversed this on 2026-08-17.** The reversal is not a disagreement about the metrics —
those are accepted as correct. It is a disagreement about the *criterion*:

> The exception is currently protected by a comment that says "do not restore consistency here or
> you will reintroduce a cycle." A comment is not an enforcement mechanism. Removing the exception
> entirely moves that protection from prose into the CI gate (`npm run check:architecture`), which
> cannot be talked out of it by a future reader doing a well-intentioned consistency pass.

Trading a documented landmine for a structural wall is the stated goal. Robustness, not metrics.

## Why this is safe for the other 25 consumers

`features/settings` is imported by **25 non-test files** repo-wide. None of them need to change.
Only files inside `src/assistant/` can close the `assistant <-> features/settings` cycle, because
the cycle requires an edge in BOTH directions and only `assistant/` receives the reverse edge from
`registerToolContributor`. Settings remains a freely-importable shared library for everyone else —
exactly as it is today.

## Measured blast radius

### The runtime (value) imports that must be broken — 8 bindings, 3 files

Type-only imports are erased on the runtime-only graph the cycle metric gates on, so they are NOT
part of the problem and must not be churned:

- `src/assistant/public-assistant-settings.ts` — **5 values**: `getEffective`,
  `resolveDefinitionRaw`, `SCOPE_BIT`, `registerDefinitions`, `set`.
  (type-only, leave alone: `SettingsRepoPort`, `SettingValueSchema`, `AuthorizeFn`)
- `src/assistant/custom-instructions.ts` — **2 values**: `getEffective`, `INSTRUCTIONS_NAMESPACE`.
  (type-only, leave alone: `SettingsRepoPort`)
- `src/assistant/execution-mode-settings.ts` — **1 value**: `ensureSettingDefinitions`.
  (type-only, leave alone: `EnsureSettingDefinitionsDeps`, `SettingDefinitionSpec`)

### The awkward two

`SCOPE_BIT` and `INSTRUCTIONS_NAMESPACE` are plain **constants**, not functions. Injecting a
constant through a deps bag is possible but reads badly. Consider instead relocating them to a
dependency-free shared location, or accepting them as injected fields for uniformity. This is the
one genuine design decision in an otherwise mechanical change — the implementing agent should pick
one and say which, not silently do both.

### Production call sites — 14 files

Ranked by reference count (includes re-exports and type positions, so the true deps-assembly
count is lower — verify per file rather than trusting this as a change list):

    5  src/assistant/index.ts
    4  src/server/app.ts
    3  src/server/routes/site/products.ts
    3  src/server/routes/site/pages.ts
    3  src/server/deps.ts
    2  src/server/routes/types.ts
    2  src/server/routes/admin/assistant/put-settings.ts
    2  src/server/routes/admin/assistant/get-settings.ts
    2  src/server/modules/site-assistant.ts
    2  src/server/agent-daemon/agent-daemon-server.ts
    1  src/server/http/site/render.ts
    1  src/index.ts
    1  src/assistant/site-credential-store.ts
    1  src/assistant/agent-daemon-port.ts

### Test blast radius — 62 refs, 3 files

    32  src/assistant/__tests__/public-assistant-settings.test.ts
    23  src/assistant/__tests__/custom-instructions.test.ts
     7  src/server/__tests__/site-assistant-routes.test.ts

Roughly 2x the `post` fix (which was 3 production files + 32 test call sites). Same shape of work.
Add a local `makeDeps()` helper per test file FIRST rather than editing 62 sites by hand — this is
the pattern `store.unit.test.ts` already uses and the `post` fix followed.

## After the edges are cut

Once no file in `src/assistant/` value-imports `features/settings`, `settings` can convert via the
**standard** pattern (settings itself calls `registerToolContributor`), and the one-off wiring in
`src/server/tool-catalog-manifest.ts` — plus both of its explanatory comments — should be removed.
That is the whole point of the exercise; leaving the special-case wiring in place while also doing
the standard conversion would be the worst of both.

## Precedent to copy

Three landed examples of the identical structural-injection technique, newest last:

- `996203a7` — `dual-read.ts` (Option B, the original)
- `90c85779` — `store.ts` / `extractGitHubLogin`
- the `post` / `listPublishedPosts` fix (session 15) — closest in size and test-churn shape

## Sequencing constraint

Must land AFTER the `post` conversion. Both touch `src/server/tool-catalog-manifest.ts` and
`src/assistant/tool-registrations.ts`; running them concurrently in separate worktrees will
conflict on those two files.
