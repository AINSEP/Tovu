# EXTRACT-S6 G-plug — coverage inventory (record unmoved behavior first)

Pins: Tovu `c3801c833a191be51753dcdecd133b0cad6f8945`, Jini `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`.
G-plug makes **no production change** in either repo. It adds NEW observers, NEW golden tests and NEW
fixtures only; no existing test or fixture is modified, deleted or renamed (allowance NONE).

T = `apps/website/src/`. J = Jini `packages/`. Line numbers are at the Tovu pin.

## New files

Inventory commit (first): Tovu `80a97e9e`. **Recording commit: Tovu `3f77009fa975a69b2313b90242fcef4bbd345d9d`**
(both fixtures written once at the pin and committed; their bytes and SHA-256 have not changed since).
Later commits `08ec5eb3` and `38cd30d1` touched only the observer module (serialize recorded call
arrays as plain JSON; typecheck/lint fixes) and the fixtures still match byte for byte. SHA-256 below
are of the files at `38cd30d1`.

| File | Role | SHA-256 |
|---|---|---|
| `T features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts` | observers for items 1, 2, 3, 5 | `6ac5318631ca54381e19ade89a2431c07e4af5756178f4a0e7e1afc19b2e801e` |
| `T features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-tier2-observe.ts` | real-worker observer for item 4 | `d8c7be9feba60bf5f18ca5609d23c7c2a2f11eb5e427eedb81fa32ac229dfb7d` |
| `T features/plugin-runtime/__tests__/unit/extract-s6-g-plug.golden.test.ts` | golden test, items 1/2/3/5 | `21826d40ffde71d3058d11dca9df2c66d0c0b8c311567accdba899a2e327db38` |
| `T features/plugin-runtime/__tests__/unit/extract-s6-g-plug.golden.json` | frozen fixture, items 1/2/3/5 | `6fd502d4676ca2eaa0c873ba55f2f3d5268db72e3b218d38290c088d060b347a` |
| `T features/plugin-runtime/__tests__/integration/extract-s6-g-plug.integration.test.ts` | golden test, item 4 (real workers) | `9981ebd8a84e398c455031ffb51ef895226b708d172e7aba7a0548bf0e3a9ba2` |
| `T features/plugin-runtime/__tests__/integration/extract-s6-g-plug.tier2.golden.json` | frozen fixture, item 4 | `a31f6574887d0db308446ba8d9fb793520d06a7608c5608f1221c619266a9768` |

Recording rule: each fixture is written ONCE by a scratch recorder outside the repo that runs the
same observers on the pinned tree and refuses to overwrite an existing file. Each golden test pins
its fixture's SHA-256, so a regenerated fixture fails even if behavior was changed to match it.
Normalization: only the card's random surface-exchange UUID (replaced by `"<surface-exchange-id>"`).
No timing value is recorded (executor durations are dropped; clocks are fixed).

## Coverage rows

Columns: covered behavior | pinned source file:line | covering test (new or existing, exact name) |
host vocabulary (every host string/schema/URL example/permission/id/path on that path; for L1b/L2).

### Item 1 — `plugins_*` tools (stay Tovu in S6)

| Behavior | Source | Test | Host vocabulary |
|---|---|---|---|
| `plugins_list`/`plugins_set_enabled`/`plugins_uninstall` catalog names, descriptions, schemas, side effects, permissions | `T features/plugin-runtime/agent-tools.ts:204-250` | NEW `G-plug 1: plugins_* catalog, descriptors, approval copy, results and refusals are unchanged` (`catalog`) | permissions `admin.plugins.read`, `admin.plugins.enable`; product name "Tovu" (×4 in descriptions: "BOTH of Tovu's plugin systems", "from inside Tovu", "BUNDLED with Tovu"); `.tovu-plugin`; tool ids `search_agent_plugin_local`, `content_read.plugin`, `plugin_source_seal`, `plugin_source_create/open → write/edit → seal`; URL path `/api/p/<plugin-id>`; tool id grammar `p_<normalized-plugin-id>__<name>`; SDK names `sdk.routes.add`, `sdk.tools.add`, `sdk.widgets.add`; capability names `http.route.register`, `tools.register`, `render.contribute`; manifest keys `contributes.routes/tools/widgets`; "ADR-023"; "Admin → Trash", "60 days" |
| `plugins_install` catalog + risk | `T features/plugin-runtime/install-tool.ts:51-80` | NEW G-plug 1 (`installCatalog`, `derivedRisk.install`) | tool id `plugins_install`; telemetry names `plugin_installed`, `operation_failed` (`install-tool.ts:148,151`, not exercised: tracker path, see gaps) |
| `plugin_source_*` catalog + risk | `T features/plugin-runtime/source-tools.ts:22-50` | NEW G-plug 1 (`sourceCatalog`, `derivedRisk.source`) | ids `plugin_source_*` incl. `plugin_source_rollback`; scaffold/diagnostic wording in descriptions |
| Wired descriptors (kit-built, metadata-joined) | `T features/plugin-runtime/tool-registrations.ts:994-1000` (`buildDomainRegistrations`, `catalogModule: "features/plugin-runtime/agent-tools.ts"`) | NEW G-plug 1 (`descriptors`) | `toolMetadata` from `T contracts/core/tool-metadata/plugin-runtime.ts`; domain `plugins`; catalog path string |
| Derived risk map | `T tool-registrations.ts:226-240` | NEW G-plug 1 (`derivedRisk.plugins`) | none, inspected |
| `plugins_list` normal result (enabled DTO row, disabled agent-visible row, `agentPlugins`) | `T tool-registrations.ts:891-910` | NEW G-plug 1 (`results.listNormal`, `listNormalAuthorizeCalls`); existing `plugins_list attaches each plugin's own conflicts and an empty list to plugins without one` | permission `admin.plugins.read`, no entity scope |
| `plugins_list` refusal + malformed input | `T tool-registrations.ts:892-893` | NEW G-plug 1 (`results.listDenied`, `results.listMalformedInput`) | error text from `@jini-ai/cms/core` `requireToolPermission` |
| `plugins_set_enabled` disable (no dialog), events order, saved row | `T tool-registrations.ts:923-947` | NEW G-plug 1 (`setEnabledDisable*`) | family `site-runtime`; entity type `plugin` |
| `plugins_set_enabled` enable confirm/cancel: card HTML, outcome, events/policy order, saved row | `T tool-registrations.ts:923-947,1059-1093` | NEW G-plug 1 (`setEnabledEnableConfirm*`, `setEnabledEnableCancel*`); existing `plugins-set-enabled-consent.unit.test.ts`, `sealed-plugin-consent.regression.test.ts` | dialog copy `FAMILY_COPY` (`tool-registrations.ts:1039-1050`): "Agent Plugin", "site plugin", full-access warning; "Enable"/"Cancel"; `errorCode: "PLUGINS"`; resource id `plugin:<family>:<id>` |
| `plugins_set_enabled` refusal before dialog; malformed family | `T tool-registrations.ts:923` (`prepareSetEnabled`) | NEW G-plug 1 (`setEnabledDenied*`, `setEnabledMalformedFamily`) | permission `admin.plugins.enable`, entity type `plugin` |
| Enable approval copy, both families (pure) | `T tool-registrations.ts:1059-1093` | NEW G-plug 1 (`enableApprovalCopy`) | as above |
| `plugins_uninstall` built-in / still-enabled refusals before dialog; confirm/cancel card + outcome; removed ids | `T tool-registrations.ts:969-990`; `T uninstall-confirmation-ui.ts:32` | NEW G-plug 1 (`uninstall*`, `uninstallApprovalCopy`); existing `plugins_uninstall: a run cancelled during the post-approval re-check returns abandoned and removes nothing` | Trash wording; `PLUGINS_UNINSTALL_TOOL_ID` |

### Item 2 — capability tools (`plugin_capability_<id>`)

| Behavior | Source | Test | Host vocabulary |
|---|---|---|---|
| Id derivation via `capabilityToolIdFor` (unchanged, J-owned) | `J plugins/src/host/plugin-claims.ts` (imported by `T capability-tool-registrations.ts:252`) | NEW `G-plug 2: capability tool ids, descriptions, schema, gate and call results are unchanged` (`sources[].id`) | grammar `plugin_capability_<id>` (plugin-domain identity, justified) |
| Description: stored (tier-3), fresh (tier-2 beforeSave), generic fallback | `T capability-tool-registrations.ts:176,207-226` | NEW G-plug 2 (`sources`, `descriptors`) | identityNamespace `"tovu"` (`:208`); tool names `content_post_search`, `content_post_list`, `content_post_get`; prose "post or page", "Plugin discovery:" |
| Input schema | `T capability-tool-registrations.ts:269-283` | NEW G-plug 2 (`descriptors[].inputSchema`) | same three tool names in `postId` description |
| Catalog entry / risk / permission / domain | `T capability-tool-registrations.ts:265-267,386-394,458-472` | NEW G-plug 2 (`descriptors`, `derivedRisk`); existing `the built registration is read-only, content.read-gated, and requires a postId` | permission `content.read`; entity type `post`; domain `plugin-capability`; catalog path `features/plugin-runtime/capability-tool-registrations.ts`; approval family `plugin-capability-result`; `toolMetadata` |
| Handler: stored value / no-data note / JSON decode / fresh preview / preview failure / not found / malformed / denied | `T capability-tool-registrations.ts:299-337,358-383,397-406` | NEW G-plug 2 (`calls.*`, `authorizeCalls`) | error prose `PLUGIN_HOOK_FAILED: ...`; note "has not computed any field for this post yet" |
| Boot registration: enabled only (disabled/absent register nothing) | `T capability-tool-registrations.ts:234-261,488-502` | NEW G-plug 2 (`bootRegistered`, `bootSubsets`); existing `registerEnabledPluginCapabilityTools registers nothing for a disabled plugin` | none, inspected |
| Per-call activation gate: disabled / quarantined / absent / read throws | `T capability-tool-registrations.ts:410-438` | NEW G-plug 2 (`activationGate.*`); existing `capability-tool-revocation.integration.test.ts` (all tests) and `an activation read that throws a non-Error denies the call and logs the thrown value` | log prefix `[plugin-runtime]` |
| Executable contribution tools admin gate | `T capability-tool-registrations.ts:505-518` | existing `registerEnabledPluginCapabilityTools attaches executable plugin tools to the registry it was given when no separate executable registry is wired` (not re-recorded: gap below) | permission `admin.plugins.enable`, entity `plugin`, approval `{ class: 'publish', confirmation: 'direct' }` |

### Item 3 — declarative enable (real composition + real content-type write path)

| Behavior | Source | Test | Host vocabulary |
|---|---|---|---|
| Create: tier-1 types created at enable, actor `plugin:<id>`, code never imported | `T declarative-content-types.ts:330-355`; `J plugins/src/host/declarative-enable.ts:50`; `T server/runtime/composition/declared-content-types.ts` | NEW `G-plug 3: declarative enable create/keep/conflict/tombstone and lost-race winners are unchanged` (`create`); existing `a tier-1 plugin's content types are created at enable, recorded as the plugin, and its code is never imported` | actor grammar `plugin:<id>` (domain); `principalKind: "system"`; authorize reason "declared by an enabled plugin" |
| Keep: disable + re-enable keeps the type, no new revision | `T declarative-content-types.ts:277-295` | NEW G-plug 3 (`keep`); existing `re-enabling is idempotent: the existing type is kept, nothing re-registered` | none, inspected |
| Conflict: disagreeing existing type refuses, writes nothing (no activation, no revision) | `T declarative-content-types.ts:258-295` | NEW G-plug 3 (`conflict`); existing `an existing type that disagrees refuses a code plugin before its code is imported` | error prose (plugin-domain) |
| Tombstone: tombstoned type skipped, never resurrected | `T declarative-content-types.ts:287,318` | NEW G-plug 3 (`tombstone`) | status `tombstone` |
| Claim conflict: second plugin with same key refused before any write | `J plugins/src/host/plugin-claims.ts` | NEW G-plug 3 (`claimConflict`); existing `a second plugin declaring the same content type key is refused by the claim system, before anything is written` | none, inspected |
| Lost create race: compatible winner kept / tombstoned skipped / incompatible -> canonical `PluginInvalidError` / unrelated error rethrown unclassified | `T declarative-content-types.ts:312-355` | NEW G-plug 3 (`concurrentCreate.*`, `canonicalPluginInvalidError`) | CMS `ContentTypeAlreadyExistsError` classifier (L1a input) |
| Reserved keys `["post","page",...SYSTEM_CONTENT_TYPES]` | `T declarative-content-types.ts:56,154` | existing `declarative-content-types.unit.test.ts` | reserved keys (host input in L1a) |

### Item 4 — tier-2 real worker call, timeout, preview

| Behavior | Source | Test | Host vocabulary |
|---|---|---|---|
| Success: enable probe, save writes `ext` via worker, preview returns patch and saves nothing, no in-process import | `T server/runtime/composition/plugin-runtime.ts:266-284,428`; `T server/runtime/plugin-tier2/run-in-worker.ts:100`; `J plugins/src/host/hook-registry.ts:341` | NEW `G-plug 4: a real-worker tier-2 call succeeds, saves ext, and its preview saves nothing`; existing `built-in tier-2: enable probes in a worker, save writes ext through a worker, preview saves nothing` | fixture entry path `server/runtime/plugin-tier2/__tests__/fixtures/echo-plugin/plugin.ts`; `@tovu/sdk` hook id `content.entry.beforeSave`; success timeout 30 000 ms (generous, preserved) |
| Runaway: real timeout on preview (not counted) and on save (counted; quarantines at threshold 2) | same + `J plugins/src/host/hook-registry.ts` quarantine | NEW `G-plug 4: a runaway tier-2 call is stopped by the real timeout; the preview does not count, saves quarantine`; existing `built-in tier-2: a looping filter is stopped by the timeout; previews fail without counting, saves quarantine` | timeout text `plugin '<id>' tier-2 exceeded <n>ms timeout`; loop timeout 6 000 ms |
| Env isolation, site tier-2 refusal | `T run-in-worker.ts` | existing `built-in tier-2: the worker gets an explicit minimal env, never the server's env vars`, `site tier-2: refused at enable and never attached at boot, even integrity-pinned` (not duplicated) | env timeout key (Tovu-owned) |

### Item 5 — admin DTO and counters

| Behavior | Source | Test | Host vocabulary |
|---|---|---|---|
| `toAdminPluginResponse` envelope: enabled / never activated / quarantined / invalid / conflicts / providerSettings / tier fallback | `T features/plugin-runtime/admin-response.ts:68-94` | NEW `G-plug 5: the admin plugin DTO envelope is unchanged`; existing `T server/inbound/admin-http/http/__tests__/unit/plugins-dto.unit.test.ts` | default tier `tier-3`; none else, inspected |
| Activation rows, quarantine counters, content-type revisions, removed ids | across items 1/3/4 | recorded inside G-plug 1/3/4 fixtures | none, inspected |

### §7 `messages` entries — every `Tovu` word on the `plugins_*` path (host wording for L2)

Fifteen distinct occurrences on the `plugins_*` catalog, schema and result path (the old "15" count;
not a ceiling). Each is product wording that L2 must make host input, Tovu binding these exact bytes.

| # | Where (fixture path) | Source | Text (excerpt) |
|---|---|---|---|
| 1 | `pluginsTools.catalog[plugins_set_enabled].description` | `T agent-tools.ts:214-228` | "it covers BOTH of Tovu's plugin systems" |
| 2 | same | same | "for a .tovu-plugin site plugin listed by content_read.plugin" |
| 3 | `pluginsTools.catalog[plugins_uninstall].description` | `T agent-tools.ts:232-247` | "it covers BOTH of Tovu's plugin systems" |
| 4 | same | same | "This is NOT reversible from inside Tovu" |
| 5 | same | same | "is BUNDLED with Tovu (bundled plugins are re-seeded on every boot)" |
| 6 | `...inputSchema.properties.enabled.description` | `T agent-tools.ts:160-166` | "do not ask the person to restart Tovu" |
| 7 | `...inputSchema.properties.family.description` (set_enabled) | `T agent-tools.ts:140-150` | "Tovu has two unrelated systems that share the word 'plugin'" |
| 8 | same | same | "Use 'site-runtime' for a .tovu-plugin site/runtime plugin" |
| 9 | `...inputSchema.properties.family.description` (uninstall) | `T agent-tools.ts:170` (`UNINSTALL_SCHEMA`) | "the same reason: Tovu has two unrelated systems" |
| 10 | same | same | "Use 'site-runtime' for a .tovu-plugin site/runtime plugin (anything" |
| 11 | `...inputSchema.properties.pluginId.description` (uninstall) | same | "installed in this workspace and not bundled with Tovu." |
| 12 | `pluginsTools.results.setEnabledDisable.value.note` | `T tool-registrations.ts:439` (disable note) | "stays listed in the running daemon until Tovu restarts" |
| 13 | `pluginsTools.results.setEnabledEnableConfirm.outcome.value.note` | `T tool-registrations.ts:437` (enable note) | "tell the user Tovu has to be restarted before that tool" |
| 14 | `pluginsTools.results.setEnabledMalformedFamily.error.message` | `T tool-registrations.ts:285-292` (`readFamily`) | "Tovu has two unrelated plugin systems" |
| 15 | same | same | "'site-runtime' (a .tovu-plugin site plugin, as listed by content_read.plugin)" |

Adjacent product words recorded but outside `plugins_*` proper: `plugins_install` catalog ×3 ("the
machine Tovu runs on" ×2, ".tovu-plugin"); capability descriptions ×2 (`Plugin discovery: tovu/<id>`,
identityNamespace `"tovu"`, `capability-tool-registrations.ts:208`); admin DTO error file
`tovu.plugin.json` (fixture input). Full list: 34 occurrences in the unit fixture (descriptors repeat
catalog text), scratch listing outside the repo.

## Coverage gaps (not closed in G-plug, and why)

- `plugins_install` handler results and its tracker telemetry (`plugin_installed`, `operation_failed`)
  are not golden-recorded: the path needs a real archive/installer port; catalog + risk are recorded,
  behavior stays covered by existing `install-tool.unit.test.ts` / `install-archive.*` tests.
- `plugin_source_*` handler results: catalog + risk recorded only; behavior covered by existing
  `source-tools.unit.test.ts` and `source-runtime.integration.test.ts`.
- Agent Plugin family branches of `plugins_set_enabled` / `plugins_uninstall`: not re-recorded (their
  owners are in session 4's `agent-plugins/*` set); existing `plugins-set-enabled-consent.unit.test.ts`.
- `PLUGINS_MODEL_FACING_ERRORS` (`tool-registrations.ts:880`) guidance text is not reached by a
  recorded call (needs a live claim conflict through `executeCommand`); covered by existing
  `plugin-conflicts.integration.test.ts`.
- Executable contribution-tool admin gate (`capability-tool-registrations.ts:505-518`): existing
  tests only, not golden-recorded.
- The card HTML is recorded with one normalization: the random surface-exchange UUID.

## Fixture-setup notes (inputs, not behavior)

- Tombstone: the owner's tombstone is simulated by saving the real registered row with
  `status: "tombstone"` through the in-memory repo (no lifecycle op), so `tombstonedAt` stays `null`.
- Lost race: a wrapper around the REAL `createDeclaredContentTypePorts` lets a competing writer
  register the key (through the same real write path) between plan and register; the plugin's own
  register then gets core's real `ContentTypeAlreadyExistsError`. The `unrelated-error` case returns a
  plain `Error` from register to prove it is rethrown, not classified as a race.
- Capability gate "quarantined" uses a saved row with `enabled:false` plus quarantine fields.

## Prior-behavior observations (recorded as-is, not fixed)

- Tier-2 runaway: the first failing SAVE leaves the stored activation row unchanged (the failure
  counter is in memory until the threshold); the second failing save writes the quarantine row with
  `quarantineFailureCount: 2`. A failing PREVIEW changes nothing. Consistent with the existing test.
- `plugins_list` disabled-row description for a plugin with no keywords renders a double space
  (`"installed, off: Quiet:  — read guidance; tools unavailable"`). Wording owned by
  `@jini-ai/agent-plugins/lifecycle` `agentVisiblePluginCandidate`; recorded as-is.
- `plugins_set_enabled` site enable with `confirmEnable: () => true` records no `confirmEnable` policy
  call for a `site` record whose source is not sealed-here-probed in this harness path (events show
  `readApproval` then `recordApproval`); recorded as-is, matches existing consent tests' ordering.
