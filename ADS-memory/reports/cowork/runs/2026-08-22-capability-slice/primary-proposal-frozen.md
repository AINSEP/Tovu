# PRIMARY (Claude Opus 5, 1M) — frozen co-design proposal

**Frozen** before dispatching the packet to Sonnet, Codex, or Flash, and before reading any of their
proposals.

## Cowork Scope Check

Task as I understand it: the tool side only — a generic source seam, one registered source (Agent
Plugin skills), a searchable catalog over registered sources, and `capability_search` /
`capability_get`. **Not** the chip/pointer change, **not** the architecture rule, **not** any UI.

Files read in full: `tool-contribution-registry.ts`, `tool-catalog-query.ts`, `tool-catalog-manifest.ts`,
`capability-projection.ts`, `install.ts` (type region), `Jini/packages/core/src/tool-registry.ts`
(descriptor/registration/registry region).

Uncertainty I am flagging rather than hiding: **where the catalog gets built.** The tool catalog is
built once at daemon boot in `agent-daemon-server.ts`. If the capability catalog must also be built
there, this slice grows past its approved 1-file edit. My design avoids that (lazy build, below), but
if a participant thinks eager boot-time construction is required, that is a scope question for the
owner, not something to quietly expand into.

## Design

### 1. `src/assistant/capability-source-registry.ts` — the seam

Structural clone of `tool-contribution-registry.ts`: module-level ordered list, `register` /
`list` / `reset*ForTests` trio, replace-by-key on `id` so a double-registration does not double the
catalog. Same reasoning as that file's header; cite it rather than restate it.

A **capability card** is discovery-only:

- `id` — stable and namespaced. **Reuse `capability-projection.ts`'s existing scheme**
  (`agent-plugin:<pluginId>:skill:<skillName>`) rather than inventing a second id grammar for the
  same objects. Two id schemes for one thing is how the three-descriptor problem started.
- `kind` — a string, **data only, never switched on** in registry or catalog code.
- `name`, `description`, `keywords` — the ranked material.
- `source` — which registered source produced it.
- `scope` — workspace ownership. Absent means global/first-party.
- `revision` — content digest or version.
- `handle` — **`unknown`, opaque.** Only the registering source interprets it. The registry and the
  catalog must never inspect it, and it must never be serialized to the agent.

A **capability source** is `{ id, list(ctx), read?(handle, ctx) }`. `read` is **optional** — a source
exposing only callable things has none. There is deliberately no `execute`, no `invoke`, and no
`activate` anywhere in this file. That absence is the design.

**Why no `execute` field, stated in the header so the next reader does not re-add it:**
`AgentPluginCapabilityDescriptor` in this same repo already carries an `execute` union whose second
member is permanently `{kind: "unavailable"}` — a field that exists to say "not this one" — and that
descriptor has zero production callers. That is what an execution union does to a discovery type at
N=2.

### 2. `src/features/agent-plugins/capability-source.ts` — the first source

Lives in the feature, imports the registry from `assistant/`. **Direction matters:** feature reaches
into the assistant seam; `assistant/` never imports a feature by name. That is the entire reason the
contribution-registry pattern exists.

- **One card per (pluginId, skillName)** — not per plugin, not per digest. This is what makes
  `ui-ux-design`'s 7 skills individually reachable and kills the eponymous-skill constraint outright.
- **Digest collision:** `listInstalledPlugins` walks every digest, so two installs of one pluginId
  both appear. Resolve to one card by newest `version` (semver), tiebreaking on lexical
  `archiveDigest` — documented, deterministic. **Not `mtime`: that field does not exist on
  `InstalledAgentPlugin`.** The card records the resolved `revision` so the choice is auditable.
- **`read` delegates to the existing `readInstalledSkillMarkdown`**, which already composes
  `assertContainedOnDisk`'s containment guarantee with the file read. **Do not reimplement path
  safety.** One implementation of "stay inside the package root," not two.
- `handle` is `{ packageRoot, skillPath }` — meaningless outside this module, and never leaves it.
- Exports `contributeAgentPluginCapabilitySource()`, matching every `contribute<Domain>Tools()`
  sibling's naming and posture: an explicit call from a composition root, never register-on-import.

### 3. `src/assistant/capability-catalog-query.ts` — the catalog

Mirrors `tool-catalog-query.ts`'s posture: in-memory SQLite, FTS5 + `bm25()`, disposable, seeded from
`.list()`, source of truth stays in the sources.

**Decision I expect disagreement on, so I am stating the trade-off rather than asserting:** define a
small FTS5 schema *in this module* rather than reusing `@jini-ai/sqlite`'s
`ensureToolCatalogTables`/`reseedToolCatalog`. Those helpers are tool-shaped —
`{id, description, inputSchema, source}` — and a card carries `kind` and `keywords` they do not
model. Reusing them means overloading `source` to carry `kind`, which is exactly the quiet mismatch
that rots. **The cost is real and I am not hiding it:** we lose `indexedDescriptionFor`'s doc2query
expansion for free, and we duplicate ~20 lines of FTS5 setup. I judge the schema honesty worth more
in slice 1; expansion can be added later against a schema that actually fits.

**Tenancy — build one catalog per workspace, cached by workspace, rather than one global catalog with
a scope predicate.** Both satisfy "filter before ranking." The per-workspace instance is stronger
because **no query can forget the WHERE clause** — out-of-scope cards are never seeded, so the leak
class is eliminated by construction rather than by remembering. The index is `:memory:` and
disposable, so N small catalogs cost about what one large one costs. `install.ts`'s SECURITY note
documents a real cross-tenant bug that type-checked; a predicate everyone must remember is the same
shape of hazard.

**Build lazily on first query per workspace, cache, expose `invalidate()`.** Lazy is what keeps this
slice inside its approved file scope — no boot-path wiring in `agent-daemon-server.ts`. `invalidate()`
exists now but is wired to install events in a later slice; shipping the hook without the caller is
deliberate and should be said in the header, not left to look like an oversight.

`search(query, { kind?, limit })` — `kind` is a WHERE applied before ranking, never a post-filter on
results.

### 4. `src/assistant/capability-tool-registrations.ts` — the agent surface

Two real `ToolRegistration`s with real handlers, registered through `registerToolContributor` under
domain `"capability"`. These two genuinely *are* callable tools; what must never become a fake tool is
the skill content itself.

- `capability_search(query, kind?, limit?)` → cards **without `handle` and without content.** The
  handle is internal plumbing; serializing it to the agent would leak absolute filesystem paths.
- `capability_get(id)` → card plus content, resolved **only through an id present in the caller's own
  workspace catalog.** Never accept a path, never accept a handle from the agent. This is the
  security boundary of the slice.
- Both read-only; risk classification set accordingly.
- Imports only from `assistant/` — no feature imported by name.

### 5. `src/server/tool-catalog-manifest.ts` — one edit

Add two imports and two calls: `contributeCapabilityTools()` (the two tools) and
`contributeAgentPluginCapabilitySource()` (the one source). Both boot paths already call this
function, so no other wiring changes.

I considered a separate `installFirstPartyCapabilitySources()` function — arguably cleaner, since
tool contributors and capability sources are different registries — and rejected it **because it
would require editing both boot paths, taking this slice past its approved scope.** Note that
reasoning in the file so the next person can revisit it deliberately.

## Defects and traps I predict

1. **`handle` leaking to the agent.** `{ packageRoot, skillPath }` contains absolute host paths.
   Whoever writes the tool layer will be tempted to spread the card. Needs an explicit test.
2. **Two id grammars.** If the source invents `capability:agent-plugin/...` while
   `capability-projection.ts` already emits `agent-plugin:<id>:skill:<name>`, we have recreated the
   original problem inside the fix.
3. **Digest tiebreak on a non-existent field.** `InstalledAgentPlugin` has no `mtime`. Anyone
   reaching for recency will invent it.
4. **`assistant/` importing `features/agent-plugins` by name** to "wire it up" — closes exactly the
   module cycle the whole registry pattern exists to prevent. `check:architecture` should catch it;
   the design should not rely on that.
5. **Async `list()` in a sync seam.** `tool-contribution-registry`'s `build` is synchronous; reading
   installed plugins from disk is not. If `list()` returns a promise, the catalog build must be async
   all the way up, and `buildToolCatalogQuery`'s synchronous shape is not a precedent for it.
6. **A plugin with zero skills, or a skill file that has been deleted since install.** `list()` must
   not throw and take the whole catalog down because one plugin is malformed.
7. **Empty-catalog ambiguity.** A source returning `[]` because nothing is installed and a source
   returning `[]` because it caught an error are indistinguishable to the caller. The existing
   `ComposerCapabilitySource.list()` has this exact flaw today.

## Test plan

Each must be **proven RED first, for the right reason**, and assert **exact error text** where it
throws.

- **registry:** replace-by-key does not double-register; `reset*ForTests` clears; registration order
  preserved; `list` returns registrations in order.
- **agent-plugin source:** one card per skill for a 7-skill plugin (the `ui-ux-design` shape); two
  digests of one pluginId collapse to one card at the newest version with the documented tiebreak;
  the resolved `revision` is recorded; a plugin with no eponymous skill still produces cards — this
  is the test that proves the scaling cliff is closed; `read` refuses a path escaping the package
  root with the exact `PackagePathViolation` text.
- **catalog:** `kind` filter applied before ranking; workspace A's cards never appear in workspace B's
  catalog **including in result counts**; empty query returns the full eligible list rather than
  nothing; `invalidate()` picks up a newly registered source.
- **tool layer:** `capability_search` output contains no `handle` and no absolute path — assert on the
  serialized payload, not on the object shape, because that is how it actually escapes;
  `capability_get` on an id outside the caller's workspace fails with exact text rather than
  returning content.

Run scoped only: `node --import tsx --test <file>`. Never `npm test`.

## Blind spots the others will likely miss

- **Trap 5 (async in a sync seam)** is the one most likely to be discovered late, during
  implementation, after the shape is set. It should be decided in design.
- **The `@jini-ai/sqlite` reuse-vs-own-schema call** is the highest-leverage decision in the slice and
  the easiest to make by reflex. I have argued for our own schema and I expect at least one
  participant to argue the opposite well.
- **Asserting on the serialized payload rather than the object** for the handle-leak test. Testing
  object shape passes while `JSON.stringify` still leaks.

## Strengths to preserve

`mcp-federation/trust.ts`'s native/federated split; `ToolExecutor`'s deny-by-default; the existing
`readInstalledSkillMarkdown` containment guarantee; `tool-catalog-query.ts`'s disposable-index
posture; the "explicit call from a composition root, never register-on-import" rule that every
`contribute<Domain>Tools()` follows; `ToolRegistration.handler` staying non-optional.

## Risk tier recommendation

**Medium.** New agent-facing tools that return file content, a multi-tenant filtering boundary with a
documented prior cross-tenant bug in the same feature, and an edit to a shared composition root.
Nothing here is schema, auth, or payment — but the tenancy boundary alone justifies medium over low.

<<COWORK_END>>
