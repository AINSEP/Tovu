# Spec — per-site Agent Plugin memory

Status: DRAFT, not started. Owner-requested 2026-09-10; owner decisions recorded 2026-09-14 (see
"Decisions"). Superseded 2026-09-14: layout revised from a `packages/` + `memory/` split ("Layout A")
to a self-contained per-plugin folder ("Layout B") per owner review of the first draft. Extended
2026-09-14 (same day, later): a Tovu reverse-domain extension namespace for author-declared memory
behavior — see "Tovu extension namespace" below. That section is **PROPOSED, pending the owner's final
confirmation** (the owner raised it as a question, not yet a decision); everything else in this file is
already decided.

## The problem

Two kinds of site-specific knowledge have no home today.

**1. Facts a plugin learns about this site's account.**
`content/agent-plugins/higgsfield-media/skills/higgsfield-media/SKILL.md` hardcodes facts that are
true of ONE account on ONE day:

- the 7 tool names (`generate_image`, `models_explore`, `job_status`, `jobs_wait`,
  `show_generations`, `reveal_generation`, `show_generation_by_ids`)
- which models work (`z_image` yes; `gpt_image_2`, `recraft_v4_1` "Requires basic plan or higher")
- the shape of `generate_image`'s arguments

A web-research pass on 2026-09-10 could not corroborate ANY of it publicly, and found an MCP
directory stating outright that Higgsfield's tool list is unpublished and discovered live after
authentication. The names turned out to be correct — they match the live allowlist in this install's
own DB — but that is luck of having run it once, not knowledge the plugin can carry.

Every one of those facts is per-account: a different operator on a paid plan gets a different model
verdict, and a vendor shipping a new tool changes the list. A plugin that asserts them globally is
wrong somewhere by construction. **The plugin should DISCOVER them per site and remember, instead of
asserting them from its package.**

**2. Project knowledge the user wants a plugin to know (added 2026-09-14, owner).**
A user often has idiosyncratic knowledge about their own project that a plugin should always apply —
naming conventions, brand rules, which account or project to use, things that went wrong before. They
must be able to save it for one plugin, and it must NOT be overwritten when that plugin is updated.

## Why not write into the package

Installed packages live at `<site>/agent-plugins/ws/<workspace>/packages/sha256/<digest>/` today. The
digest IS the directory's identity. Writing inside it makes the name a lie and breaks
`installAgentPlugin`'s "already published, skip" short-circuit, and a new version installs under a new
digest directory, so anything written into the old one would be left behind.

The read-only `chmod` is NOT the reason. `install.ts:511-519` says plainly it is "best-effort
defense against an ACCIDENTAL same-process write ... not a security boundary" — that part is our own
typo-guard and could be changed. The content-addressing is the real constraint, and it is worth
keeping: **the digest is what proves a downloaded marketplace package is what the vendor published.**
Trading it away to gain writability would cost more than it buys.

## Shape (Layout B)

Each installed plugin gets ONE self-contained, per-plugin folder — not a shared top-level `packages/`
bucket grouped by content hash across every plugin, with a separate shared top-level `memory/` bucket
beside it. The owner's objection to the first draft (Layout A, below) was exactly that: a `memory/`
directory that groups every plugin's memory together reads as "one general memory folder," when the
right mental model is "each plugin owns one folder, and that folder has a `memory/` subfolder in it."

    <site>/agent-plugins/ws/<workspaceId>/
      staging/                        workspace-level scratch — unchanged, see "Why staging/ and
                                       activations.json stay workspace-level" below
      activations.json                workspace-level, keyed by plugin id — unchanged, same reason
      <pluginId>/
        package/
          sha256/<digest>/            immutable, content-addressed WITHIN this plugin's own folder
        memory/
          learned/                    what the plugin discovered about this site's account
          notes/                      what the user wrote about their project for this plugin

This is the SAME two kinds of memory as the first draft, with the SAME properties, just relocated:

- Scoped per workspace AND per plugin id. A plugin can never read or write another plugin's memory —
  now true by construction of the path itself (memory lives inside that plugin's own folder), not
  merely by a naming convention.
- Keyed by plugin id, not digest, so it survives plugin updates and reinstalls — the whole point.
- Size-capped per plugin, same posture as the install byte caps.
- Path containment via `package-paths.ts`'s `assertContainedOnDisk` — same primitive `package/`
  extraction already uses, now called with the plugin's own `memory/` root instead of a package root.
  One implementation, not two, for both directories.
- UTF-8 text only (notes, not assets).

### Why `staging/` and `activations.json` stay workspace-level

Two exceptions to "everything about a plugin lives under `<pluginId>/`," both load-bearing, not
stylistic:

- **`staging/`** cannot move under `<pluginId>/` because the plugin id is not known until AFTER
  extraction. `installAgentPlugin` receives raw archive bytes and a digest; it does not know which
  plugin those bytes belong to until it extracts them and parses `plugin.json` from the extracted
  tree (see "Install-time impact" below). A per-plugin staging directory would need the plugin id to
  choose its own path — exactly the fact staging exists to discover. It remains one shared,
  workspace-scoped scratch directory; `mkdtemp` already gives each install attempt its own
  subdirectory there, so concurrent installs still do not collide.
- **`activations.json`** stays a single workspace-level file, keyed by plugin id internally
  (`AgentPluginActivations.plugins: Record<pluginId, record>`), because every reader
  (`isAgentPluginActive`, the three gate sites named in `activation.ts`'s own header) wants the WHOLE
  workspace's activation map in one read, to filter a list of candidates — not one plugin's record at
  a time. Splitting it into `<pluginId>/activation.json` would turn one file read into N, for no
  reader that needs it.

### How `activations.json` references packages

It doesn't, and didn't before this change either — worth stating plainly since it is easy to assume
otherwise. `activations.json` records are keyed by `pluginId` (the manifest `name`), never by digest;
`isAgentPluginActive` looks up a plugin's record by id and defaults to active when absent (see
`activation.ts`'s header for why absent-means-active is deliberate). Which digest(s) currently exist
under a plugin's `package/sha256/` is discovered independently by scanning disk
(`listInstalledPlugins`, revised below). Layout B does not change this relationship at all — it was
already plugin-id-keyed, which is exactly the property `memory/` needed to inherit, and did.

## Update and uninstall

**Update.** `package/sha256/<digest>/` keeps its existing content-addressed behavior, now scoped
inside the plugin's own folder instead of a workspace-wide bucket: installing new bytes for a plugin
adds a new digest directory under that plugin's `package/sha256/`; installing byte-identical content
again short-circuits (see "Install-time impact" for how that short-circuit itself must change).
**Today, nothing automatically deletes a superseded digest** — `uninstallAgentPlugin` removes every
digest matching a plugin id at once, but nothing removes just the OLD one when a new version arrives.
This spec does not add that pruning; it is out of scope here and should be its own decision (its
absence is not a regression Layout B introduces — the current code has never had it either; see
"Wrong premises" in the inventory for the on-disk evidence). What Layout B DOES guarantee is that
`memory/` is untouched by any of this: it is keyed by the plugin id, sits beside `package/` rather
than inside it, and no code path that writes a new digest directory touches `memory/` at all.

**Uninstall.** `uninstallAgentPlugin` removes `<pluginId>/package/` (all digests) and the plugin's
`activations.json` entry, exactly as it removes `packages/sha256/*` today. It now ALSO defaults to
KEEPING `<pluginId>/memory/` — closing the first draft's open question: yes, the uninstall
confirmation offers an explicit "also delete this plugin's memory" choice, off by default, same
reasoning as a provisioned external-MCP row surviving removal (the operator or the plugin earned that
data; silent deletion is unrecoverable). If the user does not opt in, `<pluginId>/` is left on disk
containing only `memory/` after uninstall (an empty `package/` is removed, since nothing references it
and leaving an empty directory tree behind serves no purpose). Reinstalling the same plugin id later
finds that `memory/` and resumes with it intact — this is the entire reason memory is keyed by plugin
id and not digest.

Bundled plugins are unaffected by any of this: they remain refused as uninstallable for the reason
`uninstall.ts`'s header already states (re-seeded every boot), independent of the layout.

## Integrity check under `package/`

Unchanged in mechanism, relocated in path. `package-paths.ts`'s `assertContainedOnDisk` is pure path
logic with no opinion about where the root sits; it is called today with `finalRoot` under
`packages/sha256/<digest>/` and will be called identically with `finalRoot` under
`<pluginId>/package/sha256/<digest>/` — same `realpath`-based symlink defense, same spec-mandated
"filesystem-resolved" containment, same function, no new implementation. `memory/`'s read/write tool
pair (see "Access" below) calls the SAME function against the plugin's `memory/learned/` or
`memory/notes/` root, so a memory write gets the identical zip-slip-class defense a package extraction
gets, for free.

## What goes in it

`learned/` — facts the plugin LEARNED about this site's account:
- the real tool list + schemas from an authenticated `tools/list`
- which models this account may use, and which are plan-gated (with the verbatim error)
- vendor quirks discovered at runtime

`notes/` — project knowledge the USER provides for this plugin:
- conventions, preferences and constraints specific to their project
- context the plugin cannot discover (which project or account to use, what to avoid)

Properties, restated per subfolder:

| | `learned/` | `notes/` |
|---|---|---|
| Written by | the plugin (its skill, via the write tool) | the user in the admin, or the assistant on the user's explicit request |
| Nature | cache: deleting it must degrade to "rediscover", never to broken | source of truth: cannot be rediscovered |
| On plugin update | kept (may be refreshed by the plugin) | kept, never modified |
| On plugin uninstall | kept by default (see "Uninstall" above) | kept by default, never silently deleted |
| Loaded into the agent | on demand, via the read tool | automatically, whenever the plugin's skill is used |

## What must NOT go in it — each has a correct home already

| Not this | Where it belongs | Why |
|---|---|---|
| Credentials, tokens, OAuth secrets | `external_mcp_servers` sealed columns | already sealed with AAD; a text file is not |
| OAuth handshake / pending state | DB, short TTL | needs atomic single-use consume across processes — see [[reference-assistant-tools-run-in-a-separate-process]] |
| Tool allowlists / write grants | the connection row, operator-set | a downloaded package must never grant itself access — the rule built 2026-09-10 in `federate-mcp.ts` (provisioning is not authorization) |

That last row is the one to hold firm on, and it applies to `notes/` too: a note can tell the plugin
how to behave, but it can never grant a tool or widen access. The plugin may SUGGEST tool names in its
`mcp.json`; only the operator grants them.

## Access

- A read/write tool pair, scoped so the calling plugin's id selects the directory — the plugin must
  not be able to name someone else's. Follow `theme_write_file`'s shape for the write tool (UTF-8
  text, containment-checked). The plugin's own write tool may write only `learned/`.
- `notes/` is edited by the user: an admin editor on the Agent Plugins page (next to the plugin's file
  viewer), plus an assistant tool that writes a note only when the user asks for it.
- At skill activation, the contents of `notes/` are added to the plugin's context automatically.
  Because this costs tokens on every run, `notes/` has its own size cap.

## Tovu extension namespace (PROPOSED — pending owner confirmation)

The owner asked, quoting agent-plugins.org directly: "'Reverse-domain extension namespaces let
individual clients add behavior without changing the portable core.' ... we'd be a vendor where we can
adjust it right? but you know what since we have to update it and for security we need the structure
you set out in Option B?" — i.e., can a plugin AUTHOR declare memory-related behavior for their plugin
using the spec's own extension mechanism, on top of (not instead of) Layout B's storage rules.

**What the spec actually says (re-fetched 2026-09-14, §8/§8.1/§8.2/§11.3, quoted verbatim, not
paraphrased from the earlier debate below).** Two DIFFERENT mechanisms share the name "extension,"
and this proposal uses both for different purposes:

- **§8.1 Manifest extension data** — client-specific FLAGS live in `plugin.json`'s own `extensions`
  field, reverse-domain keyed: `"extensions": { "dev.tovu.memory": { ... } }`. "A client MUST ignore
  manifest entries for namespaces it does not implement without validating the contents of their
  values" — so every OTHER client silently ignores Tovu's block, by spec, not by convention.
- **§8.2 Extension directories** — client-specific FILES live in a top-level directory named for the
  namespace, sibling to `plugin.json`/`skills/`/`mcp.json`: "The extension directory for a namespace is
  the top-level directory named after it." Same ignore-if-unimplemented rule applies to directories
  (§11.3: clients "MUST ignore unsupported component types," and "lack of support for a component
  type... or client extension is not itself an error").
- The spec is silent on unknown-extension VALIDATION, mutable state, storage, or install layout beyond
  this — §4.2's standard layout is "a normative example," not a requirement, and install/version-
  management structure is explicitly left to "client policies" (`install.ts:32`'s own citation of this
  same point, `CTX-AGENTPLUGINS-2026-08-12.md` F2: "Agent Plugins v1 is a package format, not an
  install, permission, sandbox, or trust model"). Layout B is Tovu's client policy; this section does
  not change it — the extension only adds AUTHOR-DECLARED behavior on top.

**Domain, verified from the repo, not guessed.** Tovu's canonical domain is `tovu.dev` — the root
`package.json` name is `"tovu"`; `development/docs/themes/theme-authoring-guide-v2.md` ships
`"$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json"` as the actual production schema
URL convention Tovu already uses for its OWN manifest format; `ADS-memory/reports/2026-09-04-terms-of-
service-draft.md` and `2026-09-04-tovu-dev-data-inventory.md` are both compliance audits of the live
`tovu.dev` site. Reverse-domain notation for `tovu.dev` is `dev.tovu` (the same convention the spec's
own `com.example.client` example uses for `example.com`).

**A conflicting prior precedent exists, and it was never built.** A 2026-08-12 multi-agent swarm
debate (`ADS-memory/reports/swarm-consensus/...`, ratified in
`ADS-memory/reports/architecture/2026-08-20-agent-plugins-scope-ruling.md`) considered and ultimately
**REJECTED** an `extensions["org.tovu.commands"]` namespace for a DIFFERENT purpose — presentation
metadata and argument-binding for a parallel command system. Final ruling, quoted: "No
`org.tovu.commands` namespace. ... executable bindings and argument schemas must be produced by the
host adapter, not by the package being classified — the same rule that forbids a plugin authoring its
own MCP allowlist." Two things follow from re-reading that ruling now: (1) `org.tovu` does not match
`tovu.dev` reversed (`dev.tovu`) and appears to have been a placeholder in that debate, not a verified
domain — it was rejected and never shipped, so there is no live code using it to stay consistent with;
(2) the REASON it was rejected is squarely about EXECUTABLE bindings and argument schemas — a
different, narrower risk than a plugin declaring passive memory-behavior flags. The rule that ruling
establishes — a plugin package must never author its own execution or authorization semantics; the
host adapter does that — is exactly the rule this proposal's own constraints (below) are built to
satisfy, not an obstacle to it. **The literal namespace string is nonetheless flagged
[NEEDS CLARIFICATION: confirm "dev.tovu.memory" as the exact, permanent reverse-domain string]** —
it ships inside every plugin's `plugin.json` forever once adopted, is expensive to rename later, and is
a branding call, not an architecture one.

**What the extension may declare** — `extensions["dev.tovu.memory"]` in `plugin.json`:

| Field | Type | Tovu's rule |
|---|---|---|
| `usesMemory` | `boolean` | Presentation-only hint (e.g. hide the notes editor for a plugin that opted out). `memory/{learned,notes}` is still created for every plugin regardless — the user can always add a note even if the plugin never asked for one. |
| `notesAutoload` | `boolean` | A SUGGESTED default, exactly like an `mcp.json` server entry suggesting a tool name (see "What must NOT go in it" above) — the operator's own admin toggle always overrides it. Tovu Decision 4 ("notes/ loads automatically") remains the global default when the plugin declares nothing. |
| `learnedSizeCapBytes`, `notesSizeCapBytes` | `number` | A plugin may request a SMALLER cap than Tovu's own global default (e.g. it knows it never needs much). Tovu's global cap is always the hard ceiling — `min(declared, global)`, never the reverse. A plugin cannot raise or disable its own cap. |

`dev.tovu.memory/` (the sibling DIRECTORY, §8.2) — optional seed files:

- May ship a `learned-seed/` subtree whose files are copied into `learned/` at FIRST install only
  (never on update or reinstall over existing content) — the same trust boundary as the plugin calling
  its own write tool once at first run, not a new capability.
- **MUST NOT ship anything under a `notes-seed/`-shaped path, and Tovu's installer MUST NOT read one if
  present.** `notes/` is the user's own, exclusively; a package seeding it would be indistinguishable
  from a vendor pre-writing "project knowledge" the user never actually said — this is the one hard
  rule in this whole section. RED test required (acceptance list below).
- Ships inside `package/`, so it is read-only, replaced on update along with the rest of the digest
  directory, and covered by the SAME integrity check `package-paths.ts` already provides — no separate
  mechanism.
- **Must never declare or grant a tool, permission, or MCP allowlist entry.** Restates the existing
  "provisioning is not authorization" rule (`federate-mcp.ts`, 2026-09-10) explicitly for this new
  surface, because it is the exact shape of mistake the rejected `org.tovu.commands` proposal made.

**Inventory addition (Part 3 of the ask).** Checked whether today's code would even let a
`dev.tovu.memory/` directory or an `extensions` manifest field survive: install.ts's `extractEntries`
has **no top-level directory allowlist at all** — every archive entry is extracted subject only to the
existing path-containment/zip-slip/size/count checks, with no awareness of directory NAMES. A
`dev.tovu.memory/` directory (or literally anything else) already survives extraction unchanged today;
nothing in `install.ts` needs to change for the directory half of this. The manifest half does need a
change: `manifest.ts`'s `KNOWN_MANIFEST_KEYS` (line 83) is `["$schema", "name", "version",
"description", "author", "license", "keywords"]` — **it does not include `"extensions"`**, so a
spec-legitimate `plugin.json` with an `extensions` field produces a spurious "unrecognized plugin.json
field 'extensions' (ignored per spec)" warning today, and `AgentPluginManifest`'s type does not expose
an `extensions` property at all — the field is parsed as unknown and dropped. Building this proposal
requires: adding `"extensions"` to `KNOWN_MANIFEST_KEYS`, adding `extensions?: Readonly<Record<string,
unknown>>` to `AgentPluginManifest`, and a NEW, separate validator for the `dev.tovu.memory` sub-shape
specifically (Tovu-owned schema, not the open spec's concern) — none of which is a Layout B change, all
of which is additive to `manifest.ts` alone.

## Alternatives considered and rejected

**Alternative A — "present memory as `<plugin>/memory`" over a physically separate store.** Keep
`packages/sha256/<digest>/` and a top-level `memory/<pluginId>/` as two parallel siblings (the shape
this spec had until 2026-09-14), and have every reader (viewer, tools, export, backup) present them
to a human or an LLM as if `memory/` lived inside the plugin's own folder. Rejected: every one of
those readers would have to know and apply the mapping from "logical" to "physical" path, forever,
which is exactly the kind of implicit invariant that erodes as more code touches this tree — and it
is also, per the owner's own reading, the thing that makes a per-plugin facility look like "one
general memory folder" rather than each plugin owning its own. Layout B makes the physical layout
match the logical one instead of translating between them.

**Alternative C — reuse the existing `data/<pluginId>` (`PLUGIN_DATA`) directory for memory.**
`layout.ts`'s `AgentPluginWorkspaceLayout` already declares `pluginDataDir(pluginId)` →
`<root>/data/<pluginId>`, and `manifest.ts` already reserves the env var names `PLUGIN_ROOT` and
`PLUGIN_DATA` — both taken directly from the open agent-plugins.org spec's own contract for a stdio
server process, not invented by Tovu. It would be natural to ask why `memory/` doesn't just live
there. Rejected, and worth recording why: as of 2026-09-14, `pluginDataDir` has ZERO production call
sites and ZERO on-disk instances in either real workspace on this machine (`workspace-local`,
`ws-second`) — it is reserved scaffolding for a stdio-process-spawning feature that does not exist yet
(no `spawn()` call anywhere in `features/agent-plugins` or `features/plugin-runtime` sets these env
vars today). The spec itself (§9.1 Subprocess environment, quoted verbatim, re-fetched 2026-09-14) says
`PLUGIN_DATA` "is the absolute path to a client-managed persistent data directory dedicated to that
installed plugin instance," that "the client MUST create the directory before launching a plugin
subprocess, MUST make it writable to that subprocess, and MUST preserve its contents across plugin
updates," and scopes its use case to "installed dependencies (node_modules, virtual environments),
generated code, caches, and other plugin state that should persist across updates." That confirms the
rejection rather than weakening it: `PLUGIN_DATA` is ONE generic bucket, MUST be writable to the
plugin's OWN subprocess, with no author/user distinction and no spec-defined notion of "load this part
into agent context automatically." Tovu's memory model needs two tiers with different owners
(`learned/` written only by the plugin; `notes/` written only by the user/assistant, and the plugin
must never be able to write there), different mutation rules, different size caps, and only one of
which (`notes/`) is auto-loaded into agent context. Reusing `data/<pluginId>` would mean a future
spec-conformant process granted `PLUGIN_DATA` (which per the spec text above MUST be writable to that
process) could read or overwrite the user's `notes/` with no way to keep them apart — the spec's own
"MUST make it writable to that subprocess" clause is exactly the property `notes/` cannot have. Keeping
`memory/` a distinct sibling under `<pluginId>/` costs nothing today (nothing else is there yet) and
avoids that collision permanently. If `PLUGIN_DATA` is ever wired to a real spawned process, it should
move to `<pluginId>/data/` for the same per-plugin-folder symmetry Layout B establishes here — that is
a future spec's decision, not this one's.

## Install-time impact — the one place this is not a pure rename

Everywhere else in the codebase, "layout" means "ask `layout.ts` for a path, use it" — verified by
inventory (see the accompanying report) to have zero hardcoded bypasses in production code. `install.ts`
is the one exception, and it is worth spelling out precisely because it is the highest-risk single file
in this change:

`installAgentPlugin` today computes `finalRoot = path.join(workspaceLayout.packages, digest)`
BEFORE extracting anything, using ONLY the archive's own SHA-256 — that is deliberate: it is what lets
a repeat install of already-published bytes short-circuit with a single `isRealDirectory` stat call and
`archiveReader.entries()` is "never called on this path" (the function's own comment). Under Layout B,
`finalRoot` must be `<pluginId>/package/sha256/<digest>`, and `pluginId` is the manifest `name` —
which is not known until `plugin.json` is parsed, which today only happens AFTER extraction
(`indexInstalledRoot`, called on the freshly-extracted `extractionRoot`, or lazily on an
already-published `finalRoot` for the dedup path).

This means the pre-extraction fast path cannot survive unchanged: a repeat install can no longer be
recognized before doing at least a staging extraction and a manifest parse, because the destination
directory's OWN NAME now depends on a fact only extraction reveals. The mitigation is straightforward
and stays inside the function's existing bounds — always extract to `staging/` first (still capped by
the same `LIMITS`), parse `plugin.json` from the staging copy to learn `pluginId`, THEN compute
`finalRoot` and check whether it already exists; if so, discard the staging copy without renaming
(cheap — the content is byte-identical by digest, so nothing further needs re-verifying). The
observable behavior change is narrow and bounded: a repeat install of content already on disk now
always pays one bounded extraction instead of one `stat` call. Nothing about this weakens the digest
verification, the zip-slip defense, or the tenant isolation — it only moves WHEN the "already have
this" check can run, from before extraction to after.

`resolve-agent-plugin-refs.ts`'s `listInstalledPlugins(packagesDir: string)` is the second file this
touches non-mechanically: today it lists ONE flat directory of digest subdirectories. Under Layout B,
discovering "every plugin installed in this workspace" requires walking two levels —
`<workspaceRoot>/*/package/sha256/*` — so its signature changes from a single packages directory to a
workspace root, and its body gains one level of directory walk. Its ~9 production callers (listed in
the accompanying report) each need the one line that calls it updated to pass the new argument; none
of them need their own scanning logic changed, since `listInstalledPlugins` is the single place that
logic lives.

## ONE-TIME MIGRATION

**Scope.** Both live workspaces on this machine (`workspace-local`: 10 digest directories under one
flat `packages/sha256/`, plus one `packages/superseded-2026-09-10/` directory that is NOT read by any
current code path — see the report's "wrong premises" — and can be left alone or removed by hand,
it is outside `workspaceLayout.packages`'s own scanned path either way; `ws-second`: 1 digest
directory) need every existing `packages/sha256/<digest>/` moved under its owning plugin's new
`<pluginId>/package/sha256/<digest>/`. **Neither workspace has any existing `memory/<pluginId>/` or
`data/<pluginId>/` content to preserve** — both are unbuilt as of 2026-09-14, confirmed by directory
listing — so this migration is a pure move of `packages/`, not a merge with pre-existing memory data.
(If a future run of this migration happens on an instance that DOES have old-shape `memory/<pluginId>/`
content from a Layout-A-era install, the same migration must also move that directory verbatim to
`<pluginId>/memory/` — the script should handle both cases, but only the `packages/` move is exercised
by anything on disk today.)

**Steps, per workspace, in order:**

1. If `<workspaceRoot>/.agent-plugin-layout-migrated` (a marker file, schema-versioned e.g.
   `{"layoutVersion": 2}`) already exists and names the target version, skip this workspace entirely —
   idempotent by construction, not by re-checking each directory.
2. For each digest directory currently under `<workspaceRoot>/packages/sha256/<digest>/`: read its
   `plugin.json` to get `pluginId` (same `parseAgentPluginManifest` the install path already trusts).
   A digest directory whose manifest fails to parse is left in place and logged, not deleted — see
   Rollback/failure below.
3. `mkdir -p <workspaceRoot>/<pluginId>/package/sha256/` (mode `0o700`, matching `install.ts`'s own
   directory-creation mode).
4. Move (rename, same filesystem — this is always a same-volume move since both paths are under the
   same `<workspaceRoot>`) the digest directory from `packages/sha256/<digest>/` to
   `<pluginId>/package/sha256/<digest>/`. `rename` is the same atomic single-directory-entry operation
   `install.ts`'s own `publish()` already relies on for the identical reason: a crash mid-move leaves
   the digest directory fully at the OLD path or fully at the NEW path, never half-written at either.
   If an old-shape `memory/<pluginId>/` directory exists at the workspace level for this same plugin
   id (Layout-A leftover — not the case on this machine today), move it too, to
   `<workspaceRoot>/<pluginId>/memory/`, in the same per-plugin step.
5. Once every digest directory for this workspace has been moved (step 2-4 looped to completion) and
   `packages/sha256/` is empty, remove the now-empty `packages/sha256/` and `packages/` directories,
   then write the marker file from step 1 LAST, after every move in this workspace succeeded — the
   marker's presence is the single fact "is this workspace migrated" ever asks, so it must only be
   written once nothing that would make it a lie remains possible.

**Crash safety.** Steps 2-4 are per-digest and idempotent: a digest directory already living at its
NEW path is skipped (same check as `install.ts`'s own `isRealDirectory`); one still at its OLD path is
moved. A process that dies mid-migration leaves some digests moved and some not, and zero data loss
either way — re-running the script from the top finishes the rest, because every step is a check before
an action, never an unconditional action. The marker file is written only after step 5's cleanup, so a
crash before that point simply causes a full idempotent re-scan on the next run, not a partial "trust
the marker" state.

**Which process runs it, and when.** The web server, not the agent daemon — the daemon "reads plugins
once at start" (see [[daemon_reads_plugins_once_at_start]]) and has no boot-time idempotent-setup
convention today; the web server already has one (`seed-bundled.ts` runs this way on every boot). Wire
this migration into the same boot sequence, before `seed-bundled.ts` runs (seeding must see the NEW
shape, not migrate a bundled plugin it just placed). The daemon needs no migration awareness at all: by
the time it next reads plugins (its own boot, which may be the same process restart or a separate one),
the web server has already finished, and the daemon only ever reads through `layout.ts`'s
`forWorkspace()`, so it sees whichever shape is on disk with no special-casing.

**Locking against concurrent runs.** The marker-file check in step 1 is not itself a lock — two web
server processes booting simultaneously (a real possibility: this repo already runs the app and the
agent daemon as separate OS processes, `agent-daemon-server.ts:298-299`) could both pass the "marker
absent" check before either writes it. Take an exclusive lock via `open(markerPath, 'wx')` (fails if
the file already exists) written FIRST as an in-progress marker (`{"status": "migrating", "pid":
..., "startedAt": ...}`), replaced by the real completed marker only at the end; a second process
racing to acquire it gets `EEXIST` and waits/retries rather than migrating concurrently. This mirrors
`activation.ts`'s own stated posture on write races ("acceptable and stated rather than papered over")
for a migration that, unlike activation toggles, must never run twice concurrently on the same digest
directory (`rename` of an already-moved directory is not a no-op — it throws `ENOENT` on the missing
source — so a genuine double-run needs the lock, not just tolerance).

**Rollback/failure behavior.** There is no automatic rollback. A digest directory whose `plugin.json`
fails to parse (corrupt, or belonging to a manifest format this migration's parser rejects) is left
exactly where it is, at its OLD path, and logged with its digest — NOT deleted, NOT guessed at. Because
step 1's marker is only written after a full successful pass, a workspace with one unparseable digest
directory never gets marked migrated, and the migration safely re-attempts it (skipping the
already-moved digests) on every subsequent boot until a human resolves the bad directory by hand. This
is the same fail-safe posture `install.ts` and `activation.ts` already take elsewhere in this feature:
prefer a stuck, visible, retriable state over a silent one.

## RED acceptance tests

All of these must fail against today's code and pass once this spec is built:

1. Installing a plugin places its digest directory at `<workspaceRoot>/<pluginId>/package/sha256/<digest>/`, not `<workspaceRoot>/packages/sha256/<digest>/`.
2. Installing byte-identical content a second time still short-circuits to the SAME `finalRoot` without a second `freezeTree` call, and the returned `InstalledAgentPlugin` is identical to the first install's — proving the dedup guarantee survived the reordering described in "Install-time impact."
3. `listInstalledPlugins` given a workspace root with two different plugin ids installed returns both, each with its own `pluginId` and `packageRoot` correctly nested under its own folder.
4. A plugin's read tool for `learned/` and write tool for `learned/` round-trip a UTF-8 file; the write tool refuses a path that would escape `<pluginId>/memory/learned/` (symlink or `..`), asserted via the SAME `assertContainedOnDisk` test fixtures `package-paths.test.ts` already has, applied to a memory root.
5. A plugin's write tool for `learned/` cannot write into `notes/`, and cannot write into another plugin's `memory/` at all, even given that other plugin's exact id as an argument.
6. `notes/` written via the admin editor (or the assistant's explicit-request tool) survives a subsequent plugin update (a new digest installed under the same `pluginId`) byte-for-byte.
7. `learned/` is unaffected by (kept as-is across) a plugin update — updating does not clear or reset it.
8. Uninstalling a plugin without opting into "also delete memory" leaves `<pluginId>/memory/` on disk with its prior contents, and removes `<pluginId>/package/` entirely.
9. Uninstalling a plugin WITH "also delete memory" explicitly confirmed removes `<pluginId>/` entirely.
10. Reinstalling a previously-uninstalled plugin (memory kept) sees its OLD `learned/`/`notes/` content immediately, with no re-seeding step.
11. `notes/` content is present in the plugin's skill context on activation without an explicit read-tool call; `learned/` is not present unless the skill's own logic calls the read tool.
12. The migration script run twice in a row (idempotent) produces the identical on-disk tree both times, and the second run performs zero `rename` calls (verifiable via a spy/count).
13. The migration script killed mid-run (simulated: SIGKILL after moving some but not all digests) and re-run to completion produces the same final tree as an uninterrupted run, with no duplicated or missing digest directories.
14. Two concurrent migration attempts on the same workspace (simulated) result in exactly one completing the moves; the other observes the lock and performs zero moves.
15. A digest directory with an unparseable `plugin.json` is left at its old path after migration, the workspace's marker file is NOT written, and every OTHER digest in that same workspace still gets moved.

The following extend the list for the "Tovu extension namespace" proposal above, and apply only once/if that section is confirmed:

16. A `plugin.json` with a spec-legitimate `extensions` field parses with zero "unrecognized field" warnings, and `extensions["dev.tovu.memory"]`'s value is present on the parsed manifest result.
17. A plugin declaring `extensions["dev.tovu.memory"].learnedSizeCapBytes` larger than Tovu's global default is capped at the global default, not the declared value — `min(declared, global)`, asserted both directions (declared smaller wins; declared larger is clamped).
18. A plugin shipping `dev.tovu.memory/learned-seed/*` has that content present in `learned/` immediately after first install, and unchanged (not re-copied, not merged) after a subsequent update installs a new digest.
19. A plugin shipping ANYTHING under a `notes-seed/`-shaped path inside `dev.tovu.memory/` — install either refuses it outright or silently ignores it (implementation's choice, but one of the two, decided before this ships) and in neither case does any content appear in `notes/` as a result. `notes/` remains empty (or whatever the user separately wrote) after install.
20. A plugin's `extensions["dev.tovu.memory"]` block cannot cause a tool grant, an MCP allowlist entry, or any permission change — asserted by installing a plugin whose extension block contains extraneous fields shaped like a tool/permission grant and confirming they have zero effect on the workspace's tool registrations.
21. A client (real or simulated) that does not implement `dev.tovu.memory` ignores both the manifest field and the directory without error, per §8.1/§11.3 — Tovu's own parser is exactly such a client for every OTHER vendor's reverse-domain namespace, so this is also a test that Tovu ignores a `com.other-vendor.thing` extension it doesn't implement.

## Ordering constraint

This must land BEFORE manual plugin install for testing, and BEFORE the Marketplace ships. Both of
those add more ways for a `packages/sha256/<digest>/` (or, post-migration, a
`<pluginId>/package/sha256/<digest>/`) directory to come into existence; landing the layout change
first means neither of those features has to be built twice.

## Impact summary (from the accompanying inventory)

Full detail in `ADS-memory/.local-artifacts/agent-reports/2026-09-14-e6-s6-plugin-layout-spec.md`.
In short: every production call site already reaches the filesystem through `layout.ts` — there are
zero hardcoded bypasses to hunt down — so most of the ~20 production files this touches are one-line
argument changes. Two files are NOT mechanical and carry the real risk: `install.ts` (the
pre-extraction dedup short-circuit must be reordered, see "Install-time impact" above) and
`resolve-agent-plugin-refs.ts`'s `listInstalledPlugins` (its scanning logic gains a directory level).
Roughly 10-14 test files are touched or added, concentrated in `features/agent-plugins/__tests__/`.
Admin, desktop, and the Jini repo need no path-shape changes at all — admin talks to the API only,
desktop only names the directory in comments, and Jini's `agent-plugins` package is manifest types,
not layout. **If the proposed "Tovu extension namespace" section above is confirmed**, add: `install.ts`
needs zero changes for the extension DIRECTORY (it already extracts arbitrary top-level entries with no
allowlist); `manifest.ts` needs `"extensions"` added to `KNOWN_MANIFEST_KEYS`, a new field on
`AgentPluginManifest`, and one new Tovu-owned validator for the `dev.tovu.memory` sub-shape — additive,
not a Layout B change.

## Decisions (owner, 2026-09-14)

1. **Name:** the folder is `memory/`, holding both the plugin's learned knowledge and the user's
   project knowledge, in `learned/` and `notes/` subfolders.
2. **Tovu-only extension.** The public Agent Plugins standard is not ours to change. Plugins written to
   that standard keep working unchanged; Tovu adds `memory/` alongside them.
3. **Survives updates and reinstalls** (keyed by plugin id, not package digest).
4. **Loading:** `notes/` loads automatically when the plugin is used; `learned/` is read on demand.
   (Coordinator default, accepted by the owner.)
5. **Layout B — self-contained per-plugin folder** (owner, via peer tovu-e3, 2026-09-14): each plugin
   gets ONE top-level folder (`<pluginId>/`) containing both `package/` and `memory/`, rather than two
   parallel top-level buckets (`packages/` grouped by digest, `memory/` grouped separately) — see
   "Alternatives considered and rejected," Alternative A.
6. **Uninstall keeps memory by default**, with an explicit opt-in "also delete this plugin's memory"
   in the confirmation dialog — closes the first draft's open question 1.

## Open questions

1. Size caps for `learned/` and `notes/` — pick numbers against real skill context budgets.
2. Whether `data/<pluginId>` (`PLUGIN_DATA`) should be relocated to `<pluginId>/data/` for symmetry
   whenever the stdio-process-spawning feature that would actually use it gets built — not this spec's
   decision (see Alternative C), flagged here so it is not forgotten.
3. [NEEDS CLARIFICATION, owner]: confirm the "Tovu extension namespace" section (proposed, not yet
   decided) — specifically the exact literal namespace string (`dev.tovu.memory` recommended, verified
   against `tovu.dev`; flagging that it does not match the earlier, never-shipped, rejected
   `org.tovu.commands` precedent from the 2026-08-12 debate) and whether `learned-seed/` shipping is
   wanted at all for the first slice, or is safe to defer past `higgsfield-media`.

## First slice

Do not build the general facility first. Build it for `higgsfield-media`: let the skill record this
account's model verdicts and the authenticated tool list in `learned/`, have the skill read them
instead of its hardcoded table, and let the user add one note that the skill then applies. If that
removes real guessing, generalize. If it does not, the general facility would not have helped either.

## Related

- Agent Plugins page (owner decision 2026-09-14): one list; every plugin has an On/Off switch; any
  plugin the user added (manual test install, install from a link, future Marketplace) also gets
  Uninstall behind a confirmation; plugins built into Tovu are labelled "Built in" and can only be
  switched off; the separate "Downloaded" tab is removed.
- Manual plugin install for testing (owner ask 2026-09-14, later): a developer can attach a plugin they
  wrote or vibe-coded by hand, test it, and uninstall it.
