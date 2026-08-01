# ADR-051: Admin Server-State Layer — TanStack Query Behind a `fetch-query` Seam, and Why It Stops at Tovu's Border

- Status: Accepted (infrastructure + one pilot screen implemented and verified live, 2026-08-01)
- Date: 2026-08-01
- Author: Claude Opus 5 / Leona Burime
- Relates: ADR-050 (removed the settings VALUE cache — the cautionary precedent this decision has to
  answer to, and the source of the SSE change feed this layer is designed to receive), ADR-049 (the
  `@jini-ai` kit, whose port-injected components are precisely what this layer does NOT cover),
  ADR-028 §8 (cache/definition-cache boundary), SPEC-007 (settings ledger).

## Context

The admin SPA had no server-state caching of any kind. Not "an inadequate cache" — none. Across
`apps/admin/src`, **40 non-test files hold 153 `api.*` call sites** (comments stripped, `lib/api.ts`
itself excluded), and the near-universal shape is a hand-written triple:

```tsx
const [data, setData] = useState<T | null>(null);
const [error, setError] = useState<string | null>(null);
const [loading, setLoading] = useState(false);
useEffect(() => { /* load(); try/catch; setLoading */ }, []);
```

Every mount re-fetches. Two consequences made this worth deciding rather than tolerating.

**It was already costing real time.** `SettingsDialogShell` renders only the active tab's panel, so
leaving Execution mode unmounts it, and `useExecutionTab`'s auto-detect effect re-runs on the next
mount. That effect reaches `detect-agents.ts`, which calls `@jini-ai/agent-runtime`'s
`detectAgents()` — a **spawn of all 24 known CLIs with `--version` on the Tovu server**. Measured at
~2.5s. Tab away and back, pay it again. The operator-visible symptom was a settings tab that
"forgets" every time.

**Writes refresh only whoever remembered to call the loader.** Every mutating screen ends with
`await api.write(); load();`. That refreshes the one component owning `load()`. A second mounted
view of the same resource silently drifts, and the pairing is invisible to review when omitted.

The immediate fix for the CLI scan was a module-scoped memo in the port implementation
(`execution-settings.ts`). That worked, and it is the right shape *for that surface* (see the
two-tier model below) — but it does not generalise: repeating it per module is a bespoke cache per
module, each with its own invalidation story and none with a shared contract.

> **Correction (2026-08-01, external review).** This ADR first cited "38 files / 123 call sites".
> That was wrong and understated: the count came from a line-oriented `grep` that cannot match
> `api\n  .listRedirects()`, a multi-line form the pilot screen itself used. The figures above are
> from an AST-shaped count with comments stripped. An independent reviewer reached 143/37 under
> different exclusion rules; the exact total depends on whether re-exports and type-only files are
> counted, so the methodology is stated rather than the number asserted bare.

**The signal that tipped this from "tolerable" to "decide it":** ADR-050 shipped
`settings-refresh-bus.ts` + `change-feed.ts` + an SSE `events.ts` route. That is a hand-rolled
cache-*invalidation* system built for an application that has no cache. Building the invalidation
half first, without the storage half, is the strongest available evidence that ad-hoc fetching had
been outgrown.

## Decision

**1. Adopt TanStack Query, but never import it from application code.** The admin talks to server
state through `apps/admin/src/lib/fetch-query`, a four-export surface:

```ts
useFetchQuery<T>({ key, fetch, enabled?, staleTime? }) → { data, error, status, isFetching, refetch }
useFetchMutation<I,O>({ run, invalidates? })           → { mutate, status, error, reset }
useInvalidate()                                        → (key: QueryKey) => void
<FetchQueryProvider>
```

`types.ts` imports nothing from any library; `adapter.tanstack.tsx` is the sole translation layer.
No TanStack type appears in a component signature, so the library is a substitutable implementation
detail rather than a shape the codebase has taken on.

**2. Enforce the seam with lint, not convention.** `eslint.config.mjs` bans `@tanstack/*` imports
across `apps/admin/src/**/*.{ts,tsx,js,jsx,mjs,cjs}` with a single `ignores` exemption for
`adapter.*`, at `error` severity, and CI runs it as a **blocking** step. This is the load-bearing part of the decision. An abstraction whose only protection is
reviewer diligence acquires a second importer eventually, and the rip-out claim quietly becomes
false with no failing signal. Verified by probe: a file importing `useQuery` outside the adapter
fails lint; the adapter passes.

> **Correction (2026-08-01, external review).** As first written this guarantee did not hold. The
> rule matched only `.ts`/`.tsx`, so `apps/admin/src/anything.js` could import the library and lint
> clean; and ESLint ran nowhere in CI — `npm run lint` is Biome only (and `continue-on-error:
> true`), while the ESLint entry point is `npm run complexity`, which no workflow invoked. The claim
> that a stray import "fails lint" was therefore true only for whoever ran that script by hand. Both
> holes are closed: the glob covers every bundled module format, and ci.yml runs `npm run complexity`
> as a blocking step (safe because the config's only `error`-level rule is this boundary).

**3. Do NOT put this in Jini.** `@jini-ai/ui` is port-injected by construction — 23 feature files
take a `Port`/`dependencies` prop, and the `fetch()` calls that exist live in `dependencies.ts`
files that are *default port implementations a host replaces*. Adding a query library there would
force every host to mount a `QueryClientProvider` and invert that contract. Jini owns *how a
component renders and what async edge it needs*; the host owns *how that edge is satisfied*.

**4. Accept a two-tier caching model as the consequence of (3), and name it.** These are not
competing options; the boundary is structural:

| Surface | Cache lives | Why it cannot be the other one |
|---|---|---|
| Tovu-owned sections (40 files) | `lib/fetch-query`, React-level | — |
| Jini port-driven (`ExecutionTab`, …) | the host's port implementation | Jini's own hook calls `port.detectLocalAgents()` internally; no Tovu-side React cache is on that path |

`execution-settings.ts`'s `cachedDetection` is therefore **not** a case of missing this abstraction.
It is the correct location for that tier, and a future reader should not "clean it up" into
`fetch-query`.

**5. Prefix invalidation is a contract term, not an implementation detail.** Invalidating
`['redirects']` also invalidates `['redirects', id, 'hits']`. Discovered by tracing a real delete on
the pilot screen, and documented on `QueryKey` + pinned by two tests, because it is exactly the kind
of implicit semantic that voids a rip-out: a `Map`-backed replacement doing exact-key equality would
compile, pass review, and silently stop refreshing derived data. Corollary for key design: do not
nest resources under a shared prefix because their names sound related, or one write fans out
refetches across all of them.

**6. Migrate one screen, then stop and look.** `Redirects.tsx` is the pilot — chosen because it
exercises the entire surface in one small file (a list read, three writes that each hand-rolled
`load()`, a gesture-gated lazy read, a bulk import). The other 39 files are untouched and keep
working; the two styles coexist without interference.

## Relationship to ADR-050 — why this is not the same mistake

ADR-050 removed a cache for causing stale reads, and its "do not reintroduce it" note is the first
thing anyone evaluating this ADR will reach for. The distinction is the failure surface, not the
technique:

| | ADR-050's removed value cache | This layer |
|---|---|---|
| Scope | one repo instance, **server-side** | one browser tab |
| Second writer | the ADR-049 agent daemon, a separate OS process on the same SQLite file | none — the tab is the only owner |
| Invalidation | none reachable across processes | explicit, in-process, plus the SSE feed |
| Staleness ends | process restart | navigation, reload, or invalidation |

The killing property there was *two processes, neither able to invalidate the other, no TTL*. None
of the three holds here. What does carry over is the discipline: **an invisible refresh rule is worse
than no cache.** Hence `staleTime: 0` by default (dedupe and share, do not serve stale records), and
`retry: false` (`api.ts` throws a typed `ApiError` carrying the server's own status and message, and
a 403 will not succeed on attempt two).

The honest residual risk is on the *other* tier: `cachedDetection` has no TTL and is per-process,
which is structurally the same family. It is acceptable because it caches a filesystem probe rather
than authoritative ledger state, dies on reload, and has a visible manual invalidation (Rescan). If
detection ever moves server-side, ADR-050 must be re-read first.

## Alternatives rejected

- **Do nothing / keep hand-rolling memos.** Rejected: it is how the detection bug was fixed, and it
  produces N private caches with N invalidation stories. The ADR-050 bus already demonstrates the
  cost of building invalidation without storage.
- **Adopt TanStack Query directly, no seam.** Cheaper today, and the honest argument for it is that
  wrappers over query libraries often ossify. Rejected because the owner's explicit requirement was
  reversibility, and 153 call sites is precisely the scale at which "we'll migrate off later" stops
  being true. The seam's cost is one indirection; its benefit is that the exit is a one-line change.
- **SWR / hand-rolled `Map` cache.** Not materially different from TanStack for these needs, and a
  hand-rolled one would have to re-derive dedupe, prefix invalidation, and background-refresh
  semantics. Note the seam makes this reversible rather than foreclosed — `adapter.local.tsx` is a
  documented exit, not a rewrite.
- **Put it in Jini so every host benefits.** Rejected — see Decision 3. It would convert an injected
  contract into an inherited framework dependency.
- **Big-bang migration of all 40 files.** Rejected: a large, risky diff with no user-visible payoff
  and no checkpoint at which to change course.

## Consequences

- One new runtime dependency (`@tanstack/react-query`, ~13kb gz) with a lint-enforced single
  importer and a written rip-out procedure in `lib/fetch-query/index.ts`.
- Two fetching styles coexist until migration completes. Deliberate, and the pilot is the decision
  point for whether it continues at all.
- `fetch-query`'s test suite imports **only** the public surface, making it the acceptance suite a
  replacement adapter must pass. Tests that reached for TanStack internals would silently make the
  suite untransferable.
- `useInvalidate()` is the seam ADR-050's SSE change feed should push into; wiring it is the natural
  next step and would let `settings-refresh-bus.ts` shed its bespoke half.
- Verified live on the pilot: create → invalidate → automatic list refetch, with the table never
  torn down (the old `if (!data) return <Loading/>` full-screen flash after every write is gone,
  because a background refresh is `status: 'success'` + `isFetching`, not `loading`).

## Open

- Whether to continue migrating. The pilot exists to answer this; the remaining 39 files are not
  committed to.
- Wiring the settings SSE feed to `useInvalidate()`.
- `Redirects.tsx` surfaced an unrelated pre-existing product defect while being migrated: "Delete"
  is a soft-delete that flips status to `disabled` (`src/redirects/ports.ts:83`), the status enum has
  no `tombstoned` value, and the list route does not filter tombstoned rules — so Delete is visually
  indistinguishable from Disable. Not addressed here.
