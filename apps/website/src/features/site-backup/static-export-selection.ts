import { allocateStaticExportThemes as allocateThemes, parseStaticExportInput as parseInput, type StaticExportInput, type StaticExportTheme } from "@jini-ai/devops/backup/site/static-export-selection";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { sharePathAlias, validateSharePath } from "./share-file-policy.js";

/** Tovu's refusal for malformed selection input: the copy and the refusal type are the host's. */
function invalidInput(): never {
  throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Send a nonempty list of unique installed themeIds to start, or only a valid jobId to resume." });
}

/** Binds Jini's static-export input parser to Tovu's share path policy and refusal. */
export function parseStaticExportInput({ input }: { input: unknown }, _options = {}): StaticExportInput {
  return parseInput({ input, policy: { validateSharePath, invalidInput } });
}

/** Binds Jini's theme-folder allocation to Tovu's share path policy. */
export function allocateStaticExportThemes({ themeIds, siteSlug }: { themeIds: readonly string[]; siteSlug: string }, _options = {}): StaticExportTheme[] {
  return allocateThemes({ themeIds, siteSlug, policy: { validateSharePath, sharePathAlias } });
}
