/** Dev-session intent for CMS local sites. Native process state remains the process port's job. */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createNodeAtomicFilesystem, writeJsonFileAtomic } from "@jini-ai/platform/fs";
import { SITE_NAME_PATTERN } from "./site-registry.js";

export interface LocalSiteIntent {
  session: string; sites: Record<string, { port: number }>;
  /** Warm URLs stay assigned even after LRU eviction; never serve another site at an old URL. */
  ports?: Record<string, { port: number }>;
}
export interface LocalSiteIntentPort {
  read(): LocalSiteIntent | undefined;
  write(required: { intent: LocalSiteIntent }): void;
}

/** Reject malformed persisted names/ports before they reach the lifecycle.
 * @complexity O(n) for a name bounded to 100 characters.
 */
function validSite([name, value]: [string, unknown]): boolean {
  if (!name.length || name.length > 100 || !SITE_NAME_PATTERN.test(name)) return false;
  if (!value || typeof value !== "object") return false;
  const port = (value as { port?: unknown }).port;
  return typeof port === "number" && Number.isInteger(port) && port >= 3101 && port < 4101;
}

/** Validate the snapshot envelope independently of filesystem recovery. @complexity O(s). */
function validIntent(value: unknown): value is LocalSiteIntent {
  if (!value || typeof value !== "object") return false;
  const { session, sites, ports } = value as Partial<LocalSiteIntent>;
  if (typeof session !== "string" || !sites || typeof sites !== "object" || Array.isArray(sites)) return false;
  if (!Object.entries(sites).every(validSite)) return false;
  if (ports === undefined) return true;
  if (!ports || typeof ports !== 'object' || Array.isArray(ports)) return false;
  return Object.entries(ports).every(validSite)
    && new Set(Object.values(ports).map(site => site.port)).size === Object.keys(ports).length;
}

/** Missing or corrupt intent means no requested starts; filesystem access failures propagate.
 * @complexity O(s) time/space for s persisted sites.
 */
function readIntent(file: string): LocalSiteIntent | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return validIntent(value) ? value : undefined;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Persist beside the serving site's ops files through Jini's atomic temp + rename owner.
 * Readers see a complete snapshot even if tsx restarts the writer. Writes fail before launch/stop
 * signalling when persistence fails. @complexity O(s) time/space per read/write.
 */
export function createLocalSiteIntentStore({ servingSiteDir }: { servingSiteDir: string }, _optional = {}): LocalSiteIntentPort {
  const dir = join(servingSiteDir, "ops");
  const file = join(dir, "local-sites-intent.json");
  const fs = createNodeAtomicFilesystem({});
  return {
    read: () => readIntent(file),
    write({ intent }) {
      mkdirSync(dir, { recursive: true });
      writeJsonFileAtomic({ filePath: file, data: intent, fs }, { mode: 0o600 });
    },
  };
}
