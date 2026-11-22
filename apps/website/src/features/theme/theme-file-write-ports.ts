import type { ThemeOriginalFilePorts } from "@jini-ai/cms/themes/files/originals";
import type { ThemeFileMovePorts } from "@jini-ai/cms/themes/files/moves";
import type { ThemeFileWritePorts } from "@jini-ai/cms/themes/files/atomic-write";
import { fileDigest } from "@jini-ai/platform/fs";
import { ThemeFileChangedError } from "./theme-file-errors.js";
import { resolveThemeFilePath, statOrThemePathError, ThemePathError } from "./theme-files.js";

export const themeFileWritePorts: ThemeFileWritePorts = {
  resolvePath: resolveThemeFilePath,
  statPath: statOrThemePathError,
  digest: ({ path }, _optional = {}) => fileDigest({ path }).toString("hex"),
  changedError: (_required, _optional = {}) => new ThemeFileChangedError(),
  pathError: ({ reason, relativePath }, _optional = {}) => new ThemePathError({ message: reason === "not-regular-file"
    ? `path '${relativePath}' exists and is not a regular file`
    : "theme revision sequence is exhausted" }),
  reportPruneFailure: ({ error }, _optional = {}) => {
    // The rename already committed. Report cleanup separately so callers still reload; the
    // next replacement retries retention, including revisions left by this attempt.
    console.warn('[theme-files] File saved; revision cleanup failed and will retry on the next replacement.', error);
  },
};

export const themeOriginalFilePorts: ThemeOriginalFilePorts = {
  ...themeFileWritePorts,
  isPathError: ({ error }, _optional = {}) => error instanceof ThemePathError,
};

// `COPYFILE_EXCL` closes the TOCTOU window `resolveCopyOrRenameTargets`' own `existsSync(dest)`
// check leaves open: two concurrent copy requests both landing on the same auto-suffixed name
// (e.g. two rapid clicks generating `about-1.html` from the same source) would otherwise both
// pass that pre-check and race to overwrite one another. `copyFileSync` has an atomic
// exclusive-write mode for exactly this; `renameSync` (below) does not, so the identical race is
// a known, narrower, accepted gap there — this domain is a single authenticated operator's admin
// tool, not a multi-tenant race target, and every other write in this file already accepts the
// same class of risk (`writeThemeFile` has no equivalent guard at all).
export const themeFileMovePorts: ThemeFileMovePorts = {
  resolvePath: themeFileWritePorts.resolvePath,
  statPath: themeFileWritePorts.statPath,
  pathError: ({ reason, relativePath }) => new ThemePathError({ message: reason === "missing"
    ? `file '${relativePath}' does not exist in this theme`
    : reason === "not-regular-file"
      ? `path '${relativePath}' is not a regular file`
      : `path '${relativePath}' already exists in this theme` }),
};
