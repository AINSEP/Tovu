import { ApiError, describeApiError as describeApiErrorDefault, type AdminAgentPlugin, type AdminPlugin } from "../../lib/api";
import { t } from "./plugins-i18n";
import type { AgentPluginGlyphKind } from "./agent-plugins-visuals";

/**
 * @file Pure logic for the `plugins` feature — everything that computes a value rather than
 * rendering one. Follows the `posts/rules.ts` convention: no React import, no hooks, directly
 * testable.
 *
 * Moved here from `Plugins.tsx`: the screen's own `describeApiError` override, and the toggle
 * cell's visibility/label decision (`pluginToggleControl`) — previously an inline double ternary
 * inside a `DataTable` cell closure, reachable only by rendering the table.
 */

/** Maps this screen's two calls' error codes to `errors.spec.md`'s operator-facing guidance text
 * (ui.spec.md §8), falling back to the server's own message.
 *
 * @complexity O(1).
 * @overallScore 100
 */
/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`). */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "PLUGIN_NOT_FOUND") return "No plugin with that id is installed.";
    if (e.code === "PLUGIN_INVALID") return "This plugin failed validation and cannot be enabled.";
    if (e.code === "PLUGIN_INCOMPATIBLE") return "This plugin requires a different SDK version.";
  }
  return describeApiErrorDefault(e, fallback);
}

/** What the "Enabled" cell should show for one row — `visible: false` for AC-21 (enabling this row
 *  is already known to 422, so no enable-capable control is offered at all; `Roles.tsx`'s
 *  built-in-row `—` idiom). The caller renders `visible` as a plain ternary (button vs. the muted
 *  `—` fallback) on this already-computed result.
 *
 * @complexity O(1).
 */
export interface PluginToggleControl {
  visible: boolean;
  disabled: boolean;
  label: string;
}

export function pluginToggleControl(plugin: AdminPlugin, rowSavingId: string | null, locale: string): PluginToggleControl {
  if (!(plugin.enabled || plugin.status === "valid")) {
    return { visible: false, disabled: false, label: "" };
  }
  const savingThisRow = rowSavingId === plugin.id;
  return {
    visible: true,
    disabled: savingThisRow,
    // The busy-state "…" is locale-neutral (no established translated bare-ellipsis precedent
    // elsewhere in this app — every other busy label pairs it with a word, e.g. posts-i18n.ts's
    // "Creating…") and stays untranslated here on purpose.
    label: savingThisRow ? "…" : plugin.enabled ? t(locale, "Disable") : t(locale, "Enable"),
  };
}

/**
 * The toggle button's `aria-label` — every row's button reads "Enable"/"Disable"/"…" on its own,
 * identical across every plugin, so a screen reader or a generic browser agent reading the
 * accessibility tree (roles + accessible names — not this repo's own `agentHandle()`, whose
 * `label` option is a private `data-agent-label` attribute neither one can see) has no way to tell
 * one row's control from another's without the plugin's own name in the accessible name.
 *
 * Names the target action (Enable/Disable), not the transient "…" busy word — the visible "…" plus
 * `disabled` already signal in-flight to a sighted operator, and an accessible name that kept
 * switching between "…" and a real verb mid-interaction would be a worse read than one that stays
 * "Enable {name}"/"Disable {name}" throughout.
 *
 * @complexity O(1).
 */
export function pluginToggleAriaLabel(plugin: AdminPlugin, locale: string): string {
  return `${plugin.enabled ? t(locale, "Disable") : t(locale, "Enable")} ${plugin.name}`;
}

/**
 * Title-cases a kebab-case Agent Plugin id into a human display name (`"site-compliance"` ->
 * `"Site Compliance"`) — `AGENT_PLUGINS_LIST` (`server/inbound/admin-http/routes/agent-plugins/
 * list.ts`) reports only `pluginId`, never a separate hand-curated `displayName` the way the old,
 * now-deleted `TOVU_BUNDLED_AGENT_PLUGINS` catalog did, so `AgentPlugins.tsx` needs a pure
 * formatting step rather than a stored field. Mirrors `tool-registrations.ts`'s server-side
 * `humanize()` (same transform, independently kept per that file's own "private formatting helper
 * of a sibling module" precedent — see its header).
 *
 * @complexity O(n) in `pluginId`'s length.
 */
/**
 * Segments that are acronyms, not words. Title-casing these produced "Ui Ux Design" for the
 * installed `ui-ux-design` package (2026-09-09, seen rendered) — a name an operator has to decode
 * rather than recognize, on the one screen whose whole job is recognizing a package at a glance.
 *
 * A closed list, not a heuristic: no rule distinguishes the acronym "ui" from a hypothetical word
 * segment, and inventing one would eventually shout a real word in capitals.
 */
const AGENT_PLUGIN_ID_ACRONYMS = new Set([
  "ai", "api", "cli", "css", "html", "http", "id", "io", "json", "mcp", "rss", "sdk", "seo", "sql", "ui", "url", "ux", "yaml",
]);

export function humanizeAgentPluginId(pluginId: string): string {
  return pluginId
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) =>
      AGENT_PLUGIN_ID_ACRONYMS.has(part.toLowerCase())
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

/**
 * Vocabulary -> glyph family, in evaluation order. Ordered rather than a flat map because a package
 * can legitimately match two families, and a stable first-match beats whichever key an object
 * happened to iterate first.
 *
 * Matching is on whole words only. A substring match would classify any id containing "ui" —
 * `build-ui`, but also `guide-something` — as a design package.
 */
const AGENT_PLUGIN_GLYPH_VOCABULARY: ReadonlyArray<readonly [AgentPluginGlyphKind, readonly string[]]> = [
  ["compliance", ["compliance", "privacy", "gdpr", "ccpa", "cpra", "consent", "security", "audit", "wcag", "accessibility"]],
  ["deploy", ["deploy", "deployment", "hosting", "release", "ship", "production", "ci", "fly"]],
  ["design", ["design", "ui", "ux", "uiux", "theme", "brand", "visual"]],
  ["integration", ["mcp", "integration", "connector", "webhook", "api"]],
  ["content", ["docs", "documentation", "content", "writing", "copy", "blog"]],
];

/** Lowercase whole-word tokens of one string. */
function glyphTokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

/** First vocabulary family any of `tokens` matches, or `undefined`. */
function matchGlyphKind(tokens: ReadonlySet<string>): AgentPluginGlyphKind | undefined {
  for (const [kind, vocabulary] of AGENT_PLUGIN_GLYPH_VOCABULARY) {
    if (vocabulary.some((word) => tokens.has(word))) return kind;
  }
  return undefined;
}

/**
 * Which glyph identifies one Agent Plugin in the installed list.
 *
 * Derived from the package's OWN vocabulary rather than from an allowlist of known plugin ids. An
 * id allowlist is exactly what `AGENT_PLUGINS_LIST` just replaced (the hardcoded
 * `TOVU_BUNDLED_AGENT_PLUGINS` catalog), and reintroducing one here would mean a future installed
 * plugin renders with no glyph until someone remembers to add it.
 *
 * The three sources are consulted in TIERS — id, then keywords, then skill names — not merged into
 * one bag. Merging is what the first attempt did, and it put the same shield on `site-compliance`
 * and `ui-ux-design`: the latter's `frontend-accessibility` skill matched the compliance family
 * before anything in its own id was considered, so the two packages this list most needs to tell
 * apart rendered identically. A package's own NAME is the strongest statement of what it is; a
 * skill it happens to bundle is the weakest.
 *
 * Falls back to `"package"` — a deliberately generic glyph — when nothing matches. Guessing a
 * themed icon for an unrecognized package would assert a category Tovu has no evidence for.
 *
 * @complexity O(k * w) over the package's own token count and the vocabulary size — both small,
 * and computed once per row render.
 */
export function agentPluginGlyphKind(plugin: {
  pluginId: string;
  keywords: readonly string[];
  skills: ReadonlyArray<{ name: string }>;
}): AgentPluginGlyphKind {
  const tiers: ReadonlyArray<readonly string[]> = [
    glyphTokens(plugin.pluginId),
    plugin.keywords.flatMap(glyphTokens),
    plugin.skills.flatMap((skill) => glyphTokens(skill.name)),
  ];

  for (const tier of tiers) {
    const kind = matchGlyphKind(new Set(tier));
    if (kind !== undefined) return kind;
  }
  return "package";
}

/**
 * The enable/disable switch's `aria-label`. Same reasoning as {@link pluginToggleAriaLabel} for the
 * sibling screen: every row's switch reads "Enable"/"Disable" identically, so without the plugin's
 * own name in the accessible name, nothing reading the accessibility tree can tell one row's
 * control from another's.
 *
 * Names the target action, not the current state, and never the transient busy state — a `role`
 * of `switch` already publishes the current position through `aria-checked`, and an accessible name
 * that flipped mid-interaction would read worse than one that stays put.
 *
 * @complexity O(1).
 */
export function agentPluginToggleAriaLabel(plugin: { pluginId: string; enabled: boolean }, locale: string): string {
  const verb = plugin.enabled ? t(locale, "Disable") : t(locale, "Enable");
  return `${verb} ${humanizeAgentPluginId(plugin.pluginId)}`;
}

/**
 * The Installed tab's own scope. Downloaded (every package on disk for this workspace) and
 * Installed (only the rows an operator has actually turned on) read the exact same underlying
 * list — this filter is the one line of difference between them, kept as its own named,
 * independently testable function rather than an inline `.filter()` repeated in a `.tsx` panel.
 *
 * `null` in, `null` out: a `null` `agentPlugins` means the initial load hasn't settled yet, which
 * is a fact about the LOAD, not about which rows are enabled — collapsing it to `[]` here would
 * make `AgentPlugins.tsx` unable to tell "still loading" from "loaded, and none are enabled".
 *
 * @complexity Time O(n) in `agentPlugins.length`; space O(k) for the k enabled rows kept.
 */
export function filterEnabledAgentPlugins(agentPlugins: AdminAgentPlugin[] | null): AdminAgentPlugin[] | null {
  return agentPlugins ? agentPlugins.filter((plugin) => plugin.enabled) : null;
}
