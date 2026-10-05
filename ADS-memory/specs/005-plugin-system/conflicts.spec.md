# Spec Note: Plugin Name Conflicts (SPEC-005 addendum)

- Spec ID: `SPEC-005` (addendum, not a version bump of the package)
- Status: shipped behavior, written from the code on 2026-10-04
- Code: `apps/website/src/features/plugin-runtime/claim-conflicts.ts` (detector),
  `plugin-claims.ts` (Tovu rules), `manifest.ts` (`contributes`),
  `server/runtime/composition/plugin-runtime.ts` (enable gate, boot pass, listing),
  `server/runtime/composition/core-extension-claims.ts` (core reservations),
  `apps/admin/src/features/plugins/rules.ts` (admin row copy)
- Commits: 36b97dfdb, c03a32313 (backend); d1af04b33, 00f4c5008 (admin UI)

## Purpose
Two enabled plugins, or a plugin and core, can name the same thing: a route, an agent tool, a
table, a setting, a widget, a permission, or an exclusive hook. Before this, the later one silently
overwrote the earlier one. Now the newer plugin is refused at enable time, and turned off at boot,
with the clash named. The plugin that was already working keeps working.

## 1) What a plugin claims
A claim is `{ kind, key, mode }`; `mode` is `exclusive` or `shared`.

| Source | Kind | Mode |
|---|---|---|
| `contributes.routes` | `route` | exclusive |
| `contributes.tools` | `tool` | exclusive |
| `contributes.tables` | `table` | exclusive |
| `contributes.settings` | `setting` | exclusive |
| `contributes.widgets` | `widget` | exclusive |
| `contributes.permissions` (ids the plugin DEFINES, not ones it requires) | `permission` | exclusive |
| every entry in `hooks` | `hook` | per `PLUGIN_HOOK_SEMANTICS`; unknown hook = exclusive |
| generated capability tool `plugin_capability_<id>` (only when `fields` is non-empty) | `tool` | exclusive |

- `content.entry.beforeSave` is `shared`: every enabled filter runs in TB-01 order and writes only
  its own `ext.{id}` namespace, so several plugins on it is the design.
- A hook missing from `PLUGIN_HOOK_SEMANTICS` is exclusive, so an unclassified new hook point fails
  safe (refuses the second plugin) instead of stacking silently.
- Field paths are not claims. `validateManifest` already forces them under `ext.{id}.`, and plugin
  ids are unique.
- `contributes` binds even for surfaces the runtime does not mount yet (settings, widgets, routes),
  so a plugin cannot squat a name a future mount would have to arbitrate.

## 2) `contributes` validation (`manifest.ts`, code `CONTRIBUTES_INVALID`)
- Optional. `null`/absent means no declared claims (hooks and the generated tool still apply).
- Must be an object; keys limited to `routes, tools, tables, settings, widgets, permissions`;
  each value a list of non-empty strings.
- No `*` patterns in any entry. Reserving a namespace is core's privilege. (A route's leading `* `
  is its method, "every method", and is allowed.)
- `routes`: `/path` or `METHOD /path`, METHOD in GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS,
  ANY, `*`.
- `tools`: may not start with `plugin_capability_` or `agent_plugin_` (generated-tool prefixes).
- `tables`: must start with `p_<id with - as _>__` and have a name after it (ADR-023 §5).

## 3) Detector rules (`resolveClaimConflicts`, product-neutral)
1. Owners are processed in precedence order; the first to claim a slot keeps it.
2. An exclusive claim conflicts with any other owner's claim on the same slot, shared or not. Two
   shared claims never conflict.
3. Refusal is all-or-nothing per owner. A refused owner holds nothing, so a third owner may take a
   refused owner's other names.
4. One owner claiming the same slot twice is not a conflict.
5. Keys are normalized per kind before comparing:
   - identifiers (tool, table, setting, widget, permission, hook, and any kind without a rule):
     trimmed, lower-cased;
   - routes: `METHOD /path`, path lower-cased, slashes collapsed, trailing slash dropped, parameter
     segments (`:id`, `{id}`, `[id]`) erased, so `/a/:id` equals `/a/{slug}`. No method, `*` or
     `ANY` means one slot per HTTP method.
6. A key ending in `*` is a prefix claim. An exact claim inside a held prefix conflicts; so does a
   prefix covering a held key, or overlapping a held prefix.

Each conflict reports `{ ownerId, kind, key, heldBy, heldKey }`; `heldKey` is the holder's own
spelling (e.g. `/api/*` when a prefix matched). Pure; O(S²) in total slots.

## 4) Who wins (`plugin-claims.ts`)
- Core first, always (owner id `core`, shown as "Tovu core").
- Then enabled plugins, earliest-enabled first: activation `updatedAt` ascending, then built-in
  before site, then id, only to break exact ties.
- At enable time the plugin being turned on is always last, even if a coarse clock gives it the
  same `updatedAt` as an earlier plugin.

## 5) Core reservations (`core-extension-claims.ts`)
Namespaces, not inventories:
- routes: `/api/*`, `/admin/*`, `/workspaces/*`, `/healthz`, `/readyz`, `/health`;
- permissions: `<ns>.*` for every core permission namespace in use (admin, content, media,
  settings, … — the list in the file);
- tools: `plugins_*` (the plugin-management tools);
- tables: `p_store__*`, `p_lipay__*` (first-party data modules, derived from their manifests);
- settings, widgets: none yet.

Both composition roots (`app.ts`, `deps.ts`) pass these as `coreClaims`. Without `coreClaims`,
plugin-vs-plugin conflicts are still detected.

## 6) Where it runs
| Path | Behavior |
|---|---|
| Enable: admin `PLUGIN_SET_ENABLED`, agent `plugins_set_enabled`, activation poll | `onPluginEnabled` throws `PluginConflictError` BEFORE any plugin code is imported. `setPluginEnabled` restores the prior activation row, so a refused enable leaves the plugin off. |
| Admin HTTP | 409 `{ error, code: "PLUGIN_CONFLICT", details: { pluginId, conflicts[] } }` |
| Agent tools | Model-facing error `PLUGINS_CONFLICT` with the message verbatim, guidance: tell the user which plugin holds the name; disabling it is their call. |
| Daemon activation poll | A conflicting plugin's `onPluginEnabled` failure is logged and skipped, like any per-plugin failure. |
| Boot (`attachEnabledPluginsAtBoot`) | One pass over all enabled plugins. Every loser is QUARANTINED via `quarantine.ts` (`enabled: false`, `consecutiveFailures: 0`, reason "Turned off at startup because it claims things already in use: …"), logged, and not attached. If the pass itself fails, no plugin is attached that boot (fail closed). |
| List: `PLUGINS_LIST`, `plugins_list` | Each row has `conflicts[]` (always present, empty when clear): for an enabled plugin, why it loses; for a valid plugin that is off, what turning it on would hit right now. |

Per-row conflict shape: `{ kind, key, heldBy, heldByName, heldKey }`.

## 7) Messages
- Enable refusal: `Plugin '<id>' was not turned on because it claims things already in use:
  <list>. Turn off the other plugin first, or keep '<id>' off.`
- List item: `<kind> '<key>' is provided by plugin '<heldBy>' (<heldByName>)`, or
  `<kind> '<key>' is reserved by Tovu core` plus ` ('<heldKey>')` when it differs from the key.
- Messages contain only plugin ids/names and names from the manifest, so they are safe to show an
  agent verbatim.

## 8) Admin Plugins screen
- The row's expanded detail lists each conflict under "Names already in use — turn the other plugin
  off first:", one translated line each: `Tool "x" is already used by <name>.`,
  `Route "x" is reserved by Tovu.`, or `… reserved by Tovu ("/api/*").` Duplicate lines are dropped;
  an unknown `kind` is shown verbatim.
- A quarantine with `consecutiveFailures: 0` (the boot conflict pass) reads "Turned off
  automatically"; a hook-failure quarantine still reads "Quarantined after N consecutive failures".
  The server's reason is shown below the headline, untranslated.
- A 409 `PLUGIN_CONFLICT` on Enable shows: "This plugin uses names that core or another plugin
  already has. Open its details to see which, and turn the other plugin off first."
- All strings are in the 18 plugins locales (`plugins-i18n.ts`).

## 9) Not done / open
- Install does not check conflicts and the install preview does not show them; enable is the gate.
- `mergeGlueToolRegistrations` (site glue) keeps its own duplicate-tool-id logic; it is not wired in
  production and could be absorbed into the detector.
- `claim-conflicts.ts` is a Jini candidate (`@jini-ai/plugins`); not moved until Jini can be
  published.
