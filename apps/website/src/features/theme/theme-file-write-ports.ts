import type { ThemeOriginalFilePorts } from "@jini-ai/cms/themes/files/originals";
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
