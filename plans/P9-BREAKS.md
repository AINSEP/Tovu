# P9-BREAKS — product literals that change name when code moves into Jini

Owner 11-20 ~12:50: "I want tovu removed from jini totally. we will fix the breaks later." Every row is a literal (not a comment) containing `tovu` in a file that a P9 step moves into Jini. The implementer renames it to the `jini` form (identifiers: drop the `Tovu` prefix, e.g. `TovuRequestFacts` → `RequestFacts`; strings: `tovu` → `jini`, e.g. `data-tovu-slot` → `data-jini-slot`), renames the Tovu importers in step T, and fills the last two columns. Rows for the rename lane RN are at the end.

| step | file:line (Tovu, before the move) | literal | new name (implementer) | what breaks for existing installs (implementer) |
|---|---|---|---|---|
| C-contracts-core-2 | `apps/website/src/contracts/core/request-facts.ts:10` | `export const TOVU_REQUEST_FACTS = "tovuRequestFacts";` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/request-facts.ts:12` | `export interface TovuRequestFacts {` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/request-facts.ts:23` | `function isFacts(value: unknown): value is TovuRequestFacts {` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/request-facts.ts:25` | `const facts = value as Partial<Record<keyof TovuRequestFacts, unknown>>;` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/request-facts.ts:35` | `export function readRequestFacts({ locals }: { readonly locals: Readonly<Record<string, unknown>> }, _optional: Record<string, never> = {}):` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/request-facts.ts:36` | `const facts = locals[TOVU_REQUEST_FACTS];` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/request-facts.ts:37` | `if (!isFacts(facts)) throw new Error('request facts are missing from locals.${TOVU_REQUEST_FACTS}: the route was mounted without mountJiniRo` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/runtime-mode.ts:22` | `return env.TOVU_RUNTIME_MODE === "production" ? "production" : "local";` | | |
| C-contracts-core-2 | `apps/website/src/contracts/core/theme-ids.ts:22` | `export const RENAMED_THEME_IDS: Readonly<Record<string, string>> = { basic: "tovu-theme" };` | | |
| C-contracts-core-3 | `apps/website/src/contracts/core/tool-metadata/agent-plugins.ts:35` | `search: { keywords: 'edit customize change bundled agent plugin tovu-theme fork copy skills source EACCES PLUGIN_BUNDLED' },` | | |
| C-contracts-core-5 | `apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts:20` | `keywords: "plugin plugins install add new upload folder zip attachment local package upgrade replace version site plugin tovu-plugin extensi` | | |
| C-contracts-core-6 | `apps/website/src/contracts/core/tool-metadata/site-guide.ts:8` | `keywords: "how tovu works site guide learn building blocks forms widgets markers themes members SEO deploy plugins Jini",` | | |
| C-contracts-core-6 | `apps/website/src/contracts/core/tool-metadata/site-guide.ts:9` | `queries: ["How does Tovu work?", "Design a planner directory site."],` | | |
| C-contracts-headless-1 | `apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts:38` | `PERMANENT_DELETE_TOOLS.map(tool => '${tool.id}: ${tool.adminPath ?? "there is no Tovu admin screen for this operation; say so"}').join("; ")` | | |
| C-contracts-headless-1 | `apps/website/src/contracts/headless/plugin-install-source.ts:15` | `path: { type: "string", minLength: 1, description: "Absolute path on the machine Tovu runs on. Exactly one of path/attachmentRef." },` | | |
| C-platform-html-1 | `apps/website/src/platform/html/published-webmcp-strip.ts:5` | `export const SCRIPT_MARKER = 'data-tovu-webmcp-script';` | | |
| C-platform-html-1 | `apps/website/src/platform/html/safe-url.ts:9` | `const SAFE_HREF_RESOLUTION_BASE = "https://tovu-safehref.invalid/";` | | |
| C-platform-html-1 | `apps/website/src/platform/html/menu-render.ts:45` | `const icon = attrs.icon ? '<span data-tovu-menu-icon="${escapeHtml({ text: attrs.icon })}"></span>' : "";` | | |
| C-platform-html-1 | `apps/website/src/platform/html/menu-render.ts:46` | `const description = attrs.description ? '<span data-tovu-menu-description>${escapeHtml({ text: attrs.description })}</span>' : "";` | | |
| C-platform-html-1 | `apps/website/src/platform/html/menu-render.ts:70` | `? '<span data-tovu-menu-label>${label}</span>'` | | |
| C-platform-html-1 | `apps/website/src/platform/html/menu-render.ts:72` | `return '<li data-tovu-menu-item data-depth="${depth}" data-current="${item.isCurrent}" data-active="${item.isActive === true}" data-has-chil` | | |
| C-platform-html-1 | `apps/website/src/platform/html/menu-render.ts:79` | `return children === "" ? "" : '<ul data-tovu-menu-list data-depth="${depth}">${children}</ul>';` | | |
| C-platform-html-1 | `apps/website/src/platform/html/menu-render.ts:86` | `return list === "" ? "" : '<nav data-tovu-menu="${escapeHtml({ text: id })}">${list}</nav>';` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:1` | `export const ENTRY_LIST_ATTRIBUTE = "data-tovu-entry-list";` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:14` | `const ENTRY_LIST_STYLE_OPEN_TAG = "<style data-tovu-entry-list>";` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:24` | `":where([data-tovu-entry-list]){display:grid;gap:1rem;grid-template-columns:repeat(var(--entry-list-columns,3),minmax(0,1fr));list-style:non` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:25` | `":where([data-tovu-entry-list].entry-list--list){display:flex;flex-direction:column;grid-template-columns:none}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:26` | `":where([data-tovu-entry-list] .entry-card){border:1px solid var(--border,#ddd);background:var(--surface,transparent);padding:1rem;border-ra` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:27` | `":where([data-tovu-entry-list] .entry-card__title){margin:0 0 .5rem}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:28` | `":where([data-tovu-entry-list] .entry-card__fields dt){color:var(--muted,#666);font-size:.85em}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:29` | `":where([data-tovu-entry-list] .entry-card__fields dd){margin:0 0 .75rem}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:30` | `"@media (max-width:640px){:where([data-tovu-entry-list]){grid-template-columns:1fr}}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:33` | `":where([data-tovu-entry-list].entry-list--carousel){display:flex;grid-template-columns:none;overflow-x:auto;scroll-snap-type:x mandatory;pa` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:34` | `":where([data-tovu-entry-list].entry-list--carousel > .entry-card){flex:0 0 min(85%,22rem);scroll-snap-align:start}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:35` | `":where([data-tovu-entry-list].entry-list--accordion){display:block}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:36` | `":where([data-tovu-entry-list] .entry-accordion__item){border-bottom:1px solid var(--border,#ddd);padding:.75rem 0}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:37` | `":where([data-tovu-entry-list] .entry-accordion__question){cursor:pointer;font-weight:600}" +` | | |
| T-theme-1 | `apps/website/src/features/theme/entry-list-markup.ts:38` | `":where([data-tovu-entry-list] .entry-accordion__field){margin:.5rem 0 0}" +` | | |
| T-theme-2 | `apps/website/src/features/theme/validation/webmcp-markup.ts:182` | `if (attr({ element, name: 'data-tovu-agent' }) !== undefined) issue({ ruleId: 'markup-tovu-agent-retired', message: 'data-tovu-agent is reti` | | |
| T-theme-2 | `apps/website/src/contracts/core/tool-metadata/theme.ts:44` | `"Create a new theme based on tovu-theme called Roastery.",` | | |
| T-theme-2 | `apps/website/src/contracts/core/tool-metadata/theme.ts:75` | `keywords: "theme import local file folder drop tovuize font woff woff2 ttf otf image logo icon favicon binary asset copy",` | | |
| P-publish-trust-1 | `apps/website/src/features/publish-trust/provisioning.ts:38` | `export const PUBLISH_TRUST_ENV_VAR = "TOVU_PUBLISH_TRUST";` | | |
| P-publish-trust-1 | `apps/website/src/features/publish-trust/provisioning.node-io.ts:43` | `return env.TOVU_REPO_ROOT \|\| process.cwd();` | | |
| D-site-backup-1 | `apps/website/src/contracts/core/tool-metadata/site-backup.ts:6` | `site_import_backup: { search: { keywords: "install import site share url link zip new separate restore", queries: ["Install the site at this` | | |
| D-site-backup-1 | `apps/website/src/contracts/core/tool-metadata/site-backup.ts:24` | `site_share_create: { search: { keywords: "share export site zip portable link download drafts", queries: ["Share this site", "Export this si` | | |
| D-deployments-1 | `apps/website/src/features/deployments/publish-credentials/execution-mode.ts:25` | `const ENV_VAR = "TOVU_EXECUTION_MODE";` | | |
| D-deployments-1 | `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:21` | `"Which secrets are set on my hosted app?", "List the environment variables on the server.", "Is TOVU_SITE_KEY set in production?", "Show my ` | | |
| D-deployments-1 | `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:50` | `"Set TOVU_SITE_KEY on my host from my site key.", "Copy the site key to the production server.", "Add a secret to my hosted app.", "Copy one` | | |
| X-settings-1 | `apps/website/src/features/settings/site-title.ts:45` | `export const LEGACY_SITE_TITLE = "Tovu Demo Site";` | | |
| X-origin-1 | `apps/website/src/features/origin/configured-origin.ts:32` | `"No public origin is configured for this production deployment: TOVU_PUBLIC_URL is unset or was " +` | | |
| X-origin-1 | `apps/website/src/features/origin/configured-origin.ts:35` | `"unavailable until TOVU_PUBLIC_URL names this deployment's origin.";` | | |
| X-origin-1 | `apps/website/src/features/origin/configured-origin.ts:54` | `envVarName: "TOVU_PUBLIC_URL",` | | |
| X-origin-1 | `apps/website/src/features/origin/configured-origin.ts:76` | `envVarName: "TOVU_PUBLIC_URL",` | | |
| X-consent-1 | `apps/website/src/features/consent/config.ts:42` | `export const SITE_CONSENT_DEFAULT_CSS = '/* Tovu's default cookie banner style. Edit it freely; "Reset to default" brings it back. */` | | |
| X-consent-1 | `apps/website/src/features/consent/validation.ts:66` | `if ('reopen' in raw && raw.reopen !== 'link') throw new ToolInputError({ message: 'Tovu cookie preferences reopen through a link.' });` | | |
| X-external-mcp-1 | `apps/website/src/features/external-mcp/built-in-connections.ts:7` | `const value: unknown = JSON.parse(env.TOVU_BUILT_IN_MCP_SERVER_IDS ?? "[]");` | | |
| X-identity-1 | `apps/website/src/features/identity/api-key-secret.ts:45` | `const KEY_SCHEME_PREFIX = "tovu_ak_";` | | |
| X-identity-1 | `apps/website/src/features/identity/api-key-secret.ts:57` | `const PREFIX_PATTERN = /^tovu_ak_[0-9a-f]{12}$/;` | | |
| X-identity-2 | `apps/website/src/features/identity/site-key-permission.ts:86` | `"The admin Security page's Site key tab reads/generates the TOVU_SITE_KEY " +` | | |
| X-agent-plugins-1 | `apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts:15` | `const PUBLIC_NAME_PATTERN = /^(TOVU_[A-Z0-9_]{1,48}_(APP_ID\|CLIENT_ID\|BROWSER_KEY\|PUBLIC_KEY)\|JINI_GOOGLE_PICKER_APP_ID\|JINI_GOOGLE_PICKER_B` | | |
| X-agent-plugins-1 | `apps/website/src/features/agent-plugins/bundled-catalog.ts:24` | `export const BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED: ReadonlySet<string> = new Set(["github", "site-import", "tovu-theme", "how-tovu-works", "` | | |
| X-agent-plugins-1 | `apps/website/src/features/agent-plugins/bundled-catalog.ts:83` | `["tovu-deploy-fly", "fly"],` | | |
| X-agent-plugins-1 | `apps/website/src/features/agent-plugins/bundled-catalog.ts:86` | `["create-tovu-theme", "tovu-theme"],` | | |
| X-agent-plugins-1 | `apps/website/src/features/agent-plugins/bundled-catalog.ts:87` | `["tovuize-site", "tovu-theme"],` | | |
| X-agent-plugins-1 | `apps/website/src/features/agent-plugins/bundled-id-upgrade.ts:37` | `new Map(RENAMED_TO_JINI.map(id => [id, { from: 'tovu/${id}', to: 'jini/${id}' }]));` | | |
| X-agent-plugins-1 | `apps/website/src/features/agent-plugins/bundled-id-upgrade.ts:133` | `if (ledger.get(revision.pluginId) !== revision.archiveDigest) return "its installed copy is not the one Tovu installed from its own build";` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:136` | `"Which plugin SYSTEM the id belongs to. Required, and never guessed — Tovu has two unrelated systems that share the word 'plugin'. " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:138` | `"anything search_agent_plugin_local returned, e.g. an image/video plugin). Use 'site-runtime' for a .tovu-plugin site/runtime plugin — " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:159` | `"to restart Tovu or claim an unavailable tool is ready.",` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:174` | `"argument, and the same reason: Tovu has two unrelated systems that share the word 'plugin'. Use 'agent-plugin' for an " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:176` | `".tovu-plugin site/runtime plugin (anything content_read.plugin returned). If you did not get the id from one of those " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:185` | `"returned by search_agent_plugin_local — must be installed in this workspace and not bundled with Tovu.",` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:210` | `"Turns a plugin ON or OFF. This is the ONE tool for enabling and disabling plugins, and it covers BOTH of Tovu's plugin systems — " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:212` | `"image/video plugin), 'site-runtime' for a .tovu-plugin site plugin listed by content_read.plugin. Use this when the " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:228` | `"Uninstalls a plugin. This is the ONE tool for uninstalling plugins, and it covers BOTH of Tovu's plugin systems — say " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:235` | `"Agent Plugin from THIS workspace — its package and activation record. This is NOT reversible from inside Tovu: there " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/agent-tools.ts:237` | `"id is not installed in this workspace or is BUNDLED with Tovu (bundled plugins are re-seeded on every boot) — call " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts:35` | `extensions: { tovu: { id: "tovu/content-analyzer", provides: ["content-analysis"] } },` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:2` | `export const familyRequired = "'family' is required and must be exactly one of: 'site-runtime' (a .tovu-plugin site plugin, as listed by " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:3` | `"content_read.plugin) or 'agent-plugin' (an Agent Plugin, as returned by search_agent_plugin_local). Tovu has two " +` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:38` | `'search for agent_plugin_${request.pluginId} to read its guidance. Do not ask the person to restart Tovu.'` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:44` | `"daemon starts — tell the user Tovu has to be restarted before that tool can be called."` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:46` | `"in the running daemon until Tovu restarts, but every call to it is refused from now on.";` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:55` | `? "Tell the user to restart Tovu (recovery runs at start) and then try again."` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:56` | `: 'Its update recovery record needs manual repair (${error.code}); restarting Tovu will not fix it. Tell the user an operator has to repair ` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:60` | `export function hostIncompatibleNote({ pluginId }: { pluginId: string }): string { return 'Nothing changed: '${pluginId}' is not made for th` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:61` | `"Tell the user it needs a version of the plugin that supports this Tovu."; }` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:65` | `export function activationsBusyNote({ pluginId, enabled }: { pluginId: string; enabled: boolean }): string { return 'Nothing changed: anothe` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:69` | `export const localInstallDisabledNote = "Nothing was installed: local plugin installs are off on this server. The owner has to start Tovu wi` | | |
| X-plugin-runtime-1 | `apps/website/src/features/plugin-runtime/source-tool-catalog.ts:36` | `{ name: 'plugin_source_seal', description: 'Validates the draft manifest, computes integrity for every package file, uses a higher manifest ` | | |
| X-skills-1 | `apps/website/src/features/skills/state.ts:5` | `export const SKILL_STATE_FILE = ".tovu-install.json";` | | |
| X-database-1 | `apps/website/src/features/database/db-messages.ts:9` | `export const TOVU_DATABASE_MESSAGES: DbMessages = {` | | |
| X-database-1 | `apps/website/src/features/database/agent-tools.ts:7` | `return getJiniDatabaseAgentToolCatalog({}, { messages: TOVU_DATABASE_MESSAGES });` | | |
| X-database-transfer-1 | `apps/website/src/features/database-transfer/postgres-target.ts:9` | `return createTarget({ connectionString }, { parentEnv, applicationName: "tovu-database-transfer" });` | | |
| X-database-transfer-1 | `apps/website/src/features/database-transfer/transfer-messages.ts:9` | `export const TOVU_TRANSFER_MESSAGES: DbTransferMessages & Pick<DbMessages, "privateAreasTaken"` | | |
| X-database-transfer-1 | `apps/website/src/features/database-transfer/table-catalog.ts:150` | `const MIGRATION_LEDGERS = new Set(["__drizzle_migrations", "tovu_migrations", "tovu_chat_migrations"]);` | | |
| X-database-transfer-1 | `apps/website/src/features/database-transfer/copy-engine.ts:8` | `export const DEFAULT_TRANSFER_SCHEMA = "tovu";` | | |
| X-database-transfer-1 | `apps/website/src/features/database-transfer/copy-engine.ts:9` | `export const TRANSFER_MARKER_TABLE = "_tovu_transfer";` | | |
| X-database-transfer-1 | `apps/website/src/features/database-transfer/copy-engine.ts:10` | `export const TRANSFER_NAMING: TransferNaming = { defaultSchema: DEFAULT_TRANSFER_SCHEMA, markerTable: TRANSFER_MARKER_TABLE, unvalidatedTabl` | | |
| X-recovery-1 | `apps/website/src/features/recovery/agent-tools.ts:118` | `description: "Reports this site's restore-point cost class and mechanism kind. For private full-site repository backups, call source_control` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:1` | `const FORM_CLASS = "tovu-form";` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:3` | `const FORM_ERROR_CLASS = "tovu-form-error";` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:79` | `":root{--tovu-form-danger-fallback:#f87171;--tovu-form-success-fallback:#4ade80;}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:80` | `":root[data-theme=\"light\"]{--tovu-form-danger-fallback:#b91c1c;--tovu-form-success-fallback:#166534;}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:110` | `":where(.tovu-form-range-value){font-size:0.85rem;color:var(--muted,#6b7280);font-variant-numeric:tabular-nums;}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:121` | `":where(.widget-form-field-error){color:var(--danger,var(--tovu-form-danger-fallback));font-size:0.85rem;font-weight:700;}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:131` | `":where([data-tovu-form] label:not([hidden])){display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:0.9rem;}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:132` | `":where([data-tovu-form] label:has(> input[type=checkbox],> input[type=radio])){flex-direction:row;align-items:center;gap:8px;font-weight:40` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:133` | `":where([data-tovu-form] :is(input:not([type=checkbox],[type=radio],[type=hidden],[type=submit],[type=button],[type=reset],[type=range],[typ` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:135` | `":where([data-tovu-form] textarea){min-height:100px;resize:vertical;}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:136` | `":where([data-tovu-form] :is(input[type=checkbox],input[type=radio],input[type=range])){accent-color:var(--accent,#2563eb);}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:137` | `":where([data-tovu-form] input[type=range]){width:100%;margin:0;}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:154` | `":where([data-tovu-form] button:not([type=button],[type=reset])){align-self:flex-start;padding:8px 16px;" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:159` | `"border-left:4px solid var(--success,var(--tovu-form-success-fallback));color:var(--success,var(--tovu-form-success-fallback));}" +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:160` | `':where(.${FORM_ERROR_CLASS},[data-tovu-form-error]){padding:10px 12px;border-radius:6px;' +` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:162` | `"border-left:4px solid var(--danger,var(--tovu-form-danger-fallback));color:var(--danger,var(--tovu-form-danger-fallback));font-size:0.9rem;` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:175` | `"(function(d){d.querySelectorAll('.tovu-form input[type=range]:not([data-tovu-range]),[data-tovu-form] input[type=range]:not([data-tovu-rang` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:176` | `"r.setAttribute('data-tovu-range','');var o=d.createElement('output');o.className='tovu-form-range-value';o.setAttribute('aria-hidden','true` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-wire-policy.ts:16` | `export const FORM_FLASH_COOKIE_NAME = "tovu_form_flash";` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/member-auth-script.ts:430` | `const MEMBER_SCRIPT_MARKER = "data-tovu-member-auth";` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts:29` | `const devProxyUrl = process.env.TOVU_SITE_CHAT_DEV_PROXY_URL;` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:9` | `<div id="tovu-site-assistant-root" data-chat-open="true" data-chat-compare="${variant}"></div>` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:53` | `const ready = () => frames.every(frame => frame.contentDocument?.getElementById('tovu-site-assistant-root')?.dataset.compareReady === 'true'` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:56` | `if (event.origin === location.origin && frames.some(frame => frame.contentWindow === event.source) && event.data?.type === 'tovu-site-chat-r` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:62` | `const root = frame.contentDocument.getElementById('tovu-site-assistant-root');` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:72` | `root.dispatchEvent(new frame.contentWindow.CustomEvent('tovu-compare-send', { detail: { text, done: error => {` | | |
| R-public-http-1 | `apps/website/src/server/inbound/public-http/http/site/form-feedback-policy.ts:11` | `hooks: { form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },` | | |
| R-public-http-2 | `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:63` | `hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },` | | |
| R-public-http-2 | `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:68` | `hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },` | | |
| R-public-http-2 | `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:79` | `const fields = stampFormFieldMaxLengths({ html: renderHtmlFormBody({ fields: fieldDescriptors, hooks: { field: "data-tovu-field" } }, fieldO` | | |
| R-public-http-2 | `apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts:17` | `const LOCAL_KEY = "tovuRenderThemeIdOverride";` | | |
| R-public-http-2 | `apps/website/src/server/inbound/public-http/routes/site/pages/request-policy.ts:13` | `const STATIC_EXPORT_REQUEST_HEADER = "x-tovu-static-export";` | | |
| R-admin-http-1 | `apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts:255` | `const devProxyUrl = process.env.TOVU_ADMIN_DEV_PROXY_URL;` | | |
| R-admin-http-1 | `apps/website/src/server/inbound/admin-http/admin-static.ts:77` | `const devProxyUrl = process.env.TOVU_ADMIN_DEV_PROXY_URL;` | | |
| A-adm-other-1 | `apps/admin/src/features/email/email.css:72` | `.email-template-preview .page-preview-frame { background: var(--tovu-site-preview-bg, #fff); }` | | |
| A-adm-other-2 | `apps/admin/src/features/observability/recent-errors.css:5` | `Tovu's '--surface'/'--fg', and the tab follows whichever theme Jini resolves.` | | |
| A-adm-other-3 | `apps/admin/src/features/webmcp/browser-agent-settings.hooks.ts:13` | `export const WEBMCP_PREFERENCE_KEY = "tovu.admin.webmcp.enabled";` | | |
| A-adm-shell-lib-1 | `apps/admin/src/lib/admin-dev-origin.ts:21` | `export const ADMIN_DEV_SERVER_PORT: string = __TOVU_ADMIN_DEV_PORT__;` | | |
| A-adm-shell-lib-1 | `apps/admin/src/lib/app-version.ts:12` | `export const TOVU_ADMIN_VERSION = __TOVU_ADMIN_VERSION__;` | | |
| A-adm-shell-lib-3 | `apps/admin/src/lib/server-reconnect.ts:21` | `export const UPSTREAM_REFUSED_HEADER = "x-tovu-upstream-status";` | | |
| A-adm-shell-lib-4 | `apps/admin/src/lib/site-url.ts:29` | `const origin = import.meta.env.VITE_TOVU_SITE_URL ?? "https://localhost:3000";` | | |
| A-adm-shell-components-1 | `apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts:14` | `const PACKAGE_MARKER = /^(?:[^/]+\/)?(?:SKILL\.md\|(?:jini\|tovu)\.plugin\.json\|plugin\.json)$/;` | | |
| A-adm-shell-components-1 | `apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts:62` | `if (names.has("jini.plugin.json") \|\| names.has("tovu.plugin.json")) return "site-plugin"; // tovu.plugin.json: legacy alias` | | |
| A-adm-shell-components-1 | `apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts:98` | `const pluginRoots = new Set(roots.filter((root, index) => root && (paths[index] === '${root}plugin.json' \|\| paths[index] === '${root}jini.pl` | | |
| A-adm-shell-components-2 | `apps/admin/src/components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts:14` | `export const MAIL_BANNER_DISMISSED_KEY = "tovu.admin.mail-status-banner.dismissed";` | | |
| A-adm-shell-components-2 | `apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts:9` | `unreachable: "Can't reach the Tovu server. It will retry when you try again.",` | | |
| DT-desktop-1 | `apps/desktop/src/node-toolchain.ts:29` | `const GENERATED_COMMENT = "# Generated by Tovu Desktop — rewritten on every launch. Do not edit.";` | | |
| DT-desktop-1 | `apps/desktop/src/node-toolchain.ts:68` | `return buildEnvironment({ ...input, toolchainEnvName: "TOVU_NODE_TOOLCHAIN_DIR", npmRootEnvName: "TOVU_BUNDLED_NPM_ROOT" });` | | |
| DT-desktop-1 | `apps/desktop/src/speech/mac-on-device-transcriber.ts:47` | `export const DEFAULT_BINARY_PATH = path.join(dirname, ".build", "jini-v1", "tovu-speech-helper");` | | |
| DT-desktop-1 | `apps/desktop/src/speech/mac-on-device-transcriber.ts:51` | `invalidOutput: ({ stdout }) => 'tovu speech: helper printed non-JSON output: ${stdout}',` | | |
| DT-desktop-1 | `apps/desktop/src/speech/mac-on-device-transcriber.ts:52` | `cannotTranscribe: ({ reason }) => 'tovu speech: cannot transcribe (${reason})',` | | |
| DT-desktop-1 | `apps/desktop/src/speech/mac-on-device-transcriber.ts:53` | `recognitionFailed: ({ reason }) => 'tovu speech: recognition failed (${reason})',` | | |
| DT-desktop-1 | `apps/desktop/src/speech/mac-on-device-transcriber.ts:78` | `tempFilePath: () => path.join(os.tmpdir(), 'tovu-speech-${crypto.randomUUID()}.wav'),` | | |
| DT-desktop-1 | `apps/desktop/src/speech/transcription-port.ts:17` | `unavailable: ({ reason }) => 'tovu speech: transcription unavailable (${reason})',` | | |
| DT-desktop-1 | `apps/desktop/src/speech/speech-ipc.ts:28` | `const channels = speechChannels({ channelNamespace: "tovu:speech" });` | | |
| DT-desktop-1 | `apps/desktop/src/speech/speech-ipc.ts:32` | `senderRefused: "tovu:speech: refused — the sender is not a page this app serves.",` | | |
| DT-desktop-1 | `apps/desktop/src/speech/speech-ipc.ts:33` | `invalidRate: "tovu:speech:transcribe: sampleRate must be a whole number of Hz from 8000 to 192000.",` | | |
| DT-desktop-1 | `apps/desktop/src/speech/speech-ipc.ts:34` | `invalidSamples: "tovu:speech:transcribe: samples must be a Float32Array or an array of finite numbers.",` | | |
| DT-desktop-1 | `apps/desktop/src/speech/speech-ipc.ts:36` | `tooManySamples: ({ maxSamples }) => 'tovu:speech:transcribe: at most ${maxSamples} samples per recording.',` | | |
| DT-desktop-1 | `apps/desktop/src/speech/speech-ipc.ts:56` | `channelNamespace: "tovu:speech", messages,` | | |
