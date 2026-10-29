import type { ExtensionClaim } from "@jini-ai/plugins/host";
import { FIRST_PARTY_DATA_MODULES } from "#src/server/runtime/composition/data-modules";

/**
 * @file The names Tovu core itself holds, as conflict-detection claims (2026-10-04) — what a
 * plugin's `contributes` block may NOT take. Passed to `composePluginRuntime({ coreClaims })` by
 * both composition roots; see `Jini/packages/plugins/src/host/plugin-claims.ts` for the rules and
 * `ADS-memory/specs/005-plugin-system/conflicts.spec.md` for the spec note.
 *
 * Namespaces, not inventories: core's own route table, permission set and tool catalog are each
 * spread across dozens of feature modules with no single list to read at composition time, so core
 * reserves the NAMESPACES those live in (prefix claims, `claim-conflicts.ts` rule 6) rather than a
 * hand-copied list of every name that would drift the day a feature adds one. A plugin keeps the
 * whole rest of each space — `shop.manage` and namespaced plugin tools are free. Routes always
 * mount under `/api/p/<id>`; their relative paths cannot claim a core API or public URL.
 *
 * - routes: `/admin/*` (the admin app), `/workspaces/*` (admin HTTP), and the health probes a
 *   deploy target polls. Core APIs are protected by the plugin mount's containment. Reserving
 *   `/api/*` here would also claim the delegated `/api/p/<id>` namespace and refuse every plugin.
 * - permissions: every namespace a core `permission: "<ns>.…"` check uses today (collected
 *   2026-10-04 from `grep -rhoE 'permission: "[a-z-]+\.'` over `src`, test-only namespaces left
 *   out). A plugin defining `content.publish` would otherwise silently share a grant with core.
 * - tools: `plugins_*`, the plugin-management tool family — a plugin naming one of those could
 *   shadow the very tools an operator uses to turn it off. Generated plugin tool prefixes
 *   (`plugin_capability_`, `agent_plugin_`) are refused earlier, by `validateManifest`.
 * - tables: the bundled data-module plugins' table namespaces (store, lipay, newsletter, comments),
 *   derived from their own declarations so the reservation follows them.
 * - settings, widgets: none yet — no reserved core namespace; plugin widget declarations remain
 *   exclusive against each other and are rendered through the public SSR partial owner.
 */

const CORE_ROUTE_PREFIXES = ["/admin/*", "/workspaces/*"] as const;
const CORE_ROUTES = ["/healthz", "/readyz", "/health"] as const;
const CORE_PERMISSION_NAMESPACES = [
  "admin", "analytics", "apikey", "backup", "changeset", "comments", "content", "custom-credentials",
  "database", "deployments", "forms", "integration", "media", "member", "navigation", "newsletter",
  "publish", "recovery", "role", "settings", "source-control", "system", "taxonomy", "theme", "user",
  "widget", "widgets", "workspace",
] as const;
const CORE_TOOL_PREFIXES = ["plugins_*"] as const;

const exclusive = (kind: string) => (key: string): ExtensionClaim => ({ kind, key, mode: "exclusive" });

export const TOVU_CORE_EXTENSION_CLAIMS: readonly ExtensionClaim[] = [
  ...[...CORE_ROUTE_PREFIXES, ...CORE_ROUTES].map(exclusive("route")),
  ...CORE_PERMISSION_NAMESPACES.map((namespace) => `${namespace}.*`).map(exclusive("permission")),
  ...CORE_TOOL_PREFIXES.map(exclusive("tool")),
  ...FIRST_PARTY_DATA_MODULES.map((decl) => `p_${decl.pluginId}__*`).map(exclusive("table")),
];
