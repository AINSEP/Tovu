/** Tovu discovery is for folders of websites, never a whole user account or volume. */
import os from 'node:os';
import path from 'node:path';

/** Refuse obvious broad roots before filesystem access (including Windows/UNC spellings).
 * @returns Nothing for a specific folder.
 * @throws Error with the folder-picker remedy when the root is broad.
 * @complexity O(n) in the path length, with no filesystem probes.
 */
export function assertSpecificSiteRoot({ root }: { root: string }, { homeDir = os.homedir(), sitesHome }: { homeDir?: string; sitesHome?: string } = {}): void {
  const normalized = normalizeRoot(root);
  const home = trimSlashes(homeDir);
  // The selected local fallback has one known Tovu parent at the former level. This narrow
  // application folder can be scanned without admitting unrelated direct home children.
  if (normalized === `${home}/Tovu` && sitesHome !== undefined && trimSlashes(sitesHome) === `${normalized}/sites`) return;
  if (isBroadRoot(normalized, home)) throw new Error(`Sites folder is too broad: ${root}. Choose a specific folder containing your Tovu websites.`);
}

function trimSlashes(value: string): string {
  const spelling = value.replaceAll('\\', '/');
  let end = spelling.length;
  while (end > 0 && spelling[end - 1] === '/') end--;
  return spelling.slice(0, end);
}

/** Forward slashes, no trailing slash; a UNC `//host/share` is kept as written. */
function normalizeRoot(root: string): string {
  const spelling = root.replaceAll('\\', '/');
  return spelling.startsWith('//') ? trimSlashes(spelling) : trimSlashes(path.posix.normalize(spelling)) || '/';
}

/** Whole accounts, volumes, drives, shares and direct home children. */
const BROAD_ROOT_PATTERNS = [
  /^~\/[^/]+$/, /^\/(?:Users|home)(?:\/[^/]+)?$/, /^[a-z]:$/i, /^\/\/[^/]+(?:\/[^/]+)?$/, /^\/(?:Volumes|mnt|media)(?:\/[^/]+)?$/,
];

function isBroadRoot(normalized: string, home: string): boolean {
  if (['/', '~', home].includes(normalized) || path.posix.dirname(normalized) === home) return true;
  return BROAD_ROOT_PATTERNS.some((pattern) => pattern.test(normalized));
}
