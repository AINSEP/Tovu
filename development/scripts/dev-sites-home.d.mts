/** Types for `dev-sites-home.mjs`; see that file for the behaviour. */
export function devSitesHome(
  required: { repoRoot: string },
  optional?: { env?: NodeJS.ProcessEnv; homeDir?: string },
): { dir: string; warning: unknown; running: unknown };
