# Agent Plugin URL install: wired, proven on real content, two blockers named

Date: 2026-08-21
Branch `general-work` · commits `cbde23c1`, `c92ed8a8`
Author: Coordinator (Claude Opus 5) + one Sonnet Programmer subagent (`plugin-installer`)
Owner decision requested: see §4. Nothing in §3 is built.

## 0. Owner's ask

> "Wire the installer, then just give it an address, and then add the installer, download the
> plugin into the appropriate folder locally on Tovu, and then we can use it."

Plus: "how is the type-ahead in the chat composer populating now? Is it going to Jini's repo?
It should only be local."

## 1. The type-ahead question — answered, premise was wrong

**The composer `/` type-ahead never touched Jini.** It is built from a hardcoded 5-item array,
`apps/admin/src/features/plugins/composer-capabilities.ts:184-273`, fed in at
`apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:600`. No file reads, no
network, no Jini import. Each row is a label plus an `insertText` string.

The Jini coupling is on a **different screen**: the admin Agent Plugins page, via
`agent-plugin-source-catalog.ts`'s 44 Vite `?raw` imports reaching
`../../../../../../Jini/packages/agent-plugins/ui-ux-design/...` — six levels up, out of the repo,
into a sibling checkout. That is what §3 is about.

## 2. What shipped (verified by the Coordinator, not taken on the subagent's word)

### `cbde23c1` — the download half + its tests
- `src/features/agent-plugins/fetch-archive.ts` (NEW). `fetchAgentPluginArchive` -> `{archive, sha256, resolvedUrl}`.
  Scheme allowlist (https/http only) re-checked on the **post-redirect final URL**; 32MB cap enforced
  on bytes **actually read**, not on `Content-Length`; empty-body rejection. Errors:
  `UNSUPPORTED_URL | REQUEST_FAILED | HTTP_ERROR | ARCHIVE_TOO_LARGE | EMPTY_BODY`.
- `src/features/agent-plugins/install-from-url.ts` (NEW). Composes fetch + the pre-existing
  `installAgentPlugin`. `integrity` is a tagged union on purpose —
  `{kind:"pinned", sha256}` vs `{kind:"trust-on-first-use"}` — so a call site can never silently
  hash its own download and pass that off as verification.
- `install.ts` gained one accessor, `maxAgentPluginInstallArchiveBytes()`, no behavior change, so a
  test can pin the two size caps together without the modules importing each other.
- 15 new tests over a real `node:http` loopback server. Injected `fetchImpl` used for exactly 2 cases
  a real server cannot express (a `Content-Length` that under-declares; a redirect to a disallowed
  scheme) — disclosed, not hidden.

**Coordinator re-ran:** `node --import tsx --test "src/features/agent-plugins/__tests__/**/*.test.ts"`
-> **93 pass / 0 fail**, 55s. `npx tsc -p tsconfig.json --noEmit` -> **exit 0**.

### `c92ed8a8` — the CLIs
- `development/scripts/package-agent-plugin.ts` — zips a plugin dir rooted AT the plugin dir (so
  `plugin.json` lands at the archive root, which `indexInstalledRoot` requires), prints SHA-256.
  Dev-only, uses the `yazl` devDependency, never imported by production code.
- `development/scripts/install-agent-plugin.ts` — the CLI. Requires `--workspace <id>` and an
  explicit integrity choice (`--sha256 <hex>` or `--trust-first-use`); refuses with neither and names
  the missing flag. `--print-digest` downloads and prints without installing.
- npm scripts `agent-plugin:package` / `agent-plugin:install`.

**Coordinator independently re-packaged the real plugin from scratch and got a byte-identical
result:** 46 files, 76,513 bytes, `sha256 f64f7a62e483a965d8c697d4403ff6e8a3ce5243ae3094a045f96f74d7b4a14d`.
Packaging is deterministic.

Subagent's own end-to-end run (real loopback server, real zip, real yauzl reader): pinned install
succeeded, all 46 files landed under `ws/<uuid>/packages/sha256/<digest>/`, `plugin.json` matched
Jini's source byte for byte, tree frozen `dr-xr-xr-x` / `-r--r--r--`, 7 skills indexed. Wrong-digest
run failed with `DIGEST_MISMATCH` and published nothing.

**Caveat, disclosed:** that run used `TOVU_AGENT_PLUGINS_DIR` pointed at a scratch dir, not this
repo's `infra/`. It could not use the repo's own tree — see blocker B below.

## 3. What replacing the 44 `?raw` Jini imports needs (REPORT ONLY — nothing built)

Consumer chain today: `AgentPluginDetailsModal.tsx` -> `use-agent-plugin-details-modal.hooks.ts` ->
`getBundledAgentPluginSourceFiles` / `findBundledAgentPluginSourceFile`. Synchronous, pure,
compile-time-closed.

Work required:
1. New route dir `src/server/routes/admin/agent-plugins/` — **its own directory**, not
   `routes/admin/plugins/` (that is the unrelated `.tovu-plugin` runtime; `routes/admin/marketplace/`
   is a third, unrelated theme system). Needs `deps.ts` (+ a `getInstalledAgentPlugin` closure),
   `list-files.ts`, `get-file.ts`, and `src/server/modules/agent-plugins.ts` wired into `app.ts`,
   mirroring `modules/plugins.ts`.
2. `capability-projection.ts`'s `readInstalledSkillMarkdown` must be generalized — it already routes
   through `assertContainedOnDisk`, but the modal also needs `plugin.json` and 4 non-markdown files
   (3 `.tsx`, 1 `.sh`).
3. `apps/admin/src/lib/api.ts` gains two methods, mirroring `listPlugins` (~line 2729).
4. `use-agent-plugin-details-modal.hooks.ts` becomes **async** — a real behavior change needing
   loading/error state. Copy `plugins-dependencies.hooks.ts`'s existing `PluginsPort` /
   `defaultPluginsPort` / `createFakePluginsPort` shape; do not invent a new one.
5. A new permission string (e.g. `admin.agent-plugins.read`). Permissions here are plain strings, not
   a closed union — naming consistency, not a type change.

Smaller flags: this creates a new externally-reachable file-read HTTP surface where today there is a
compile-time allowlist (must stay behind `assertContainedOnDisk`); per-file network round trip
replaces a zero-latency in-bundle switch; and the modal needs an explicit "not installed" state,
because nothing auto-installs a plugin into a real workspace yet.

## 4. TWO BLOCKERS — both verified by the Coordinator against real state, both need an owner decision

### Blocker A — there is no record of which digest is "the" installed copy
Packages live at content-addressed `ws/<id>/packages/sha256/<digest>/`. **Nothing anywhere persists
"workspace X has ui-ux-design installed at digest Y."**

Coordinator verification: `grep -rn "agentPluginActivation\|agent_plugin" src/db/ src/server/` ->
**zero hits**. `grep -rn "resolveAgentPluginLayout\|installAgentPluginFromUrl" src/server/` ->
**zero hits** (no server-side wiring exists at all). The *other* plugin system does have one —
`pluginActivationRepo`, present in `src/server/app.ts`, `src/features/plugin-runtime/tool-registrations.ts`.

So `getInstalledAgentPlugin(pluginId)` in §3 cannot mean anything until an activation/index concept
exists. On a reinstall or upgrade there would be two digest dirs and no way to say which is current.
**This is the largest missing piece; everything in §3 assumes it.**

### Blocker B — the real workspace id is not UUID-shaped
`layout.ts:136`'s `forWorkspace()` throws unless `workspaceId` matches `UUID_PATTERN`.

Coordinator verification: `sqlite3 infra/content.db "select id from workspaces;"` -> **`workspace-local`**.
One row, not a UUID. So `installAgentPluginFromUrl` **cannot be called with this instance's real
workspace id today**. This blocks literally, not hypothetically — it is why the §2 proof ran in a
scratch dir.

Options put to the owner (**undecided as of this writing — do not pick for them**):
- **A — translate.** Map `workspace-local` -> a fixed UUID. Nothing else changes; costs a permanent
  lookup table that every future workspace needs an entry in.
- **B — retarget the check.** `layout.ts` already contains `SAFE_PLUGIN_ID_PATTERN`
  (`^[a-z0-9]+(?:[-.][a-z0-9]+)*$`) for exactly the same job — keeping a traversal segment out of a
  path. Point the workspace check at that instead. `workspace-local` passes it; `../` does not.
  **Coordinator's recommendation.** The UUID rule is not protecting anything the safe-name rule
  does not; it is simply validating against a format this product does not use, so it can only ever
  fail on real data.

## 5. Not done / deliberately out of scope
- The 44 `?raw` imports are **still there**. §3 is a plan, not a change.
- No real HTTPS registry address exists yet. `https://github.com/AINSEP/Jini` is public, so a GitHub
  Release asset is the natural first real URL — **not created; needs owner sign-off** since publishing
  is outward-facing.
- `apps/admin/src/features/plugins/{agent-plugin-catalog,agent-plugin-source-catalog}.ts` and their
  two tests remain dirty from another session and were never touched.
- The composer type-ahead was not changed. Per §1 it is already local; making it derive from an
  *installed* plugin depends on both blockers above.

## Handoff Contract
- **Inputs used:** direct reads of `install.ts`, `layout.ts`, `fetch-archive.ts`, `install-from-url.ts`,
  `composer-capabilities.ts`, `AssistantDock.hooks.tsx`; `git show --stat` on both commits; an
  independent re-packaging of the real plugin; a re-run of the 93-test scoped suite; a full
  `tsc --noEmit`; a direct `sqlite3` read of `infra/content.db`; three subagent milestone reports,
  each spot-checked rather than accepted.
- **Output summary:** the URL->verify->install path is built, tested, and proven on the real 46-file
  plugin. Going local-only in the admin is blocked on A and B in §4.
- **Risks:** blocker A is architectural and unscoped. The §2 end-to-end proof ran against a scratch
  directory, not `infra/`, because of blocker B.
- **Suggested next assignee:** owner decision on §4 blocker B, then a Software Architect pass on
  blocker A before any of §3 is built.
