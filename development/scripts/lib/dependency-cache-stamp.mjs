/**
 * @file Launcher-owned stamp for linked `@jini-ai/*` packages.
 *
 * Vite keys its dependency pre-bundle cache off the lockfile, but relinking or rebuilding local Jini
 * output does not always touch the lockfile — so the admin dev server would keep serving a stale
 * pre-bundle. The launcher therefore fingerprints the packages itself and asks Vite to
 * re-optimize (`--force`) exactly when the fingerprint changed.
 */
import path from "node:path";

/** Files under `dir`, recursively. Symlinks are listed as non-directories and so counted as files. */
function listFilesDeep({ dir, fs }, _optional = {}) {
  const files = [];
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.list({ path: current })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory) pending.push(full);
      else files.push(full);
    }
  }
  return files;
}

/**
 * Newest FILE mtime under `<realPath>/dist`, 0 when absent. Directory mtimes are not used: rebuilding
 * a nested chunk in place rewrites the file without bumping its parent directory, so only a walk of
 * the nested output sees it.
 */
function newestDistMtimeMs({ realPath, fs }, _optional = {}) {
  const dist = path.join(realPath, "dist");
  if (!fs.exists({ path: dist })) return 0;
  return listFilesDeep({ dir: dist, fs }).reduce((newest, file) => Math.max(newest, fs.mtimeMs({ path: file })), 0);
}

/** One stamp entry per scope child that has a manifest; null for children that are not packages. */
function describePackage({ scopeDir, name, fs }, _optional = {}) {
  // Resolve the link: the scope entry is a symlink to the real package (pnpm/npm link), and the
  // real directory is where the version and rebuilt output actually live.
  const realPath = fs.resolveRealPath({ path: path.join(scopeDir, name) });
  const manifest = path.join(realPath, "package.json");
  if (!fs.exists({ path: manifest })) return null;
  return { name, realPath, version: JSON.parse(fs.readText({ path: manifest })).version, newestDistMtimeMs: newestDistMtimeMs({ realPath, fs }) };
}

/**
 * Compares the current `scopeDir` fingerprint with the one at `stampFile`, rewrites the stamp when it
 * differs, and reports whether Vite should be forced to re-optimize.
 * @returns `{ force }` — false only when the stamp exists and matches exactly.
 * @complexity O(files under each package's dist).
 */
export function prepareDependencyCacheStamp({ scopeDir, stampFile, fs }, _optional = {}) {
  const names = fs.exists({ path: scopeDir }) ? fs.list({ path: scopeDir }).map((entry) => entry.name) : [];
  const entries = names.map((name) => describePackage({ scopeDir, name, fs })).filter(Boolean).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const stampText = JSON.stringify(entries);
  if (fs.exists({ path: stampFile }) && fs.readText({ path: stampFile }) === stampText) return { force: false };
  fs.ensureDir({ path: path.dirname(stampFile) });
  fs.writeText({ path: stampFile, value: stampText });
  return { force: true };
}
