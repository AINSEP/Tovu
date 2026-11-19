import { type DiscoveredTheme } from "./theme.js";


/**
 * Model-facing theme view. Drops `templates`/`liquidTemplates`/`handlebarsTemplates`/`css` (whole
 * file bodies — an agent asks for those one at a time through `theme_read_file`, and dumping every
 * template of every theme into a list response would swamp a context window for no gain) and `dir`
 * (an absolute host path; the agent addresses themes by id, and leaking the server's filesystem
 * layout into a model response serves nothing). Keeps `errors` in full: it is the entire feedback
 * signal this domain exists to deliver.
 *
 * `author`/`build` (ADR-020 §5, 2026-08-12) surface WHETHER a theme is a built release before the
 * agent ever tries to write into it — trimmed to `source`/`framework`/`sourceDir` (the fields that
 * actually decide what `theme_write_file` will accept, per `resolveThemeFileWriteScope`), dropping
 * `builderVersion`/`lockfileHash`/`artifactHashes` as support/integrity metadata an editing agent has
 * no use for. Without this an agent only learns a theme is built by having a write rejected mid-turn;
 * with it, `theme_list` turns that into something it can plan around up front. Absent for every theme
 * on disk today (authored, unchanged).
 */
export function toThemeToolView(theme: DiscoveredTheme) {
  return {
    id: theme.manifest.id,
    name: theme.manifest.name,
    version: theme.manifest.version,
    tier: theme.manifest.tier,
    description: theme.manifest.description,
    ...(theme.manifest.author !== undefined ? { author: theme.manifest.author } : {}),
    ...(theme.manifest.build !== undefined
      ? {
          build: {
            source: theme.manifest.build.source,
            ...(theme.manifest.build.framework ? { framework: theme.manifest.build.framework } : {}),
            ...(theme.manifest.build.sourceDir ? { sourceDir: theme.manifest.build.sourceDir } : {}),
          },
        }
      : {}),
    source: theme.source,
    status: theme.status,
    errors: theme.errors,
  };
}
