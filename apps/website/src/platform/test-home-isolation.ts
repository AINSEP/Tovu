import os from "node:os";
import path from "node:path";

/** Refuse owner-home storage in node:test processes and their inherited children before I/O.
 * userInfo ignores HOME; an isolated HOME must not hide an owner app-data/root override.
 * Checkout source roots remain valid; the protected paths are the owner's Tovu storage roots.
 * Real runs retain the ordinary OS-home default. O(n) time/space in paths.
 */
export function assertTestHomeIsolation({ homeDir }: { homeDir: string }, { paths = [] }: { paths?: readonly string[] } = {}): void {
  if (!process.env.NODE_TEST_CONTEXT) return;
  const realHome = path.resolve(os.userInfo().homedir);
  const protectedRoots = [".tovu", "Documents/Tovu", "Tovu", "Tovu Sites", "Library/Application Support/Tovu",
    "AppData/Roaming/Tovu", ".local/share/Tovu", ".config/Tovu"].map((root) => path.resolve(realHome, root));
  const within = (root: string, target: string) => {
    const relative = path.relative(root, path.resolve(target));
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  if (path.resolve(homeDir) === realHome || [homeDir, ...paths].some((target) =>
    path.resolve(target) === realHome || protectedRoots.some((root) => within(root, target)))) {
    throw new Error("Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.");
  }
}

