import type { OwnedTempRootFilesystem, OwnedTempRootLock, sweepOwnedTempRoots as SweepOwnedTempRoots } from "@jini-ai/platform/fs";
import type { RetentionPolicy } from "@jini-ai/platform/retention";

const DAY_MS = 86_400_000;
const EXACT_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The daily tidy of the site's owned temporary roots (`old-copy` class: disposable working folders).
 *
 * Only the named `{ parent, prefix }` pairs are read, and inside them only exact `<prefix><uuid>` names:
 * explicit export folders, `--out` targets, themes, foreign entries and pre-protocol leftovers never
 * enter deletion (the latter are reported only). A marked root is removed only when its owner is proven
 * dead through `fileLock`; age alone never removes anything. Scheduled passes only `measure`.
 * @param required.roots the same pairs the writers were bound to; @param required.signal stops a pass.
 * @param optional.graceMs minimum root age before the lock is even attempted (default one day).
 * @returns a retention policy. @complexity measure O(entries in the named parents); sweep O(entries) + O(20) lock attempts.
 */
export function createSiteTempRootPolicy(
  required: { roots: ReadonlyArray<{ parent: string; prefix: string }>; sweepOwnedTempRoots: typeof SweepOwnedTempRoots; fs: OwnedTempRootFilesystem; fileLock: OwnedTempRootLock; signal: AbortSignal },
  optional: { graceMs?: number } = {},
): RetentionPolicy {
  const { roots, fs, fileLock, signal } = required;
  const graceMs = optional.graceMs ?? DAY_MS;
  return {
    id: "temp-roots",
    kind: "old-copy",
    async measure() {
      let items = 0;
      for (const { parent, prefix } of roots) {
        const exact = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${EXACT_UUID}$`);
        items += (await fs.readdir(parent)).filter(name => exact.test(name)).length;
      }
      return { bytes: null, items };
    },
    async sweep({ now }) {
      const report = await required.sweepOwnedTempRoots({ roots, fs, lock: fileLock, clock: { nowMs: () => now }, signal }, { olderThanMs: graceMs });
      return { freedBytes: null, removed: report.entries.filter(entry => entry.outcome === "removed").length };
    },
  };
}
