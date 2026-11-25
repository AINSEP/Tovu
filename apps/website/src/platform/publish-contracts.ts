import type { PresentationSettingsRepoPort } from "@jini-ai/cms/presentation";

/**
 * @file Host-owned publish and trash contracts that more than one feature names.
 *
 * These types used to live in `features/post/post-trash.ts` (and `features/theme`), which forced the
 * publish bag (`features/publish-content/tovu-publish-ports.ts`) and the widget host ports
 * (`features/widgets/deps.ts`) to import another feature's file just to spell a callback shape. A
 * feature-to-platform type import is outside the cross-feature pair rule; the composition root still
 * binds every implementation.
 */

/**
 * The delete primitive this domain is handed, rather than one it implements.
 *
 * Structurally typed ON PURPOSE — this file imports nothing from `features/trash`, and must not.
 * The composition root binds the real implementation (which stamps the marker AND indexes the item
 * for the Trash screen, as one transaction) and hands it in already bound to this domain's entity
 * type, so `deletePost` never learns that a Trash exists. The only thing it knows is that removal
 * is somebody else's single, atomic write.
 *
 * `display` is REQUIRED because the caller already holds the record — it loaded it for its own
 * not-found check — so the two strings the Trash screen shows come from columns, with no second
 * read and no payload parse. That is what keeps a post with unparseable `body_json` deletable.
 */
export type RemovePostFn = (required: {
  workspaceId: string;
  id: string;
  display: { title: string; subtitle?: string | null };
  at: string;
  expectedVersion: number | null;
  actor: { principalId: string; pluginId?: string | null };
}) => Promise<{ ok: true; version: number | null } | { ok: false; reason: "not-found" | "version-changed" }>;

/**
 * Drops whatever index row some other owner wrote when this post's removal was recorded.
 *
 * Structurally typed and injected, exactly like {@link RemovePostFn}, so this domain still imports
 * nothing from the module that owns that index. A no-op for an entity that was never indexed, so a
 * caller that cannot tell never has to decide.
 */
export type ForgetRemovedPostFn = (required: { workspaceId: string; id: string }) => Promise<void>;

/**
 * The read-only slice of a discovered theme that the publish bag's `active-theme` port reads:
 * enough to tell whether a theme is installed and writable, where its tree lives, and its display
 * name. Every full `DiscoveredTheme` (`features/theme/theme.ts`) satisfies it structurally, so the
 * host hands in its own live `RouteDeps.themes` array — never a copy, because `rescanThemes` refills
 * that array in place after `theme-files` applies and the active-theme apply must see the result.
 */
export interface DiscoveredThemeView {
  readonly status: "valid" | "invalid";
  readonly dir: string;
  readonly css: string;
  readonly manifest: { readonly id: string; readonly name?: unknown };
}

/** The publish bag's `active-theme` slice. `themes` is the root's live array (`rescanThemes` refills it
 *  in place after `theme-files` applies). */
export interface ActiveThemePublishPorts {
  readonly presentation: PresentationSettingsRepoPort;
  readonly themes: readonly DiscoveredThemeView[];
}
