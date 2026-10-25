# Build brief: Agent Plugin lifecycle (update, compat, deps) + Marketplace

Code: `jini-int/packages/agent-plugins` (Jini) and `tovu-int/apps/{website,admin}` (Tovu).
Scope is **Agent Plugins** (`plugin.json`) only. Site plugins (`jini.plugin.json`, Plugins screen) are OUT:
"Do not try to merge `plugins` and `agent-plugins`" (`jini-int/packages/agent-plugins/README.md:3`).

## Goal (owner terms)
Owners can find a plugin in a Marketplace, install it, see an update when one exists and update it without
losing its memory, and get told plainly when a plugin will not work on this Tovu version or needs another
plugin. Turning plugins on and off, and their settings screens, already work.

## Owner rules (every lot)
- Generic lifecycle and catalog logic goes in Jini. Tovu wiring, routes and screens go in Tovu.
- Plugins never import each other. Dependencies are runtime capability checks ("is something providing X on?"), never imports, and they degrade gracefully.
- Catalog sources are adapters behind one generic port, with no vendor named in core.
- Functions take `(requiredObj, optionalObj = {})` with ports. React components get props only. Complexity ≤10.
- 100% line/branch/function coverage per touched file, using DI fakes. No schema change (settings ledger + files only).
- Make the smallest change, preserve "why" comments, and add no new deps without saying why.
- Vitest runs with `--maxWorkers=2`. Leave no test processes running.
- Per the 10-09 owner decision, no permanent deletes from chat. Uninstall is not added to chat here.

## What is DONE (reuse)
| Piece | Where |
|---|---|
| Install from zip / folder / bundled, preview + trust warning, installs OFF | `tovu-int/apps/website/src/features/agent-plugins/install-tool.ts:28-50`; route `server/inbound/admin-http/routes/agent-plugins/install.ts:65`; admin `features/plugins/AddAgentPluginPanel.tsx` |
| Same-id **replace** of a *disabled operator-installed* plugin, memory kept (today's only "update") | `install-tool.ts:34,77`; Jini `lifecycle/install.ts` |
| Activate/deactivate with a confirm dialog | route `routes/agent-plugins/set-enabled.ts:233` (PATCH); Jini `lifecycle/activation.ts`, `set-enabled.ts`; admin `AgentPluginDisableConfirmDialog.tsx` |
| Settings UI = plugin-owned sandboxed admin surfaces | Jini `src/admin-surfaces/*` (README §Admin surfaces); Tovu `features/agent-plugins/admin-surfaces/*`, admin `AgentPluginSurfaceFrame.tsx`, route `admin-surfaces.ts:97-113` |
| Uninstall (tool + confirm card) | `features/agent-plugins/uninstall-tool.ts`, `uninstall-confirmation-ui.ts`; Jini `lifecycle/uninstall.ts` |
| Download with a pinned sha256 + outbound guard | Jini `lifecycle/fetch-archive.ts`, `install-from-url.ts`. **No production caller** (`apps/admin/src/features/plugins/rules.ts:505-517`) |
| `provides: string[]` capability ids (e.g. `deploy-ops:fly`) | Jini `lifecycle/manifest.ts:131`; manifests `content/agent-plugins/*/plugin.json` under `extensions.tovu` |
| Local search ranking | Jini `lifecycle/search.ts` |

## What is MISSING
1. Updating an **enabled** plugin. "Update available" detection and version compare are missing; today's replace refuses enabled and bundled packages.
2. **Compat**: there is no host-version range. **Deps**: there is no `requires` (the counterpart of `provides`).
3. A **catalog source** and Marketplace listing/install. The tab is a designed empty state (`AgentPlugins.tsx:278-310`, `MARKETPLACE_TAB_SOON = true` in `add-plugin-tab-soon.ts`).
4. `origin` (bundled/operator/marketplace) is not sent on the wire, so the disable dialog copy is hard-wired to "ships with Tovu" (`rules.ts:505-517`).
5. A digest pin for operator-installed ids with two installed digests. Today this is refused as ambiguous (`lifecycle/resolve-agent-plugin-refs.ts:10-20`). Update must leave exactly one current digest.

## Scope
IN: items 1–4 and the "one current digest" rule from item 5.
OUT: site-plugin marketplace; running third-party code. Executable contributions and surface handlers stay **bundled-digest-only** (`deployments/deploy-targets/registry.ts` trust rule; `admin-surfaces/surfaces.ts:20`), so a marketplace plugin gets skills + MCP preview only. Also OUT: ratings/reviews, payments, publishing/submission.

## Lots
**J1: Jini: compat + requires (S).** `lifecycle/manifest.ts` reads `extensions.<ns>.requires: string[]` and `extensions.<ns>.hostRange` (semver range). A new pure `lifecycle/compatibility.ts` provides `checkAgentPluginCompatibility({ manifest, hostVersion, activeProvides }, {})` → `{ hostOk, missingRequires[] }`. It needs a semver range check: `semver` is already a dep of `@jini-ai/plugins`, so the brief must say why it is added to agent-plugins. A ~30-line caret/tilde/`>=` subset is the alternative; pick one and justify it. Tests cover all range forms and malformed values (reported as a warning, never a crash).

**J2: Jini: catalog contract + JSON-index adapter (M).** `lifecycle/catalog.ts` defines the port `AgentPluginCatalogSource { list({}, { signal }) }` → entries `{ id, name, version, description, keywords, provides, requires, hostRange, archiveUrl, sha256, homepage }`. It also has the strict validator `parseAgentPluginCatalogIndex({ value })` (schemaVersion 1, bounded counts and lengths, https only, 64-hex sha256) and the adapter `createJsonIndexCatalogSource({ url, fetch, outboundGuard }, { maxBytes })`. Export it from `./lifecycle`. Tests run with a fake fetch: valid, oversized, bad sha, redirect to a blocked host, abort.

**J3: Jini: update planning (S).** A pure `planAgentPluginUpdate({ installed, candidate }, {})` returns `none | update | downgrade-refused | id-mismatch`, plus whether the plugin is enabled. Extend the install replace path so an **enabled operator-installed** plugin updates in this order: install the new digest disabled, switch the current-digest pin, keep the old digest until the new one activates, then remove it. If activation fails, restore the old one. The lot starts by reading `lifecycle/install.ts` replace + `uninstall.ts`, and keeps the change inside them. Bundled plugins stay seed-managed.

**T1: Tovu: wire compat + origin (S).** `routes/agent-plugins/list.ts` adds `origin`, `hostOk`, `missingRequires` and `updateAvailable` to each row. `set-enabled.ts` refuses enable when `!hostOk` with the named code `PLUGIN_HOST_INCOMPATIBLE`; missing requires returns a warning, not a refusal. The `plugins_set_enabled` tool mirrors this. Admin `AgentPluginRow.tsx` shows a "Needs …" / "Not for this Tovu version" line. `rules.ts` disable copy becomes conditional on `origin`, and the comment's own TODO is closed.

**T2: Tovu: Marketplace backend (M).** Catalog URLs live in a ledger setting (`core.agent-plugins.catalogSources`, workspace scope, default `[]`). `GET .../agent-plugins/marketplace` merges the catalog entries with installed state (installed / update / incompatible). `POST .../agent-plugins/marketplace/install {entryId}` calls `fetchAgentPluginArchive` with the entry's sha256, then the existing `installAgentPlugin`. It installs OFF and returns the same preview + trust warning as zip installs. Agent tools: `agent_plugins_marketplace_search` (read-only) and a new `agent_plugins_install` source kind `catalog` (no new install tool). Tests: route + tool integration with a fake catalog source.

**T3: Tovu admin: Marketplace tab + Update button (M).** Replace `MarketplacePanel` (`AgentPlugins.tsx:286`) with a list: search box, rows with Install / Installed / Update / Incompatible, and the trust warning reused from `AddAgentPluginPanel`. With no catalog configured, show the current empty state plus "Add a catalog URL". The Installed tab row gets "Update to vX" when `updateAvailable`. Flip `MARKETPLACE_TAB_SOON` to false in this lot only. i18n goes into `plugins-i18n.ts` for all locales it carries.

## Acceptance tests
- A manifest with `hostRange: ">=99"` lists as incompatible and enable returns `PLUGIN_HOST_INCOMPATIBLE`. With `requires: ["x:y"]` and nothing providing it, the plugin enables with a warning.
- A fake catalog with 3 entries lists 3 rows. Install of the bad-sha entry is refused with nothing written. A good entry installs OFF.
- Updating an enabled operator plugin from v1 to v2 leaves it enabled at v2 with memory intact and one digest on disk. A forced activation failure leaves v1 enabled.
- Bundled rows never show Update or Uninstall.

## Needs a local Chrome look afterwards
Yes: the Marketplace tab (empty state, list, mobile), Update button and incompatible line on rows, and the dark theme.

## Risks
- Supply chain: the catalog is trust-on-index. The sha256 pin comes from the index, so a compromised index means compromised bytes. Mitigation: it is still OFF on install, gets the preview, and runs no code. Say so in the UI copy.
- J3 touches install transactions (atomic renames, read-only dirs). It is the riskiest lot, so cover it with crash-point fakes.
- The live tree has many seeded-enabled bundled plugins (`bundled-catalog.ts`). None may change state from this work.

## Open questions (owner)
1. Who hosts the first catalog index (a Tovu GitHub repo JSON?), and is it on by default?
2. Should missing `requires` block enabling, or only warn (recommended: warn, per "degrade gracefully")?

## GAP-CHECK OVERRIDES (2026-10-21 16:15Z — Opus, Sonnet, Codex agree; raw: ADS-memory/.local-artifacts/swarm-consensus/runs/plugins-gaps-2026-10-21/). These WIN over the sections above.
Scope for this build = Phase A only: J1, J3, T1 (+ an explicit update route/tool/button for an operator-supplied zip/folder candidate). J2/T2/T3 Marketplace = OUT (owner).
1. **J3 is L, not S.** Today a publish deletes the old revision immediately (`lifecycle/install.ts:209-238,333-336`; no rollback slot). Never have two LIVE digests: MCP federation takes the first match (`tovu-int .../agent-plugins/federate-mcp.ts:308`) and refs resolution refuses ambiguity (`resolve-agent-plugin-refs.ts:10-40,258`). Move the old package into a frozen rollback area outside `packages/sha256/` (reuse `stageForRemoval`), publish new, re-activate, then delete the rollback copy — all inside the existing file lock (`persistent-state.ts:14-24`), serialized against enable/disable/uninstall, with an expected-old-digest check.
2. **Crash safety:** a small per-plugin update journal (pending → published → committed); boot reconciliation restores the rollback copy if pending. Extend `lifecycle-reconciliation.unit.test.ts`; crash-point fakes at publish, switch, activation, rollback, cleanup.
3. **MCP:** call `provisionAgentPluginMcp` + `notifyRosterChanged` after the switch (config is read from the old packageRoot today, `federate-mcp.ts:310`). In-flight MCP calls may fail (acceptable, documented). Running chats keep the skill text captured at run start (documented). Don't delete the rollback copy while a run still uses it — defer to idle/next boot.
4. **Drop `updateAvailable`** in Phase A (no source without a catalog). "Update" = operator uploads a newer zip/folder; preview already shows `upgradeFrom` (`install-upload.ts:245`). Manifest `version` orders releases (real semver), digest identifies bytes; no/invalid version = update only by explicit replace; equal version + different digest = explicit replace with warning.
5. **Downgrades refused** (like site plugins, `plugins/src/host/node/install.ts:308`) except the automatic rollback restore.
6. **hostRange** is checked against a declared agent-plugin CONTRACT version (not Tovu's app version — desktop and server differ). Copy the site-plugin precedent `sdkRange` + `semver.satisfies` (`plugins/src/host/node/loader.ts:214`); add `semver` as a dependency (reason: same library as site plugins). Malformed hostRange = explicit invalid/incompatible, never silently allowed.
7. **requires:** computed live at list time and on every enable; warn when disabling a plugin others need, and when a v2 drops a capability others require. Exclude disabled providers and self-satisfaction. Warn only, never block (owner).
8. **Audit:** record actor, plugin id, old/new version + digest, result (activation today only stores latest actor/time, `activation.ts:68`; mirror `set-enabled.ts:47`).
9. **Plugin data:** v1 rule = plugin-owned state/memory dirs carry over unchanged; plugins must read old shapes; operator archives never run migrations; rollback does NOT revert state written by v2 (say so in UI copy); snapshot the plugin's settings slice before the switch. Migration runner for trusted bundled code = later.
10. Caches: invalidate skill prompt indexes + `search.ts` ranking on switch (test it).
11. Bundled plugins stay seed-managed; none may change state from this work.
