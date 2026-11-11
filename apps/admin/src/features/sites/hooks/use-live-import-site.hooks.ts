import { useCallback, useRef, useState } from "react";
import { describeApiError, type AdminLocalSiteState } from "@/lib/api";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import { siteWriteErrorKey } from "../rules";
import { defaultSitesPort } from "./sites-dependencies.hooks";
import type { SitesPort } from "./sites-port.hooks";
import { validWebsiteAddress } from "./use-site-transfer.hooks";

/**
 * @file "From a live website" on the web admin makes a NEW site (owner, 2026-11-10), the way the
 * desktop app's Import page does, and never imports into the site this page belongs to. It reuses
 * the Sites screen's own Create and Start, then opens the new site's Import tab with the address
 * filled in (`?liveImport=`, the same query the desktop app opens), where the owner presses Send.
 */

export interface LiveImportSiteController {
  creating: boolean;
  error: string | null;
  start: (address: string) => Promise<void>;
}

/** Same wording for both ways a made site can fail to come up. */
const NOT_STARTED = "{name} was made but didn't start. Start it from All sites, then import there.";

/**
 * A free folder name for the new site, from the address's host: `www.example.com` → `example-com`.
 * @complexity O(taken) per call.
 */
export function liveImportSiteName({ address, taken }: { address: string; taken: readonly string[] }, _optional = {}): string {
  const host = new URL(address.trim()).hostname.toLowerCase().replace(/^www\./, "");
  // Folder names are lowercase letters, digits and dashes (`siteNameErrorKey`); room is left for a "-n" suffix.
  const base = host.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "imported-site";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** The new site's Import tab with the address filled in. @complexity O(1). */
export function liveImportAdminUrl({ adminUrl, address }: { adminUrl: string; address: string }, _optional = {}): string {
  const url = new URL("import-export", adminUrl.endsWith("/") ? adminUrl : `${adminUrl}/`);
  url.searchParams.set("tab", "import");
  url.searchParams.set("liveImport", address.trim());
  return url.toString();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Starts the made site and waits for its admin, re-reading the Sites list the way its cards do.
 * @returns the running site's admin address, or null when it crashed or never came up.
 * @complexity O(attempts) list reads.
 */
async function startAndWait(
  { port, name }: { port: SitesPort; name: string },
  { wait, attempts }: { wait: (ms: number) => Promise<void>; attempts: number },
): Promise<string | null> {
  let state = (await port.manageLocalSite?.({ name, action: "start", confirmed: true })) as AdminLocalSiteState | undefined;
  for (let tries = 0; !(state?.status === "running" && state.adminUrl); tries += 1) {
    if (tries >= attempts || state?.status === "crashed") return null;
    await wait(1000);
    state = (await port.listSites()).localSites?.find((site) => site.name === name);
  }
  return state?.adminUrl ?? null;
}

/**
 * @param required.port the Sites screen's port: its Create, Start, list and open.
 * @param optional.wait,optional.attempts the pause between list reads, and how many (a start can take a minute).
 * @complexity O(1) state; see {@link startAndWait} for the reads.
 */
export function useLiveImportSite(
  { port, t }: { port: SitesPort; t: Translate },
  { wait = sleep, attempts = 120 }: { wait?: (ms: number) => Promise<void>; attempts?: number } = {},
): LiveImportSiteController {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not `creating`: a second press can land before React re-renders with the first one.
  const busy = useRef(false);

  const start = useCallback(async (address: string) => {
    if (busy.current || !validWebsiteAddress(address)) return;
    busy.current = true;
    setCreating(true);
    setError(null);
    let made: string | null = null;
    try {
      const taken = (await port.listSites()).sites.map((site) => site.name);
      made = (await port.createSite({ name: liveImportSiteName({ address, taken }) })).site.name;
      const adminUrl = await startAndWait({ port, name: made }, { wait, attempts });
      if (adminUrl) port.openSite?.(liveImportAdminUrl({ adminUrl, address }));
      else setError(interpolate({ template: t(NOT_STARTED), vars: { name: made } }));
    } catch (failure) {
      const key = siteWriteErrorKey(failure);
      const reason = key ? t(key) : describeApiError(failure instanceof Error ? failure : new Error("Request failed"), t("Couldn't make the new site."));
      setError(made === null ? reason : `${interpolate({ template: t(NOT_STARTED), vars: { name: made } })} ${reason}`);
    } finally {
      busy.current = false;
      setCreating(false);
    }
  }, [port, t, wait, attempts]);

  return { creating, error, start };
}

export function useWiredLiveImportSite({ t }: { t: Translate }): LiveImportSiteController {
  return useLiveImportSite({ port: defaultSitesPort, t });
}
