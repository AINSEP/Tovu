import { chmod, lstat, mkdir, readdir, realpath, rename, rm, rmdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";

export interface DirectoryTrashLocation {
  liveParent: string;
  liveNames: readonly string[];
  parkedDir: string;
}

export interface DirectoryTrashAdapterDeps {
  entityType: string;
  locate(required: { workspaceId: string; entityId: string }): DirectoryTrashLocation | Promise<DirectoryTrashLocation>;
  forget?(required: { workspaceId: string; entityId: string }): Promise<void>;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function validateLocation(location: DirectoryTrashLocation): void {
  const liveParent = resolve(location.liveParent);
  const parkedDir = resolve(location.parkedDir);
  const parkedRelative = relative(liveParent, parkedDir);
  if (parkedRelative === "" || (!parkedRelative.startsWith("..") && !isAbsolute(parkedRelative))) {
    throw new Error(`directory Trash parking path '${parkedDir}' must be outside live parent '${liveParent}'`);
  }
  for (const name of location.liveNames) {
    if (name === "" || name === "." || name === ".." || basename(name) !== name) {
      throw new Error(`directory Trash live name '${name}' must be one path segment`);
    }
  }
}

async function assertSameFilesystem(liveParent: string, parkedDir: string): Promise<void> {
  await mkdir(dirname(parkedDir), { recursive: true });
  const [live, parked] = await Promise.all([stat(liveParent), stat(dirname(parkedDir))]);
  if (live.dev !== parked.dev) {
    throw new Error(`directory Trash requires atomic rename on one filesystem: '${liveParent}' -> '${parkedDir}'`);
  }
  // Symlinks can defeat validateLocation's lexical check; the parking root must stay outside the
  // live parent after resolving them too.
  const [realLive, realParkedParent] = await Promise.all([realpath(liveParent), realpath(dirname(parkedDir))]);
  const realRelative = relative(realLive, realParkedParent);
  if (realRelative === "" || (!realRelative.startsWith("..") && !isAbsolute(realRelative))) {
    throw new Error(`directory Trash parking path '${parkedDir}' resolves inside live parent '${liveParent}'`);
  }
}

async function moveDir(from: string, to: string): Promise<void> {
  const entry = await lstat(from);
  if (entry.isSymbolicLink()) {
    await rename(from, to);
    return;
  }
  const originalMode = entry.mode & 0o7777;
  await chmod(from, originalMode | 0o700);
  let current = from;
  try {
    await rename(from, to);
    current = to;
  } catch (error) {
    if (errorCode(error) === "EXDEV") {
      throw new Error(`directory Trash cannot move '${from}' across filesystems`);
    }
    throw error;
  } finally {
    await chmod(current, originalMode);
  }
}

async function removeEmptyDir(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch (error) {
    if (!new Set(["ENOENT", "ENOTEMPTY"]).has(errorCode(error) ?? "")) throw error;
  }
}

async function makeTreeWritable(path: string): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink()) return;
  if (!entry.isDirectory()) {
    await chmod(path, entry.mode | 0o600);
    return;
  }
  await chmod(path, entry.mode | 0o700);
  for (const child of await readdir(path)) {
    await makeTreeWritable(join(path, child));
  }
}

async function parkedCount(parkedDir: string): Promise<number> {
  return Math.max(1, (await readdir(parkedDir)).length);
}

async function rollbackMoves(moved: readonly { from: string; to: string }[]): Promise<void> {
  for (const move of [...moved].reverse()) {
    if (await exists(move.from)) await moveDir(move.from, move.to);
  }
}

/**
 * Wraps a bound remove so a throw after the adapter already moved the folder (e.g. the Trash row
 * insert failed) best-effort moves it back before the error propagates. The Trash core has no
 * revert hook for filesystem adapters, so each composition root binds removal through this.
 */
export function unhideIfRemoveThrows<R extends { workspaceId: string; id: string; at: string }, T>(
  adapter: TrashAdapter,
  remove: (required: R) => Promise<T>,
): (required: R) => Promise<T> {
  return async (required) => {
    try {
      return await remove(required);
    } catch (error) {
      await adapter
        .unhide({ workspaceId: required.workspaceId, entityId: required.id, at: required.at, expectedVersion: null })
        .catch(() => {});
      throw error;
    }
  };
}

export function createDirectoryTrashAdapter(deps: DirectoryTrashAdapterDeps): TrashAdapter {
  async function locate(required: { workspaceId: string; entityId: string }): Promise<DirectoryTrashLocation> {
    const location = await deps.locate(required);
    validateLocation(location);
    return location;
  }

  return {
    entityType: deps.entityType,

    async hide(required): Promise<TrashMarkerResult> {
      const location = await locate(required);
      if (await exists(location.parkedDir)) {
        return { ok: false, reason: "blocked", code: "ALREADY_IN_TRASH", count: await parkedCount(location.parkedDir) };
      }
      if (location.liveNames.length === 0) return { ok: false, reason: "not-found" };
      for (const name of location.liveNames) {
        if (!(await exists(join(location.liveParent, name)))) return { ok: false, reason: "not-found" };
      }

      await assertSameFilesystem(location.liveParent, location.parkedDir);
      try {
        await mkdir(location.parkedDir);
      } catch (error) {
        if (errorCode(error) === "EEXIST") {
          return { ok: false, reason: "blocked", code: "ALREADY_IN_TRASH", count: await parkedCount(location.parkedDir) };
        }
        throw error;
      }

      const moved: { from: string; to: string }[] = [];
      try {
        for (const name of location.liveNames) {
          const from = join(location.liveParent, name);
          const to = join(location.parkedDir, name);
          try {
            await moveDir(from, to);
            moved.push({ from: to, to: from });
          } catch (error) {
            if ((await exists(to)) && !(await exists(from))) moved.push({ from: to, to: from });
            throw error;
          }
        }
      } catch (error) {
        await rollbackMoves(moved);
        await removeEmptyDir(location.parkedDir);
        if (errorCode(error) === "ENOENT") return { ok: false, reason: "not-found" };
        throw error;
      }
      return { ok: true, version: null };
    },

    async unhide(required): Promise<TrashMarkerResult> {
      const location = await locate(required);
      if (!(await exists(location.parkedDir))) return { ok: false, reason: "not-found" };
      const parkedNames = await readdir(location.parkedDir);
      if (parkedNames.length === 0) return { ok: false, reason: "not-found" };
      if (location.liveNames.length > 0) return { ok: false, reason: "version-changed" };
      for (const name of parkedNames) {
        if (await exists(join(location.liveParent, name))) return { ok: false, reason: "version-changed" };
      }

      await assertSameFilesystem(location.liveParent, location.parkedDir);
      const moved: { from: string; to: string }[] = [];
      try {
        for (const name of parkedNames) {
          const from = join(location.parkedDir, name);
          const to = join(location.liveParent, name);
          try {
            await moveDir(from, to);
            moved.push({ from: to, to: from });
          } catch (error) {
            if ((await exists(to)) && !(await exists(from))) moved.push({ from: to, to: from });
            throw error;
          }
        }
      } catch (error) {
        await rollbackMoves(moved);
        throw error;
      }
      await removeEmptyDir(location.parkedDir);
      return { ok: true, version: null };
    },

    async purge(required): Promise<TrashPurgeOutcome> {
      const location = await locate(required);
      if (!(await exists(location.parkedDir))) return "already-gone";
      const purgingDir = `${location.parkedDir}.purging-${randomUUID()}`;
      await rename(location.parkedDir, purgingDir);
      try {
        await deps.forget?.({ workspaceId: required.workspaceId, entityId: required.entityId });
      } catch (error) {
        await rename(purgingDir, location.parkedDir);
        throw error;
      }
      await makeTreeWritable(purgingDir);
      await rm(purgingDir, { recursive: true, force: true });
      return "purged";
    },
  };
}
