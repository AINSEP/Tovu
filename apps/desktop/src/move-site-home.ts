/** Thin CLI adapter: the website process owns stopped SQLite admission and verified relocation. */
import { execFileBuffered } from "@jini-ai/platform/shell";
import { buildCliEnv, buildCliSpawnPlan, type CliMode } from "./tovu-server.ts";

/** Invoke the same move owner in source and installed payloads; never load SQLite into Electron.
 * @returns Destination from the CLI's JSON contract; propagates its refusal without stopping a site.
 * @complexity One bounded subprocess; relocation cost belongs to the existing CLI owner.
 */
export async function moveSiteHome({ dir, repoRoot, cliMode, projectsPath }: { dir: string; repoRoot: string; cliMode: CliMode; projectsPath: string },
  { execute = execFileBuffered, baseEnv = process.env }: { execute?: typeof execFileBuffered; baseEnv?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const plan = buildCliSpawnPlan({ repoRoot, cliMode, cliArgs: ["sites", "move-home", dir, "--projects-path", projectsPath] });
  const env = buildCliEnv({ siteDir: dir, baseEnv });
  delete env.TOVU_ADMIN_PASSWORD;
  const result = await execute(plan.command, plan.args, { env, timeout: 1_200_000 });
  if (!result.ok) throw new Error(result.stderr || result.error?.message || "Could not move the stopped site.");
  const line = result.stdout.split(/\r?\n/).at(-1) ?? "";
  const value = JSON.parse(line) as { to?: unknown };
  if (typeof value.to !== "string") throw new Error("Site move returned no destination.");
  return value.to;
}
