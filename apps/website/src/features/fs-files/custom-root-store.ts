import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

/**
 * @file The operator-set custom filesystem root — backs the third {@link FsRootId} `"custom"`
 * (`layout.ts`), holding whatever absolute directory the human operator has pointed the assistant at
 * through the chat composer's folder control (`apps/admin`'s `AssistantDock`), independent of the
 * `repo`/`site` roots.
 *
 * ## Path only, nothing read (2026-09-10 owner decision)
 *
 * "when we upload a folder we don't upload everything in the folder, that's disastrous, we are
 * uploading the filepath" — the owner's own words. {@link setCustomFsRoot} captures the path and
 * nothing else: the single `stat`/`realpath` call below confirms the entry's own existence and kind,
 * the same metadata `ls -d` would show, and touches nothing inside it. No file under the folder is
 * read, copied, indexed, or walked at set time, so a 76 GB folder costs exactly what an empty one
 * does until a later `fs_list_files`/`fs_read_file` call names a specific path — and THAT call
 * re-validates containment and the denylist independently of this module ever having been called
 * correctly, identical to how `repo`/`site` are re-checked (see `fs-files.ts`'s header).
 *
 * ## Deliberately in-memory, one value per running process
 *
 * A module-level scalar, not a per-workspace map keyed by `FsFilesToolDeps.workspaceId`: this
 * codebase already established "one site per process, resolved from `cwd`/`env`" as the project-wide
 * model (`layout.ts`'s `resolveFsRoots` takes an optional `cwd`/`env` override for tests, never a
 * workspace id), so tracking a second scoping axis here would invent a distinction nothing else in
 * this domain makes. Not persisted to disk: this is the smallest, most reversible slice that
 * satisfies "set a folder, read it" — the owner can re-point it in one composer action any time,
 * including after a `tsx-watch` reload wipes it. A persisted version (surviving process restarts) is
 * a natural follow-up once this shape is proven, not a requirement this slice needs to reach for.
 *
 * ## No permission model here, by design
 *
 * Every `fs_list_files`/`fs_read_file` call against the `custom` root passes through the exact same
 * `content.read`-gated `authorize()` check and the same denylist as `repo`/`site` (see
 * `tool-registrations.ts`), and the admin-http route that calls {@link setCustomFsRoot}
 * (`routes/fs-files/custom-root.ts`) is gated by that identical permission. Whoever may set this path
 * is already trusted with `content.read`; no separate grant/approval/confirmation ceremony exists for
 * the path itself, and none should be added here — seeding one back in would re-introduce exactly the
 * restrictiveness `layout.ts`'s header records the owner rejecting.
 */

/** Raised when a caller tries to set a path that cannot be an fs-files root — a shape rejection, not
 *  an internal error, so the admin-http route can echo it straight back to the composer UI. */
export class CustomFsRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomFsRootError";
  }
}

let customRootPath: string | undefined;

/**
 * The operator-set custom root's real absolute directory, or `undefined` when none has been set yet
 * in this process. {@link resolveFsRoots} (`layout.ts`) folds this into its `custom` entry on every
 * call, so a later {@link setCustomFsRoot} takes effect on the very next tool call — nothing caches
 * this value across the call.
 *
 * @complexity O(1).
 */
export function getCustomFsRoot(): string | undefined {
  return customRootPath;
}

/**
 * Sets (or, given `null`, clears) the operator-chosen custom root.
 *
 * Validates only the directory's own existence and kind — never its contents — before accepting it:
 * an absolute path that does not exist, or that names a file rather than a directory, is refused
 * immediately with a message the composer UI can surface directly, rather than accepted and left to
 * silently produce empty listings later. Resolves through `realpath` so a symlinked path is stored in
 * its canonical form, matching the form {@link resolveFsFilePath} in `fs-files.ts` compares every
 * subsequent request against.
 *
 * @param path - An absolute directory path, or `null` to clear the current custom root.
 * @throws {CustomFsRootError} If `path` is not absolute, does not exist, or is not a directory.
 * @complexity O(1) — one `stat`/`realpath` call, never proportional to the directory's contents.
 */
export function setCustomFsRoot(path: string | null): void {
  if (path === null) {
    customRootPath = undefined;
    return;
  }
  if (!isAbsolute(path)) {
    throw new CustomFsRootError(`'${path}' is not an absolute path`);
  }
  if (!existsSync(path)) {
    throw new CustomFsRootError(`'${path}' does not exist`);
  }
  if (!statSync(path).isDirectory()) {
    throw new CustomFsRootError(`'${path}' is not a directory`);
  }
  customRootPath = realpathSync(path);
}

/** Test-only reset of the module-level state — mirrors `resetToolContributorsForTests`'s identical
 *  reasoning: ordinary module state persists across tests in the same process otherwise. */
export function resetCustomFsRootForTests(): void {
  customRootPath = undefined;
}
