import { PLUGIN_SDK_SPECIFIER, pluginManifestFilenames, type PluginManifestReadOptions } from "@jini-ai/plugins/host";

/**
 * @file Tovu's site-plugin compatibility vocabulary: the N-1 manifest filename and SDK specifier the
 * engine no longer knows by name. Why: plugins packaged before the canonical names still ship
 * `tovu.plugin.json` and import `@tovu/sdk`; install, worker load and backup must all read them the
 * same way, so they take these values from this one side-effect-free module.
 */

/** Manifest read policy: the canonical manifest first, then the legacy Tovu manifest name. */
export const TOVU_SITE_PLUGIN_MANIFEST_READ = { legacyManifestFilenames: ["tovu.plugin.json"] } as const satisfies PluginManifestReadOptions;

/** The legacy SDK bare specifier; the bundled backing package keeps this workspace name for `require.resolve`. */
export const TOVU_LEGACY_PLUGIN_SDK_SPECIFIER = "@tovu/sdk";

/** Every SDK specifier a site plugin may import, matched exactly by the resolver and the tier-2 worker. */
export const TOVU_SITE_PLUGIN_SDK_SPECIFIERS = [PLUGIN_SDK_SPECIFIER, TOVU_LEGACY_PLUGIN_SDK_SPECIFIER] as const;

/** Manifest filenames a site-plugin package may carry, canonical first. */
export const TOVU_SITE_PLUGIN_MANIFEST_FILENAMES = pluginManifestFilenames({}, TOVU_SITE_PLUGIN_MANIFEST_READ);
