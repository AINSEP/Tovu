import { ApiError, describeApiError as describeApiErrorDefault, type AdminAgentPlugin, type AdminPlugin, type AdminPluginFiles, type AdminPluginPackageFile } from "../../lib/api";
import { t } from "./plugins-i18n";
import type { Translate } from "@/lib/dictionary-translator";
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

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`). Covers both this
 *  screen's routes: `PLUGIN_SET_ENABLED`'s three codes (unchanged) plus `PLUGIN_UNINSTALL`'s four
 *  (`PLUGIN_NOT_FOUND` is shared verbatim between both routes' error envelopes, so it needed no
 *  second entry) — see `server/inbound/admin-http/routes/plugins/uninstall.ts`'s own
 *  `sendPluginUninstallError` for the source of truth these four messages translate.
 *
 *  A `Map`, not an object literal: a server code that happens to name an `Object.prototype` member
 *  (`"toString"`) must fall through to the default, not resolve to a function. */
const PLUGIN_ERROR_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["PLUGIN_NOT_FOUND", "No plugin with that id is installed."],
  ["PLUGIN_INVALID", "This plugin failed validation and cannot be enabled."],
  ["PLUGIN_INCOMPATIBLE", "This plugin requires a different SDK version."],
  ["PLUGIN_NOT_UNINSTALLABLE", "This plugin ships with Tovu and cannot be removed."],
  ["PLUGIN_ENABLED", "This plugin is enabled and must be disabled everywhere before it can be removed."],
  ["PLUGIN_ID_INVALID", "This plugin's id is invalid."],
]);

/** Maps this screen's two calls' error codes to `errors.spec.md`'s operator-facing guidance text
 * (ui.spec.md §8), falling back to the server's own message.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.code !== undefined) {
    const override = PLUGIN_ERROR_MESSAGES.get(e.code);
    if (override !== undefined) return override;
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
 * The Installed tab's own scope (2026-09-09 tab split) — plugins this workspace has actually
 * turned on. Downloaded (every plugin `PLUGINS_LIST` returns, unfiltered) and Installed read the
 * exact same underlying list; this filter is the one line of difference between them, kept as its
 * own named, independently testable function rather than an inline `.filter()` repeated in a
 * `.tsx` panel — mirrors `filterEnabledAgentPlugins`'s identical role for the sibling screen.
 *
 * `null` in, `null` out: a `null` `plugins` means the initial load hasn't settled yet, a fact about
 * the LOAD rather than about which rows are enabled — collapsing it to `[]` here would make
 * `Plugins.tsx` unable to tell "still loading" from "loaded, and none are enabled".
 *
 * @complexity Time O(n) in `plugins.length`; space O(k) for the k enabled rows kept.
 */
export function filterInstalledPlugins(plugins: AdminPlugin[] | null): AdminPlugin[] | null {
  return plugins ? plugins.filter((plugin) => plugin.enabled) : null;
}

/**
 * The row's one-line subline, shown under its name/version heading and repeated inside its
 * expander's own quarantine/errors context: `source · tier · status` (e.g. `"site · tier-3 ·
 * valid"`). `AdminPlugin` has no free-text description field (unlike `AdminAgentPlugin`), so this
 * is built from the trust/health signal the type already carries rather than inventing prose.
 * Values are rendered verbatim, not translated — `plugin.source`/`tier`/`status` are domain
 * enum values, not copy, matching how the pre-split table rendered them (no `t()` wrapping there
 * either).
 *
 * @complexity O(1).
 */
export function pluginSubline(plugin: AdminPlugin): string {
  return `${plugin.source} · ${plugin.tier} · ${plugin.status}`;
}

/**
 * The Downloaded tab's Remove button `aria-label` — every row's button reads "Remove" identically,
 * so the plugin's own name has to be in the accessible name for anything reading the accessibility
 * tree to tell rows apart (same reasoning {@link pluginToggleAriaLabel} gives for the Installed
 * tab's switch). Reads "unavailable" for a built-in row instead of naming an action nobody can
 * take — `PLUGIN_NOT_UNINSTALLABLE`'s reason lives in the section note the disabled button's
 * `aria-describedby` points at (`AgentPluginRow`'s own honest-disabled idiom), not repeated here.
 *
 * @complexity O(1).
 */
export function pluginRemoveAriaLabel(plugin: AdminPlugin, locale: string): string {
  return plugin.source === "built-in"
    ? `${t(locale, "Remove")} ${plugin.name} — ${t(locale, "unavailable")}`
    : `${t(locale, "Remove")} ${plugin.name}`;
}

/** {@link buildPluginRemoveConfirmCopy}'s two pieces of copy — same `{ title, body }` shape as
 *  `features/settings/rules.ts`'s `RemoveConfirmCopy`, the precedent this dialog mirrors. */
export interface PluginRemoveConfirmCopy {
  title: string;
  body: string;
}

/**
 * Names the exact plugin in the title (an operator managing several installed plugins must see
 * WHICH one they are about to lose), and states plainly in the body what Remove actually does here:
 * unlike `AgentPluginDisableConfirmDialog`'s "Disable" (a reversible state flip — nothing on this
 * screen can genuinely delete an Agent Plugin), this button drives the real
 * `DELETE /workspaces/:id/plugins/:pluginId` route (`uninstallPlugin()`,
 * `features/plugin-runtime/uninstall.ts`) — it deletes the plugin's on-disk artifact outright, not
 * a reversible flag. The body says so in the owner's own required terms: this deletes the plugin's
 * files from this site, cannot be undone, and reinstalling starts from scratch.
 *
 * @complexity Time/space: O(1) — no iteration.
 */
export function buildPluginRemoveConfirmCopy(params: { name: string }): PluginRemoveConfirmCopy {
  return {
    title: `Remove "${params.name}" from this site?`,
    body:
      "This deletes the plugin's files from this site. This cannot be undone — reinstalling starts from scratch.",
  };
}

/**
 * Title-cases a kebab-case Agent Plugin id into a human display name (`"site-compliance"` ->
 * `"Site Compliance"`) — `AGENT_PLUGINS_LIST` (`server/inbound/admin-http/routes/agent-plugins/
 * list.ts`) reports only `pluginId`, never a separate hand-curated `displayName` the way the old,
 * now-deleted `TOVU_BUNDLED_AGENT_PLUGINS` catalog did, so `AgentPlugins.tsx` needs a pure
 * formatting step rather than a stored field. Mirrors `tool-registrations.ts`'s server-side
 * `humanize()` (same transform, independently kept per that file's own "private formatting helper
 * of a sibling module" precedent — see its header) — that copy has no override map of its own; it
 * feeds an LLM-facing tool description, a different surface this pass did not touch.
 *
 * Checks {@link AGENT_PLUGIN_DISPLAY_NAME_OVERRIDES} first and falls back to the id-derived
 * transform below for every id without an entry, so most ids never need a map entry at all.
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

/**
 * Hand-curated display names for the rare id whose id-derived title-case reads wrong rather than
 * merely plain. `humanizeAgentPluginId` consults this first; every id without an entry falls
 * through unchanged to the generic transform.
 *
 * `"tovu-deploy-fly"` -> `"Fly.io Deploy"`: the id-derived title-case is `"Tovu Deploy Fly"`, which
 * neither leads with the actual product this plugin deploys to (Fly.io, the hosting provider) nor
 * spells its name — no acronym-list-style rule can produce a mid-word "." (owner correction,
 * 2026-09-10, reported as unreadable on the one screen whose job is recognizing a package at a
 * glance). Kept as a map rather than a special-cased branch so a second override never means a
 * second `if`.
 */
const AGENT_PLUGIN_DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "tovu-deploy-fly": "Fly.io Deploy",
};

export function humanizeAgentPluginId(pluginId: string): string {
  const override = AGENT_PLUGIN_DISPLAY_NAME_OVERRIDES[pluginId];
  if (override !== undefined) return override;
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

/** {@link buildAgentPluginDisableConfirmCopy}'s two pieces of copy — same `{ title, body }` shape as
 *  `features/settings/rules.ts`'s `RemoveConfirmCopy`, the precedent this dialog mirrors. */
export interface AgentPluginDisableConfirmCopy {
  title: string;
  body: string;
}

/**
 * Names the exact plugin in the title (an operator with several installed must see WHICH one is
 * about to stop reaching the assistant), and states in the body what disabling actually does and
 * does not do: it is reversible (the package stays on disk and can be re-enabled), unlike
 * `features/settings/rules.ts`'s `buildExternalMcpRemoveConfirmCopy` counterpart, whose "Remove"
 * discards a sealed credential for good.
 *
 * `variant` is the SAME underlying operation (`AGENT_PLUGIN_SET_ENABLED` with `enabled: false`)
 * asked for from two different controls, added when Downloaded's row lost its Enable/Disable switch
 * in favor of a single Remove/Enable action (2026-09-09 — see `AgentPlugins.tsx`'s own header):
 *   - `"disable"` — Installed tab's switch. Confirm reads "Disable"; the row it guards already says
 *     "Enabled"/"Disabled", so naming the same verb keeps the dialog consistent with the control.
 *   - `"remove"` — Downloaded tab's action button. Confirm reads "Remove" to match that button, but
 *     the body's bundled-package sentence is reused VERBATIM across both — the fact that this can't
 *     actually delete anything doesn't change based on which control asked.
 *
 * The bundled-package sentence is unconditional rather than gated on a per-plugin flag: every
 * Agent Plugin installed today ships bundled with Tovu (`AGENT_PLUGINS_LIST`'s three rows are all
 * `origin: "bundled"` — see `AgentPluginRow`'s own header on why its uninstall button is honestly
 * disabled for the same reason), and `AdminAgentPlugin` does not expose `origin` to this screen at
 * all. Stating it as a plugin-specific conditional would require inventing that field; stating it
 * as a fact true of every row today does not. This sentence will need to become conditional once
 * `installAgentPluginFromUrl` gains a production caller and `origin` reaches the wire — tracked
 * here rather than silently assumed permanent.
 *
 * @complexity Time/space: O(1) — one ternary, no iteration.
 */
export function buildAgentPluginDisableConfirmCopy(params: {
  name: string;
  variant: "disable" | "remove";
}): AgentPluginDisableConfirmCopy {
  const bundledFact = "This package ships with Tovu — it can't be deleted outright, only turned off.";
  if (params.variant === "remove") {
    return {
      title: `Remove ${params.name}?`,
      body:
        "This turns it off: its skills stop reaching the assistant on the next run, and it drops off the Installed tab. " +
        `It stays right here on Downloaded and can be enabled again any time. ${bundledFact}`,
    };
  }
  return {
    title: `Disable ${params.name} for this site?`,
    body: `Its skills stop reaching the assistant on the next run. The package stays on disk and can be enabled again. ${bundledFact}`,
  };
}

/**
 * The Downloaded tab's own remove/enable action button `aria-label` — same reasoning as
 * {@link agentPluginToggleAriaLabel} for the Installed tab's switch: every row's button reads
 * "Remove"/"Enable" identically, so the plugin's own name has to be in the accessible name for
 * anything reading the accessibility tree to tell rows apart.
 *
 * Reads "Remove" for a currently-enabled row (Downloaded's stand-in for the switch's "on" state —
 * see `AgentPlugins.tsx`'s own header for why Downloaded dropped the switch) and "Enable" for a
 * currently-disabled one, mirroring {@link agentPluginToggleAriaLabel}'s own verb choice exactly so
 * the two tabs describe the same underlying states in the same words.
 *
 * @complexity O(1).
 */
export function agentPluginRemoveOrEnableAriaLabel(plugin: { pluginId: string; enabled: boolean }, locale: string): string {
  const verb = plugin.enabled ? t(locale, "Remove") : t(locale, "Enable");
  return `${verb} ${humanizeAgentPluginId(plugin.pluginId)}`;
}

/**
 * One row of the shared package-files viewer (`PackageFilesModal.tsx`), whichever screen fed it:
 * Agent Plugins' catalog entries fit as they are; `PLUGIN_FILES` entries go through
 * {@link toPackageFileView}.
 */
export interface PackageFileView {
  readonly relativePath: string;
  /** `null` when the file is listed but its content is not shown. */
  readonly content: string | null;
  /** Why `content` is `null`, shown in its place. */
  readonly unavailableReason?: string | null;
}

/** What the viewer's content pane says while no file is selected. */
export interface PackageFilesStatus {
  readonly text: string;
  /** `alert` for a load failure; `status` for loading or an empty package. */
  readonly role: "status" | "alert";
}

/** English source strings (the i18n keys) for each `PLUGIN_FILES` omission reason. */
const PACKAGE_FILE_OMISSION_NOTICES: Record<NonNullable<AdminPluginPackageFile["omitted"]>, string> = {
  binary: "Binary file — not shown.",
  "too-large": "Too large to show here.",
  symlink: "Symbolic link — not followed.",
  unreadable: "This file could not be read.",
};

/**
 * Maps one `PLUGIN_FILES` entry onto a viewer row. An omitted file keeps its place in the list and
 * says why it has no content; a reason this client does not know yet (or a contract-breaking
 * `null` content) reads as unreadable instead of rendering blank.
 * @complexity O(1).
 */
export function toPackageFileView(file: AdminPluginPackageFile, translate: Translate): PackageFileView {
  if (file.omitted === null && file.content !== null) return { relativePath: file.relativePath, content: file.content };
  const notice = (file.omitted && PACKAGE_FILE_OMISSION_NOTICES[file.omitted]) || PACKAGE_FILE_OMISSION_NOTICES.unreadable;
  return { relativePath: file.relativePath, content: null, unavailableReason: translate(notice) };
}

/**
 * The content pane's message before a file can be selected: a failure wins, then loading, then an
 * empty package.
 * @complexity O(1).
 */
export function packageFilesStatus(
  input: { loading: boolean; error: string | null; fileCount: number },
  translate: Translate,
): PackageFilesStatus | null {
  if (input.error !== null) return { text: input.error, role: "alert" };
  if (input.loading) return { text: translate("Loading package files…"), role: "status" };
  if (input.fileCount === 0) return { text: translate("No files to show for this plugin."), role: "status" };
  return null;
}

/** Set only when `PLUGIN_FILES` reports its caps cut the listing short.
 *  @complexity O(1). */
export function packageFilesListNotice(listing: Pick<AdminPluginFiles, "truncated"> | null, translate: Translate): string | null {
  return listing?.truncated ? translate("Some files are not listed: this package is larger than the viewer's limits.") : null;
}
