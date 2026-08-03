# Agent report: narrowing `RouteDeps` in `tool-registrations.ts` (22 files)

**Status: implementation complete, NOT committed.** `npm run typecheck` has exactly one
remaining error, in a file outside this task's scope (`src/assistant/agent-daemon-server.ts`),
which is a genuine pre-existing latent bug this refactor surfaced rather than introduced. Per
the team lead's instruction ("do not commit if typecheck ... is failing — report the blocker
instead"), this work is left uncommitted, staged in the working tree, pending a decision on that
one file.

Read this file standalone — it assumes no prior context.

## Goal

`src/server/routes/types.ts` exports `RouteDeps`, a 454-line, 45-import god type whose first
line is `import type { Express } from "express"`. 22 files named `tool-registrations.ts` (one per
domain: comments, forms, identity, media, members, redirects, seo, widgets, newsletter,
navigation, integrations, and 10 more under `features/*`, plus the `assistant/` aggregator)
imported `RouteDeps` purely to type one function parameter, each using only a handful of its ~90
fields. Because TypeScript is structurally typed, replacing that parameter type with a
locally-declared narrow interface changes zero call sites: `server/routes/*` keeps passing the
same object, and it still satisfies the narrower shape. This removes the module-level back-edges
those 22 files created into the Express-coupled composition root, which is what currently blocks
exposing the tool registry over MCP/stdio without dragging in Express's types.

## Files changed (22 domain files + 1 aggregator)

Each file: declared a local, exported `<Domain>ToolDeps` interface (fields typed from the
domain's own ports, never from `server/routes/types`), deleted the `RouteDeps` import, and
retyped `build<Domain>Registrations`'s parameter to the new interface.

| File | New interface |
|---|---|
| `src/assistant/tool-registrations.ts` | `AssistantToolRegistryDeps` (intersection of all 21 below — see "The aggregator" section) |
| `src/comments/tool-registrations.ts` | `CommentsToolDeps` |
| `src/features/content-types/tool-registrations.ts` | `ContentTypesToolDeps` |
| `src/features/database/tool-registrations.ts` | `DatabaseToolDeps` |
| `src/features/entries/tool-registrations.ts` | `EntriesToolDeps` |
| `src/features/plugin-runtime/tool-registrations.ts` | `PluginsToolDeps` |
| `src/features/post/tool-registrations.ts` | `PostToolDeps` |
| `src/features/recovery/tool-registrations.ts` | `RecoveryToolDeps` |
| `src/features/settings/tool-registrations.ts` | `SettingsToolDeps` |
| `src/features/taxonomy/tool-registrations.ts` | `TaxonomyToolDeps` |
| `src/features/theme/tool-registrations.ts` | `ThemeToolDeps` |
| `src/features/workspace/tool-registrations.ts` | `WorkspaceToolDeps` |
| `src/forms/tool-registrations.ts` | `FormsToolDeps` |
| `src/identity/tool-registrations.ts` | `IdentityToolDeps` |
| `src/integrations/tool-registrations.ts` | `IntegrationsToolDeps` |
| `src/media/tool-registrations.ts` | `MediaToolDeps` |
| `src/members/tool-registrations.ts` | `MembersToolDeps` |
| `src/navigation/tool-registrations.ts` | `MenusToolDeps` |
| `src/newsletter/tool-registrations.ts` | `NewsletterToolDeps` |
| `src/redirects/tool-registrations.ts` | `RedirectsToolDeps` |
| `src/seo/tool-registrations.ts` | `SeoToolDeps` |
| `src/widgets/tool-registrations.ts` | `WidgetsToolDeps` |

No other files were edited. No tests were modified, deleted, or weakened.

## Why this is call-site-neutral (structural typing)

`server/routes/*` composition roots build one big `RouteDeps`-shaped object and pass the SAME
object to every domain's `build<Domain>Registrations(deps)` call. TypeScript checks a function
assignment by contravariance on parameters: a function `(deps: Narrow) => R` is assignable
wherever `(deps: Wide) => R` is expected, provided `Wide` is assignable to `Narrow`. Since
`RouteDeps` (Wide) has every field each domain's new `<Domain>ToolDeps` (Narrow) declares, the
existing call sites keep compiling and keep passing the exact same runtime object — nothing
about what gets constructed or passed anywhere changes.

## The aggregator (`assistant/tool-registrations.ts`)

The dispatch's working assumption was that this file uses 0 `RouteDeps` fields directly and
could just have the import deleted. That's true for direct field reads, but the file has an
array of all 21 domain builders (`DOMAIN_SLICES: readonly DomainSlice[]`) and fans one shared
`routeDeps` parameter out to all of them via `slice.build(routeDeps)`. For that to type-check,
`DomainSlice.build`'s parameter type (and `buildAssistantToolRegistrations`'s own parameter)
must be assignable to *every* domain's own narrow interface at once — which requires a type that
structurally satisfies all 21 simultaneously. I defined:

```ts
export type AssistantToolRegistryDeps = CommentsToolDeps &
  ContentTypesToolDeps &
  DatabaseToolDeps &
  EntriesToolDeps &
  PluginsToolDeps &
  PostToolDeps &
  RecoveryToolDeps &
  SettingsToolDeps &
  TaxonomyToolDeps &
  ThemeToolDeps &
  WorkspaceToolDeps &
  FormsToolDeps &
  IdentityToolDeps &
  IntegrationsToolDeps &
  MediaToolDeps &
  MembersToolDeps &
  MenusToolDeps &
  NewsletterToolDeps &
  RedirectsToolDeps &
  SeoToolDeps &
  WidgetsToolDeps;
```

Still zero import of `RouteDeps`/Express — assembled from the 21 leaf types instead of deleted
outright. This is the one file where seeing all 21 domains at once is inherent to its job
(assembling the whole tool registry), so an all-domain union living here does not re-create the
god-type problem: no domain imports this union back, only this one aggregator sees it.

## Fields I could not source from the domain's own ports without a judgment call

Three domains previously escaped `RouteDeps` via a narrowing cast to a richer type imported from
`server/routes/admin/*/deps.ts` (each of those extends `RouteDeps` and adds fields RouteDeps
itself doesn't declare). The dispatch's out-of-scope list said leave `server/routes/admin/
{users,members,newsletter}/deps.ts` alone — I did (their real HTTP routes still import them
unchanged) — but that meant these 3 domains needed a different resolution than "narrow the
existing import":

- **`members`**: previously did `const deps = routeDeps as MembersRouteDeps` and imported
  `toMembersWriteServiceDeps`/`MembersRouteDeps` from `server/routes/admin/members/deps.ts`. I
  reimplemented `toMembersWriteServiceDeps` as a local, private function in
  `members/tool-registrations.ts` (a straight field-mapping duplicate — the codebase already
  establishes this exact "duplicate the mapper, don't import across the ports/adapters boundary"
  precedent in that very deps.ts file's own header). For `magicLinkPerEmailLimiter`, instead of
  importing the nominal `RateLimiter` type from `server/middleware/rate-limit.ts`, I declared a
  small local structural type (`MagicLinkRateLimiter`, matching exactly the `.check(key)` shape
  the handler calls). This was a deliberate call, not a shortcut: `members` is the one domain
  with *zero* other files crossing into `server/*` today, so importing `RateLimiter` — even
  though that specific type carries no Express coupling itself — would have single-handedly
  re-created the `members <-> server` module cycle this whole task exists to remove. (`forms`
  and `comments` also use `RateLimiter`, but both already cross into `server/middleware/
  rate-limit.ts` via other files for unrelated reasons, so importing it there wouldn't have
  changed their cycle status either way — I left those two importing the real type, for
  consistency with how the rest of each of those files already reads.)
- **`identity`**: previously imported `identityServiceDepsFrom` from `server/routes/admin/users/
  deps.ts`. Reimplemented `identityReposFrom`/`identityServiceDepsFrom` locally, same reasoning.
  `identity` also had zero other crossings into `server/*`.
- **`newsletter`**: previously imported six small field-mapping functions
  (`toCampaignWriteServiceDeps`, `toConfirmationDeps`, `toListsDeps`, `toSendPipelineDeps`,
  `toSubscriptionsDeps`, `toUnsubscribeSubscriptionDeps`) plus `NewsletterRouteDeps` from
  `server/routes/admin/newsletter/deps.ts`. Reimplemented all six locally, same reasoning.
  `newsletter` also had zero other crossings into `server/*`.

Every field these three domains need has a real declared type in a non-`server` module
(`members/ports.ts`, `identity/ports.ts` + `identity/auth-service.ts`, `newsletter/ports.ts` +
its own campaign-write-service/confirmation/hooks/lists/send-pipeline/subscriptions files) — none
of them required inventing a type that doesn't exist elsewhere, and none required leaving an
import from `server/routes/types` in place.

Two more domains use types from a file that IS on the out-of-scope list
(`server/gated-mutations-composition.ts`, explicitly named as 1 of the "3 files" not to touch):
`features/database/tool-registrations.ts` needs `LedgerAppendPort`, and
`features/taxonomy/tool-registrations.ts` needs `MergeableEntryTermRepoPort`. Both files already
import `buildMigrateForwardHooks`/`buildMergeTermHooks` from that same file (untouched, per
scope), so importing these two additional types from the same already-present import adds no new
cross-module edge — it doesn't change that file's already-disclosed out-of-scope status.

## Out-of-scope back-edges observed (left untouched, exactly as instructed)

- `server/gated-mutations-composition.ts` — used by `features/database`, `features/recovery`,
  `features/taxonomy` (the "3 files" the dispatch named explicitly).
- `server/http/admin/plugins.ts` — used by `features/plugin-runtime/tool-registrations.ts`
  (`toAdminPluginResponse`).
- `server/http/admin/widgets.ts` — used by `widgets/tool-registrations.ts`
  (`toWhereUsedResponse`).
- `assistant/mcp-ui.ts`, `assistant/pending-confirmations.ts` — used by
  `features/post/tool-registrations.ts` for the MCP-UI delete-confirmation protocol.
- `server/routes/admin/{users,members,newsletter}/deps.ts` — explicitly "do not touch"; I didn't
  edit them, and their real HTTP admin routes (e.g. `server/routes/admin/members/list.ts`,
  `server/routes/admin/newsletter/create-campaign.ts`, 8 route files under `admin/users/`) still
  import and use them unchanged. `tool-registrations.ts` in each of those 3 domains no longer
  imports from them (see judgment calls above), which is a net improvement, not a regression.

Not named in the dispatch's out-of-scope list, but also pre-existing and unrelated to any of the
22 files (confirmed by grep before touching anything — these domains have OTHER production files,
not their `tool-registrations.ts`, crossing into `server/*`, so narrowing the tool-registrations
file alone could not and did not change these domains' cycle status):

- `forms` and `comments` both cross into `server/middleware/rate-limit.ts` via
  `forms/rate-limit-profile.ts`, `forms/submit-service.ts`, `comments/index.ts`,
  `comments/ingress.ts`.
- `seo` crosses into `server/http/site/page-head.ts` via `seo/page-head-contributor.ts`,
  `seo/types.ts`, `seo/ports.ts`.
- `assistant` crosses into `server/app.ts`, `server/deps.ts`, `server/runtime-mode.ts` via
  `assistant/agent-daemon-server.ts` (the daemon's own composition-root entry point — see the
  Blocker section below, this is also where the one remaining typecheck error lives).

## The one typecheck blocker

`npm run typecheck` output (verbatim, full and only output):

```
> tovu@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

src/assistant/agent-daemon-server.ts(130,60): error TS2345: Argument of type 'NewsletterRouteDeps' is not assignable to parameter of type 'AssistantToolRegistryDeps'.
  Property 'magicLinkPerEmailLimiter' is missing in type 'NewsletterRouteDeps' but required in type 'MembersToolDeps'.
```

**This is a real, pre-existing latent bug, not something introduced by this refactor.** Root
cause, traced through the actual code:

- `server/app.ts`'s `createRouteDeps()` and `server/deps.ts`'s `createSqliteRouteDeps()` both
  declare return type `NewsletterRouteDeps` and never construct a `magicLinkPerEmailLimiter`
  field on the object they return.
- `server/app.ts` DOES construct one, but only ~400 lines later, inside its route-registration
  function, as a separate local variable (`const membersDeps: MembersRouteDeps = { ...routeDeps,
  magicLinkPerEmailLimiter };` at `server/app.ts:569`) used solely to register the HTTP admin
  routes. That richer object is never returned to the caller.
- `src/assistant/agent-daemon-server.ts:121` calls `createRouteDeps()`/`createSqliteRouteDeps()`
  and assigns the result straight to `routeDeps`, then at line 130 passes that same bare
  `routeDeps` into `buildAssistantToolRegistrations(routeDeps)` — with no
  `magicLinkPerEmailLimiter` field anywhere on it.
- Before this refactor, `members/tool-registrations.ts` masked this with
  `const deps = routeDeps as MembersRouteDeps` — an unchecked type assertion the compiler cannot
  see through. If `members_request_magic_link` were ever invoked through the live agent daemon
  (as opposed to the admin HTTP route, which DOES get the real limiter via `membersDeps` above),
  it would throw `TypeError: Cannot read properties of undefined (reading 'check')` at the line
  `deps.magicLinkPerEmailLimiter.check(...)`.

Fixing the underlying bug requires editing `src/assistant/agent-daemon-server.ts` — either
constructing a real limiter there (mirroring `server/app.ts:566`'s
`createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock })`) or widening what
`createRouteDeps`/`createSqliteRouteDeps` return. That file is not one of the 22 in scope, is
being concurrently edited by someone else right now (an unrelated import-path change,
`../infra/sqlite/content-db` → `../db/sqlite/content-db`, confirmed via `git diff` before writing
this report), and a real behavior fix is outside "types and signatures only, no behavior change."
I did not touch it. Recommend either: (a) authorize a 1-line follow-up in that file, or (b) leave
`members_request_magic_link` as a known-broken daemon path until Members' daemon wiring is
revisited.

## Module cycle count (before / after)

The dispatch named `development/scripts/check-module-cycles.ts` as the verification tool. That
file no longer exists in the working tree — it was superseded mid-task by a concurrent commit
adding `development/scripts/check-architecture.ts`, whose own file header states it "supersedes
`check:module-cycles`... the logic is unchanged, just folded in" plus new metrics. I used the
new script since the old one is gone.

Cycle count at the start of this task (captured before any of my edits, via the then-current
`check-module-cycles.ts`): **30 mutual module cycles**, largest strongly-connected component 33
modules. Full pairs list at that point included, among others, 22 `<domain> <-> server` pairs
corresponding one-to-one with the 22 files in scope (`assistant`, `comments`,
`features/content-types`, `features/database`, `features/entries`, `features/plugin-runtime`,
`features/post`, `features/recovery`, `features/settings`, `features/taxonomy`,
`features/theme`, `features/workspace`, `forms`, `identity`, `integrations`, `media`, `members`,
`navigation`, `newsletter`, `redirects`, `seo`, `widgets`).

Current state, `npx tsx development/scripts/check-architecture.ts --list` (verbatim):

```
check:architecture — 667 files, 38 modules, production files only

  propagation cost                       10.34%
  back-edges into composition root       27
  module cycles (mutual pairs)           17
  largest strongly-connected component   33
  module API surface (files exposed)     210
    └ deep-import edges (informational)  777
  core size                              12.59% (84/667)

--- module cycles ---
    assistant <-> features/plugins
    assistant <-> features/post
    assistant <-> server
    comments <-> server
    core <-> db
    core <-> features/post
    core <-> features/settings
    db <-> features/database
    features/database <-> features/recovery
    features/database <-> server
    features/plugin-runtime <-> server
    features/recovery <-> server
    features/taxonomy <-> server
    forms <-> server
    mail <-> server
    seo <-> server
    server <-> widgets

  module cycles — 6 pair(s) removed since baseline:
    - features/content-types <-> server
    - features/entries <-> server
    - features/post <-> server
    - features/settings <-> server
    - identity <-> server
    - newsletter <-> server

  propagation cost improved: 10.77 → 10.34
  back-edges into composition root improved: 44 → 27
  module API surface (files exposed) improved: 213 → 210

check:architecture — OK, and ahead of baseline.
```

**Result: 30 → 17 mutual module cycles (13 removed), matching my own manual prediction exactly
before I ran the tool.** The committed baseline this new script ships with had already captured
some of my in-progress edits when someone updated it mid-session, which is why it only reports "6
removed since baseline" rather than 13 — the 30-cycle figure above is the true starting point,
independently recorded earlier in this same session before any file was touched.

Of the 22 target domains, 13 had their `<domain> <-> server` cycle fully resolved:
`features/content-types`, `features/entries`, `features/post`, `features/settings`,
`features/theme`, `features/workspace`, `identity`, `integrations`, `media`, `members`,
`navigation`, `newsletter`, `redirects`. The other 9 (`assistant`, `comments`,
`features/database`, `features/plugin-runtime`, `features/post`→`assistant` specifically,
`features/recovery`, `features/taxonomy`, `forms`, `seo`, `widgets`) keep their cycle with
`server` (or, for `assistant`, with `features/post` too) purely because of the out-of-scope
back-edges listed above — confirmed by inspection, not guessed.

Back-edges into the composition root: **44 → 27** (a drop of 17), per the same tool run.

## Test results (verbatim, full output)

Command: `node --import tsx --test "src/assistant/__tests__/tool-registrations.*.test.ts" "src/assistant/__tests__/tool-dispatch/*.test.ts"`

Tail of run (summary counters, verbatim):

```
ℹ tests 601
ℹ suites 0
ℹ pass 601
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13614.319534
```

601 pass, 0 fail, 0 cancelled — every scoped test green, including the full
`tool-registrations.members.test.ts`, `.identity-authorization.test.ts`, `.taxonomy.test.ts`,
`.widgets.test.ts` etc. suites and the cross-domain `tool-dispatch` integration tests. No test
was modified, deleted, or weakened to get this result.

## Pre-Completion Checklist

- Requirements re-verified: all 22 files converted, `RouteDeps` import removed from every one
  (confirmed by a final grep across all 22 paths — zero matches).
- Fresh evidence commands: `npm run typecheck`, `npx tsx development/scripts/check-architecture.ts
  --list`, and the scoped test command above were all run fresh in this session, output pasted
  verbatim above.
- No certified test was deleted, skipped, or weakened.
- Scope: all edits confined to the 22 named files + the `assistant` aggregator. No edits to
  `server/routes/types.ts`, `server/gated-mutations-composition.ts`, `server/http/admin/*`,
  `assistant/mcp-ui.ts`, `assistant/pending-confirmations.ts`, `server/routes/admin/*/deps.ts`, or
  `assistant/agent-daemon-server.ts`.
- Open items: the one typecheck error above (needs a decision on `agent-daemon-server.ts`,
  outside this task's file list); nothing else.

## Commit status

Not committed. Team lead's instruction: "Do not commit if typecheck or the scoped tests are
failing — report the blocker instead." Typecheck currently has the one error described above, so
per that instruction this work stays uncommitted in the working tree pending a decision on that
file. All 22 files + the aggregator are otherwise complete and ready to commit as soon as that
one line is resolved (or the team lead decides to accept committing with that pre-existing,
disclosed gap noted separately).
