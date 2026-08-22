# Cowork — converged edit plan (APPROVED by owner 2026-08-22; option A selected)

**Run:** `2026-08-22-capability-slice`
**Participants:** Claude Opus 5 (Primary), Claude Sonnet 5 (writer), Codex gpt-5.6-sol (verifier),
Gemini 3.7 Flash (advisory, no writes)
**Risk tier:** medium (all four agreed independently). **Verifier score floor: 8.5.**

## Comparison ledger

| Decision | Opus 5 (Primary) | Sonnet 5 | Codex 5.6-sol | Flash (advisory) | Resolution |
|---|---|---|---|---|---|
| Card id / two-digest case | collapse to newest, record `revision` | **digest IN the id** | **digest IN the id** | collapse to newest | **Digest in the id. Primary CHANGED.** |
| Catalog schema | local | **local** | local | lean reuse | **Local schema** |
| `list()` sync or async | flagged as open | **async list, sync `build()`, lazy memoized catalog** | async | avoid reads at index time | **Sonnet's** |
| Where catalog is built | lazy, no boot wiring | lazy, no boot wiring | seed on invocation | boot | **Lazy. Slice stays in scope.** |
| Tenancy enforcement | per-workspace catalog instance | **satisfied by construction — process is single-workspace** | build index from one workspace | SQL predicate before ranking | **By construction, + documented assertion** |
| `listInstalledPlugins` private | not noticed | export it (recommends) | duplicate carefully | not noticed | **OPTION A — owner approved the export** |

### Where the Primary was wrong, recorded rather than smoothed over

**Card id.** I proposed one card per `(pluginId, skillName)` with newest-digest-wins. Codex and Sonnet
independently rejected it and they are right. My objection — "digest-in-id breaks saved references on
upgrade" — is about a problem **this slice does not have**: nothing persists a capability id yet.
Meanwhile "newest wins" invents a resolution policy that the debate explicitly deferred to a later
lifecycle slice, and there is no activation record to ground it in. Digest-in-id also removes the
primary-key collision by construction instead of by remembering to dedupe.

Carried forward as a known wart, not a blocker: two installed versions produce two near-identical
search hits. The card should surface `version`/digest distinguishably. A later lifecycle slice
collapses them once an activation record exists.

**Card id, part two — the argument that actually settles it, from Sonnet, after the ledger closed.**
My "newest digest wins" is not merely deferred policy, it is **uncomputable** with what this slice
can see. `InstalledAgentPlugin` carries **no timestamp field** — it would require filesystem mtime
(fragile; means "most recently touched") or the digest string (meaningless). And `install.ts` never
deletes an old digest, so "an upgrade happened" and "two versions are genuinely installed" are the
identical runtime state. My proposal would therefore have silently hidden a real, currently-readable,
currently-installed skill behind a guess — worse than the duplicate-hits wart it was avoiding.

**Scope option A, re-tested on the merits rather than on authority.** Sonnet, asked for a single
recommendation, chose (B) duplicate, citing `install.ts`'s `maxAgentPluginInstallArchiveBytes()`
accessor as this feature's precedent for duplication-over-a-new-module-edge. Verified: that accessor
is real (`install.ts:128`) and `fetch-archive.ts` genuinely does not import `install.ts`. **But the
precedent does not transfer** — `resolve-agent-plugin-refs.ts` and the new `capability-source.ts` are
both in `src/features/agent-plugins/`, and `check:architecture`'s graph is per-directory, so an import
between them creates ZERO new module edges. The cost that precedent exists to avoid does not exist
here. Option (A) is correct on the merits, not only because the owner selected it.

**Tenancy.** My packet told all participants "Tovu is multi-workspace; a single content database
serves multiple workspaces." That is true of the **database** and false of the **process**, and the
distinction is the whole design. Sonnet caught it; I verified it in both boot paths:

- `agent-daemon-server.ts:295-296` — `createSqliteRouteDepsForWorkspace(process.env.TOVU_WORKSPACE)`
  at module load; `daemon-supervisor.ts:353` sets `TOVU_WORKSPACE: workspaceId` on **every** spawn.
- `index.ts:273` — `const deps = useMemory ? createRouteDeps() : createSqliteRouteDeps()`, **one per
  process**; `createSqliteRouteDepsForWorkspace` has no other non-test caller. No per-request
  workspace switching in `app.ts`.

**Consequence:** there is never a second tenant's row in a catalog built by either path. The leak
class is absent by construction, not by filtering.

**Consequence for Flash's best trap:** Flash's count-leak scenario (tenant A's 10 rows consume
`limit=10`, tenant B gets zero) is a correct and well-argued hazard that **is not reachable in this
architecture**. It is recorded as a guard-rail for a future change, not a defect to fix. Repo evidence
beat reasoning here, and that is worth naming.

**Because that invariant is load-bearing and unenforced**, the catalog module must (a) state the
dependency in its header, and (b) accept the workspace id and assert it matches the process's own
`routeDeps.workspaceId`. If someone later makes a process serve two workspaces, this fails loudly
instead of leaking silently.

## The plan

### Scope question — RESOLVED: owner approved option (A), export it

`listInstalledPlugins` is a **private, unexported** `async function` at
`resolve-agent-plugin-refs.ts:100` (verified). The approved scope excludes that file, so the adapter
cannot import it. Two options:

- **(A) Export it** — add `export` to one existing function. One extra file in scope, ~1 line.
- **(B) Duplicate** the ~15-line digest-walk (scan `packages/sha256/*`, skip non-digest dirnames,
  tolerate per-digest failure) inside the new adapter.

**Recommendation: (A).** Two copies of digest-validation logic can drift — one gets a fix, the other
does not — and that is security-adjacent. `indexInstalledRoot` (the manifest parse + skill walk) is
already exported from `install.ts` and reusable as-is; only the outer loop is private. Sonnet
independently called (A) "strictly smaller, lower-risk" and deferred to the owner. Codex assumed the
scope bar and designed for (B).

### Files

| File | Change |
|---|---|
| `src/assistant/capability-source-registry.ts` | NEW — seam: `register`/`list`/`reset*ForTests`, replace-by-key on source id |
| `src/features/agent-plugins/capability-source.ts` | NEW — first source; one card per skill folder per digest |
| `src/assistant/capability-catalog-query.ts` | NEW — local FTS5 schema + `bm25()`, lazy memoized build |
| `src/assistant/capability-tool-registrations.ts` | NEW — `capability_search` + `capability_get` |
| `src/server/tool-catalog-manifest.ts` | EDIT — two imports, two calls |
| `src/features/agent-plugins/resolve-agent-plugin-refs.ts` | EDIT — **APPROVED**: add `export` to `listInstalledPlugins` (line 100). Nothing else in this file changes. |
| 3 test files as scoped | NEW |

### Settled design decisions

1. **Card id:** `agent-plugin-skill:<pluginId>:<archiveDigest>:<skillName>`. Every skill folder of
   every installed digest gets a row. No dedupe, no resolution policy, no PK collision.
2. **Card is discovery-only:** `id, kind, pluginId, skillName, revision, name, description,
   keywords, source, handle`. **`pluginId`, `skillName` and `revision` are FIRST-CLASS fields**, not
   merely implied by the colon-joined id (Sonnet's amendment, accepted): a later lifecycle slice can
   group or dedupe by `(pluginId, skillName)` without parsing an id string.
   **No `execute`, no `invoke`, no `activate`** — the absence is the design, and the header says why
   (`AgentPluginCapabilityDescriptor`'s permanently-`unavailable` execute member, zero callers).
3. **`kind` is an unrestricted string** in TypeScript *and* in the tools' JSON Schema. Not an enum.
4. **`handle` is opaque `unknown`**, `{ packageRoot, skillPath }` in practice, and **never leaves the
   process** — it carries absolute host paths.
5. **Local FTS5 schema.** `tool_catalog` is `(id, description, input_schema_json, source, updated_at)`
   — verified, no `kind` column. Reuse would mean overloading `source` or editing a published
   cross-repo package. Also: **do not copy `sourceForToolId`** (`tool-catalog-query.ts:36-39`) — it
   splits a tool id on its first underscore and would silently mis-parse a capability id. `source` is
   the registering source's own id, passed straight through.
6. **Async `list()`, synchronous `build()`.** `ToolHandler` is already Promise-returning, so
   `ToolContributor.build` stays synchronous and returns two ordinary `ToolRegistration`s. The async
   catalog build happens lazily inside the handlers' closures on first real call, memoized as a
   **shared in-flight promise, not a boolean flag** — a boolean allows a double-build race.
   **`tool-contribution-registry.ts` and `tool-registrations.ts` are not modified.**
7. **No boot-path wiring.** Nothing in `agent-daemon-server.ts`. This is what keeps the slice in scope.
8. **Risk metadata — exact shape, verified:** export `capabilityDerivedRisk` as a
   `DerivedRiskByToolId` (`Map<string, AgentToolSideEffect>`) containing exactly
   `["capability_search", "none"]` and `["capability_get", "none"]`, matching
   `content_post_search`'s tier (`features/post/tool-registrations.ts:102-113`). Omitting either is a
   BOOT-TIME failure via `assertRiskMetadataIsWirable` (`tool-registrations.ts:529`), not a style gap.
9. **Failure isolation:** one malformed digest or unparseable `plugin.json` is skipped for that digest
   only, never fatal to the whole `list()`.
10. **No HTTP routes.** These are native `ToolRegistration`s, not a second pair mirroring
    `/api/tools/search`.

### PINNED: how `capability_get` reads content without `assistant/` importing a feature

Raised by the first Sonnet before stand-down as "not spelled out explicitly", and it is right that the
plan implied rather than stated it. Stating it now so nobody re-derives it.

**A `CapabilitySource` carries BOTH `list(ctx)` and `read(handle, ctx)`.** The registering source — in
`features/agent-plugins/` — supplies both. `assistant/` code only ever calls methods on the source
object it was handed; it never imports the feature module by name, so the one-directional import rule
holds with no exception and no dynamic import.

`read` delegates straight to the existing `readInstalledSkillMarkdown(packageRoot, skillPath)`, which
already composes `package-paths.ts`'s `assertContainedOnDisk` guarantee with the file read. **No new
path-safety logic is written anywhere in this slice** — one implementation of "stay inside the package
root," not two.

`read` is optional on the interface: a future source that lists only callable things has none.

### AMENDMENT by the Primary — do NOT resolve the workspace from `process.env`

Sonnet's design has `registerAgentPluginSkillsCapabilitySource()` read `process.env.TOVU_WORKSPACE`
directly at registration time, to avoid threading a parameter through the zero-argument
`installFirstPartyToolContributors()`. **That is a cross-workspace bug in the second boot path**, and
it must not ship.

Verified:
- `TOVU_WORKSPACE` is set **only** by `daemon-supervisor.ts:353` when spawning the agent daemon. The
  in-process BYOK path (`createAssistantByokModule`, called once from `app.ts:1034`) never sets it.
- `createSqliteRouteDeps` accepts `overrides.workspaceId` (`deps.ts:295-298`, the install-dir `serve`
  path), so the main process's `routeDeps.workspaceId` **can legitimately differ** from
  `resolveWorkspace`'s default.

Consequence of the env approach: in the BYOK path `process.env.TOVU_WORKSPACE` is `undefined`, the
source falls back to the **default** workspace, and the assistant lists capabilities belonging to a
workspace it is not operating in. Sonnet's own trap 6 half-spots this but frames it as "match
existing behavior" — in the daemon the env var is always set, so the fallback is dead code there; in
BYOK it is the *only* path, and it is wrong.

**Required instead — and it uses the fact Sonnet itself established:** `contributeCapabilityTools()`'s
`build(routeDeps)` captures `routeDeps.workspaceId` (structurally present on
`AssistantToolRegistryDeps` via `PluginsToolDeps.workspaceId` — **verified**,
`features/plugin-runtime/tool-registrations.ts:52-54`, so no edit to the 24-type intersection). That
value is passed into the lazy catalog build, which passes it to each source's `list({ workspaceId })`.

A source's `list` therefore takes a context argument and **never reads `process.env`**. This is
strictly more correct in both boot paths, needs no out-of-scope edit, and removes the "one process,
one workspace" assumption from the *source* while keeping it as a documented invariant of the
*catalog*. The catalog still asserts the workspace it was built for.

**Test this explicitly:** a source's `list` receives the workspace id it was built with, and
`process.env.TOVU_WORKSPACE` set to a *different* value does not change the result.

### Acceptance checks

- Two installed digests of one plugin → disjoint ids, both present, no throw.
- A 7-skill plugin → 7 distinct cards, not 1. **A plugin with no eponymous skill still produces
  cards** — this is the test that proves the scaling cliff is closed.
- `capability_search` output contains **no `handle` and no absolute path** — asserted on the
  **serialized payload**, not the object shape, because that is how it actually escapes.
- `capability_get` on an unknown id fails with **exact** error text.
- `kind` filter applied in SQL before ranking, not as a post-filter.
- Every test proven **RED first, for the right reason**.
- Scoped runs only: `node --import tsx --test <file>`. Never `npm test` / `test:cov`.

### Leases

Single writer: **Claude Sonnet 5**, all files. Verifier: **Codex gpt-5.6-sol** (different family,
binding veto, floor 8.5). Advisory: Gemini 3.7 Flash. Then `/audit-work` by a different family from
the writer, then up to one correction round.
