/** Tovu discovery is for folders of websites, never a whole user account or volume. */
import os from 'node:os';
import path from 'node:path';

/** Refuse obvious broad roots before filesystem access (including Windows/UNC spellings).
 * @returns Nothing for a specific folder.
 * @throws Error with the folder-picker remedy when the root is broad.
 * @complexity O(n) in the path length, with no filesystem probes.
 */
export function assertSpecificSiteRoot({ root }: { root: string }, { homeDir = os.homedir(), sitesHome }: { homeDir?: string; sitesHome?: string } = {}): void {
  const spelling = root.replaceAll('\\', '/');
  const normalized = spelling.startsWith('//') ? spelling.replace(/\/+$/, '') : path.posix.normalize(spelling).replace(/\/+$/, '') || '/';
  const home = homeDir.replaceAll('\\', '/').replace(/\/+$/, '');
  // The selected local fallback has one known Tovu parent at the former level. This narrow
  // application folder can be scanned without admitting unrelated direct home children.
  if (normalized === `${home}/Tovu` && sitesHome?.replaceAll('\\', '/').replace(/\/+$/, '') === `${normalized}/sites`) return;
  const broad = normalized === '/' || normalized === '~' || normalized === home || path.posix.dirname(normalized) === home ||
    /^~\/[^/]+$/.test(normalized) || /^\/(?:Users|home)(?:\/[^/]+)?$/.test(normalized) ||
    /^[a-z]:$/i.test(normalized) || /^\/\/[^/]+(?:\/[^/]+)?$/.test(normalized) ||
    /^\/(?:Volumes|mnt|media)(?:\/[^/]+)?$/.test(normalized);
  if (broad) throw new Error(`Sites folder is too broad: ${root}. Choose a specific folder containing your Tovu websites.`);
}
