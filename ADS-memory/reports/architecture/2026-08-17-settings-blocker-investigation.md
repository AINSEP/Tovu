# Settings domain — structural blocker investigation

**Status: investigation only. No files were edited.**
**Agent:** CodeBase Analyzer (settings-blocker-investigation)
**Date:** 2026-08-17

## Question

Can `settings`'s `DOMAIN_SLICES` entry in `src/assistant/tool-registrations.ts` be converted to
the `tool-contribution-registry.ts` pattern the same way the other 22 domains were, given that
`src/assistant/public-assistant-settings.ts`, `src/assistant/custom-instructions.ts`, and
`src/assistant/execution-mode-settings.ts` already import `src/features/settings` directly and
are not part of `DOMAIN_SLICES` at all?

## What the 3 files actually import from `features/settings`, and why

All three use `features/settings` as a **generic settings-ledger engine/library**, not as "a
domain whose AI tools assistant wants to expose." None of the three touch `buildSettingsRegistrations`
or `settingsDerivedRisk` (the AI-tool builders that `DOMAIN_SLICES`'s `settings` entry wires) —
those live in a completely separate part of the barrel.

- **`public-assistant-settings.ts`** — imports `SettingsRepoPort`, `getEffective`,
  `resolveDefinitionRaw`, `SCOPE_BIT`, `SettingValueSchema`, `registerDefinitions`, `set`,
  `AuthorizeFn`. It defines and owns its own namespace, `site.assistant.*` (the public-assistant
  on/off switch), using the same boot-time-register / read / validate-then-write pattern that
  `seo/settings.ts` and `comments/settings.ts` use for their own namespaces. This is infra reuse,
  not tool wiring.
- **`custom-instructions.ts`** — imports `SettingsRepoPort`, `getEffective`,
  `INSTRUCTIONS_NAMESPACE` (a namespace constant `features/settings/index.ts` itself exports,
  `core.instructions`). Reads `core.instructions.custom` for the agent daemon's system-prompt
  overlay.
- **`execution-mode-settings.ts`** — imports `ensureSettingDefinitions`,
  `EnsureSettingDefinitionsDeps`, `SettingDefinitionSpec`. Registers the 8 `core.execution.*`
  definitions backing the admin "Execution mode" tab (Local CLI vs BYOK).

All three files' own `deps` bags (`settingsRepo`, `clock`, `ids`, `principals`, etc.) are already
assembled and injected by the composition root — every real caller of their exported functions
lives under `src/server/**` (`server/deps.ts`, `server/routes/types.ts`,
`server/routes/admin/assistant/{get,put}-settings.ts`, `server/agent-daemon/agent-daemon-server.ts`,
`server/http/site/render.ts`, etc.) or in `src/assistant/index.ts`/`src/index.ts` (the allowed
outer composition callers). What is **not** injected is the settings *engine functions themselves*
(`getEffective`, `set`, `registerDefinitions`, `ensureSettingDefinitions`, `SCOPE_BIT`) — those are
imported directly by name.

## How the registry pattern actually works (verified against `comments` and `tool-catalog-manifest.ts`)

`tool-contribution-registry.ts` (in `src/assistant/`) exposes `registerToolContributor`,
`listToolContributors`, `resetToolContributorsForTests`. The converted-domain shape, confirmed by
reading `src/comments/tool-registrations.ts`:

1. The feature module itself imports `registerToolContributor` **from assistant**
   (`import { registerToolContributor } from "#src/assistant/index"`).
2. It calls `registerToolContributor({ domain, build: buildXRegistrations, risk: xDerivedRisk })`
   inside its own `contributeXTools()` function.
3. `src/server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()` — the composition
   root — imports and calls every domain's `contribute<Domain>Tools()` once at boot.
4. `assistant/tool-registrations.ts`'s `buildAssistantToolRegistrations` folds
   `listToolContributors()` together with whatever is left in `DOMAIN_SLICES`.

**The critical property**: this inverts the edge. Before conversion, `assistant -> comments`
(assistant imports comments' builder by name). After conversion, `comments -> assistant`
(comments imports `registerToolContributor` by name) — confirmed by
`tool-contribution-registry.ts`'s own header: *"Keeping the registry ... inside `assistant/` while
feature modules reach INTO it one-directionally (`comments -> assistant`, never the reverse) is
what actually breaks the `assistant <-> {comments,newsletter}` cycle."*

## Why settings is a different shape, not just an incomplete conversion

I checked whether `features/settings` currently imports anything from `src/assistant` at all:

```
grep -rn "from [\"'].*assistant" src/features/settings/   →  no matches
```

It doesn't. Zero edges point from `features/settings` back into `assistant` today, so the current
`assistant -> settings` edge (via the `DOMAIN_SLICES` entry *and* via the 3 side-door files) is a
**one-way** edge, not part of any existing cycle — confirmed against the committed baseline
(`development/scripts/check-architecture.baseline.json`): `moduleCycles.mutualCycleCount: 0`,
`largestScc: 0`, no pair involving `settings` or `assistant`.

Applying the **standard** conversion (settings imports `registerToolContributor` from assistant,
the same way `comments`/`widgets`/etc. do) would add a brand-new `features/settings -> assistant`
edge. But `assistant -> features/settings` already exists via the 3 side-door files, as **real
value imports** (`getEffective`, `set`, `registerDefinitions`, `ensureSettingDefinitions`,
`SCOPE_BIT` are all runtime values, not `import type`). Adding the reverse edge on top of that
would create a brand-new **2-node mutual cycle**: `assistant <-> features/settings`.

`module cycles / SCC (runtime-only)` is one of the four metrics classified `HARD_CONSTRAINT_METRICS`
in `check-architecture.ts` — any regression fails the build outright (not a ratchet you can quietly
`--update` past without it being a real regression). So the standard conversion doesn't just leave
settings "still coupled" — it would **actively introduce** the cycle that the whole Stage 2 rollout
exists to avoid. That is why this is a different shape of blocker than `database`/`media`/etc.:
those were reverted because converting them closed a cycle **through other still-static domains**
(order-dependent, may resolve itself as more domains convert). Settings' problem is self-contained
and does not depend on any other domain's conversion status — it is caused by assistant's own
side-door files, and converting settings' entry the standard way is what would create the cycle,
not something order can dodge.

(Side note for completeness, not part of the blocking mechanism: `src/db/sqlite/{site-credential,
execution-credential,external-mcp}-repo.sqlite.ts` also import `type`-only from `../../assistant`,
and `features/settings/repo.sqlite.ts` imports real values from `db`. That closes
`assistant -> settings -> db -> assistant` on the **all-import** graph today already — but it's
`import type`, erased on the runtime-only graph the cycle metric actually gates on, so it doesn't
count and isn't new.)

## Is there a comment or history explanation for why the 3 files bypass the registry?

No explicit "we bypass the registry on purpose" comment exists in any of the three files — the
registry (`tool-contribution-registry.ts`) postdates them; git history shows they were written
(`e7896ad8`, `28ef7c6b`, `3d4a6ab9`, `ad62b383`) as ordinary feature work wiring settings-backed
config into the assistant, well before the Stage 2 registry-rollout initiative existed. So there's
no timing/lifecycle rationale to recover — the reason they don't go through
`tool-contribution-registry.ts` is simply that **that registry is not the right seam for what they
need**: its contract is `(routeDeps, surfaces) => ToolRegistration[]` plus a risk map, i.e. "here
are my AI-callable tools." These 3 files need CRUD primitives on the settings ledger, an
unrelated concern. Rerouting them through it isn't a bypass to fix — it's a category mismatch;
`registerToolContributor` has nothing to offer them.

## Recommendation

**For the `DOMAIN_SLICES` entry (the part that actually matters for the cycle metric):**
Do not convert it via the standard "feature calls `registerToolContributor`" pattern — that
introduces the cycle described above, for a domain (`settings`) whose reverse dependency
(assistant → settings) is already real and unavoidable via the 3 side-door files.

If removing this one `DOMAIN_SLICES` line is still wanted for consistency, the mechanical fix is
to move the wiring into the composition root instead of into `features/settings` itself:
`src/server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()` calls
`registerToolContributor({ domain: "settings", build: buildSettingsRegistrations, risk:
settingsDerivedRisk })` directly (importing both `registerToolContributor` from `assistant` and
`buildSettingsRegistrations`/`settingsDerivedRisk` from `features/settings/tool-registrations.ts`).
`server/` already imports both sides safely as the composition root, so this adds no new edge risk.
This is a **small, mechanical, low-risk change** — but it deliberately breaks the "uniform shape"
`tool-registrations.ts`'s own header comment currently relies on ("pointing only settings somewhere
else would make the one ported domain the odd line out, and would invite the next reader to
'restore consistency'"), so it needs a comment on both ends explaining why settings is the one
exception, or a future cleanup pass will silently reintroduce the cycle by "fixing" it back to the
standard pattern.

**For the 3 side-door files' direct engine imports:** these should **not** be treated as the same
kind of problem. `features/settings` is architecturally closer to `db` — a shared library nearly
every domain (seo, comments, assistant, …) imports directly for persistence — not a bounded
"domain" whose AI-tool surface is the only thing other code should touch. There is currently no
cycle risk from this edge (verified above), and removing it would require injecting
`getEffective`/`set`/`registerDefinitions`/`ensureSettingDefinitions`/`SCOPE_BIT` as function-typed
fields on the existing deps bags (`EnsurePublicAssistantSettingDefinitionsDeps`,
`ResolveCustomInstructionsDeps`, `EnsureExecutionSettingDefinitionsDeps`) and updating every
deps-assembly site under `src/server/**` to pass them in — mechanically possible (the deps-bag
skeleton already exists and every real caller is already in the composition root), but a real
refactor touching several files, for a change that would only move the RATCHET-tier metrics
(propagation cost, API surface) slightly, since it fixes nothing on the HARD_CONSTRAINT side (no
cycle exists here today). **Recommend leaving these 3 files as direct imports** and scoping this
investigation's actionable fix to the `DOMAIN_SLICES`-entry piece above only.

## Bottom line for the Stage 2 rollout tracking

`settings` should be recorded as: **blocked on a genuine structural conflict, not a re-ordering
problem** — the standard registry-conversion pattern is actively unsafe for this domain because of
the pre-existing reverse dependency from 3 files inside `assistant/` itself. The one available fix
(server-side wiring in `tool-catalog-manifest.ts` instead of settings calling
`registerToolContributor` itself) removes the `DOMAIN_SLICES` line without the cycle, but is a
deliberate one-off exception to the pattern, not a "try again later" retry candidate like `media`.
