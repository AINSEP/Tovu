import { sharePathAlias, validateSharePath } from "./share-file-policy.js";
import { SiteShareRefusal } from "./share-policy.js";

export interface StaticExportInput { jobId?: string; themeIds?: readonly string[] }
export interface StaticExportTheme { themeId: string; name: string }
export interface StaticExportOptions { activeThemeId: string; themes: readonly StaticExportTheme[] }

/** One HTTP/tool start-or-resume contract. Never changes submitted selection order.
 * @throws SiteShareRefusal for malformed input, repeated IDs or selection on a resume.
 * @complexity O(input bytes + IDs), no effects.
 */
export function parseStaticExportInput({ input }: { input: unknown }, _options = {}): StaticExportInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) invalidInput();
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key => !["jobId", "themeIds"].includes(key))) invalidInput();
  if (raw.jobId !== undefined) {
    return { jobId: readStaticJobId({ input: raw }) };
  }
  if (raw.themeIds === undefined) return {};
  const themeIds = readThemeIds({ value: raw.themeIds });
  return { themeIds };
}

/** A resume cannot change the selection that the job already captured. */
function readStaticJobId({ input }: { input: Record<string, unknown> }, _options = {}): string {
  if (typeof input.jobId !== "string" || !/^[0-9a-f-]{36}$/.test(input.jobId) || input.themeIds !== undefined) invalidInput();
  return input.jobId as string;
}

function invalidInput(): never {
  throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Send a nonempty list of unique installed themeIds to start, or only a valid jobId to resume." });
}

/** Theme IDs are canonical single path segments; installed membership is checked by the backend. */
function readThemeIds({ value }: { value: unknown }, _options = {}): string[] {
  if (!Array.isArray(value) || !value.length) invalidInput();
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !id || /[/\\%?#]/.test(id) || seen.has(id)) invalidInput();
    try { validateSharePath({ path: `sites/${id}/index.html` }); } catch { invalidInput(); }
    seen.add(id);
  }
  return [...seen];
}

/** Allocate portable names from the entire roster so options and selected subsets agree.
 * Sorting makes case/Unicode collision suffixes independent of discovery and selection order.
 * @complexity O(T log T + collision retries), O(T) memory; no I/O.
 */
export function allocateStaticExportThemes({ themeIds, siteSlug }: { themeIds: readonly string[]; siteSlug: string }, _options = {}): StaticExportTheme[] {
  // The site-slug prefix is branding, not part of the portable theme folder name.
  const prefix = siteSlug.split("-")[0] + "-";
  const names = new Map<string, string>(), claimed = new Set<string>();
  for (const themeId of [...themeIds].sort()) {
    const short = (themeId.startsWith(prefix) && themeId.length > prefix.length ? themeId.slice(prefix.length) : themeId).normalize("NFC");
    let name = short, suffix = 1;
    while (claimed.has(sharePathAlias({ path: name }))) {
      suffix += 1;
      name = `${short}-${suffix}`;
    }
    validateSharePath({ path: `sites/${name}/index.html` });
    names.set(themeId, name);
    claimed.add(sharePathAlias({ path: name }));
  }
  return themeIds.map(themeId => ({ themeId, name: names.get(themeId)! }));
}
