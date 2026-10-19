# Admin: each settings/boot resource is fetched once per page load, not in 3 waves

Persona: Programmer (read /Users/la/Programming/Tovu/AI-Dev-Shop/agents/programmer/skills.md Role section).
Repo: Tovu (/Users/la/Programming/Tovu), package apps/admin. Jini at /Users/la/Programming/Jini is
read-only for you (you may read @jini-ai/ui/fetch-query source there).

RULES: do NOT run tests, typecheck, builds, vite, or any dev server. Do NOT commit or touch git
state (no stash/checkout/reset). Edit code and finish with a report listing `ROOT CAUSE:` (with
file:line evidence), `CHANGED FILES:` and `NOT DONE:`. REUSE before you write: search for an
existing mechanism first. Smallest change that removes the repeats AT THE SOURCE. Move "why"
comments with code, never delete them. No read-anything limits: the file names below are a map.

## Symptom (measured in the browser on one admin page load, dev build, /admin)
10 settings GETs (`/api/admin/settings/effective?namespace=...`) arrive in 3 waves at ~0 s,
~0.5 s and ~1.7 s: core.language x3, core.interface x3, core.appearance x2, core.execution x2.
The same load also sends `auth/me` x2, `agents` x4, and `system/sites`, `assistant-subagents`,
`chart-providers`, `execution-credential` x3 each.

Commit b8dd6cf54 (`apps/admin/src/lib/settings-effective-reads.ts`, wired in `lib/api.ts`
`getSettingsEffective`) only shares a request WHILE it is in flight, so a later wave refetches.
That was a band-aid; the waves themselves are the bug.

## What to find
Why do the same readers mount/fire 3 times on one load? Candidates to check, not conclusions:
- `apps/admin/src/App.tsx` (~line 661-677): `checking` boot screen → `Login`/app; `ChartRegistryProvider key={user.id}`;
  does `user` change identity (auth/me fetched twice → new object → remount, or a key change)?
- `App.hooks.ts` / `useAdminSession`: why is auth/me called twice? Is the session re-read after
  the first resolves (e.g. a locale/language load, a server-reconnect / page-lifecycle /
  visible-interval / settings-refresh-bus event firing on boot) and does that remount or re-run
  every reader?
- `lib/settings-refresh-bus.ts` `publishSettingsRefresh` at boot (who publishes during load?).
- Hooks that read via `useEffect` + `api.*` directly instead of the existing `fetch-query` cache
  (`apps/admin/src/lib/fetch-query/provider.tsx`, `@jini-ai/ui/fetch-query`), e.g. `useSettingsSlice`,
  agents/subagents/chart-providers/execution-credential/system-sites readers, so every remount refetches.
- `main.tsx` has `<React.StrictMode>`: its double effect run is dev-only and simultaneous (shared
  by the in-flight dedupe); do NOT remove StrictMode, and do not count it as the cause of
  waves 0.5 s / 1.7 s apart.

## Fix
Remove the cause of the repeat waves (stop the remount / re-key / spurious refresh), and where a
reader still refetches on an ordinary remount, route it through the EXISTING `fetch-query` cache
(the app already mounts one `FetchQueryProvider` for its lifetime) rather than adding any new
cache, memo map, or module-level store. Keep settings refresh after a real save working
(`publishSettingsRefresh` must still cause a refetch). Keep cross-principal isolation (a
different user never sees another's cached value).

## Test (write it; do not run it)
Add a vitest test under `apps/admin/src/__tests__/` (or next to the hook you change) that mounts
the real `App` inside one `FetchQueryProvider` with a stubbed global `fetch` (follow the recorder
pattern in `apps/admin/src/__measurements__/request-volume.measurement.test.tsx`; the
`FetchQueryProvider` helper is `@/__tests__/fetch-query-provider.test-helper`), returns a signed-in
user from auth/me, waits for the load to settle (include advancing past ~2 s if the waves are
timer-driven), and asserts each of these is fetched exactly ONCE: auth/me, settings/effective per
namespace (core.language, core.interface, core.appearance, core.execution), agents, system/sites,
assistant-subagents, chart-providers, execution-credential. It must fail on the current code
(counts above 1) and pass with your fix. If some resource genuinely needs 2 reads by design,
say why in NOT DONE and assert that number instead.
Do not edit request-volume.measurement.test.tsx unless your change alters its pinned counts; if
it does, update the pinned numbers and say so in CHANGED FILES.
