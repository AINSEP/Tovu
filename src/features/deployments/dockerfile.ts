import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @file The repo-root `Dockerfile`'s read/write access, extracted out of
 * `server/routes/admin/system/dockerfile-source.ts` (2026-08-15) so the new
 * `deployment_get_dockerfile`/`deployment_set_dockerfile` agent tools (`tool-registrations.ts` in
 * this directory) can read and write the exact same file the admin UI's Dockerfile tab does,
 * without either duplicating the path-resolution rule or creating a `features/deployments ->
 * server/routes/*` back-edge (see `export-run.ts`'s file header for the fuller argument — the same
 * reasoning applies here).
 *
 * Path safety is the entire risk surface of the write half: {@link DOCKERFILE_PATH} is a fixed,
 * hardcoded path with NO parameter anywhere in this module that could steer it. Neither function
 * below accepts a path argument at all — `writeDockerfileSource` takes only `contents`. There is
 * therefore no path-traversal input to sanitize because there is no path input in the first place;
 * every caller (the HTTP route and the agent tool) can only ever affect the file's CONTENTS, never
 * its LOCATION.
 *
 * `process.cwd()` is the resolution root, matching the original route's own rationale: `deps.ts`'s
 * `mediaUploadsDir()` fallback and `defaultContentDbPath()` both already assume the process runs
 * with its cwd at the Tovu repo root (true in dev and in the shipped image's `WORKDIR
 * /workspace/Tovu`), so this inherits an already-established convention rather than introducing a
 * new one.
 */

export interface DockerfileSourceSnapshot {
  exists: boolean;
  /** `null` when `exists` is false — never an empty string standing in for "missing". */
  contents: string | null;
}

/** The one path either function in this module ever touches — never derived from caller input. */
function dockerfilePath(): string {
  return join(process.cwd(), "Dockerfile");
}

/**
 * Reads the repo-root `Dockerfile`, or reports its absence.
 *
 * @complexity O(f) in the Dockerfile's own byte size — one existence check, one whole-file read.
 */
export function readDockerfileSource(): DockerfileSourceSnapshot {
  const path = dockerfilePath();
  if (!existsSync(path)) return { exists: false, contents: null };
  return { exists: true, contents: readFileSync(path, "utf8") };
}

/**
 * Overwrites the repo-root `Dockerfile` with `contents`, creating it if it does not exist yet.
 *
 * This ONLY writes bytes to disk — it does not build, validate as a Dockerfile, or trigger any
 * rebuild/redeploy of anything. A syntactically invalid Dockerfile is written as-is; no prior
 * contents are backed up by this function (callers who need the previous contents should read them
 * first via {@link readDockerfileSource}).
 *
 * @param contents - The full replacement contents. Not validated as Dockerfile syntax — this is a
 * raw file write, the same trust level a human editing the file directly already has.
 * @returns The snapshot the file now has, for a caller to echo back without a second read.
 * @complexity O(c) in `contents`' own byte size — one whole-file write.
 */
export function writeDockerfileSource(contents: string): DockerfileSourceSnapshot {
  writeFileSync(dockerfilePath(), contents, "utf8");
  return { exists: true, contents };
}
