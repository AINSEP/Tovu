/** Public declarative export assets; no plugin scripts, templates or undeclared files are served. */
import type { Express, Response } from "express";
import type { Clock } from "@jini-ai/core/primitives";
import { ADMIN_SURFACE_FILES_PER_IP, createRateLimiter, resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { TovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { createPluginExportSource, PLUGIN_EXPORT_FILES_PREFIX, type PluginExportSource } from "#src/features/agent-plugins/exports/source";

interface ExportFilesDeps {
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly agentPluginLifecycle: TovuAgentPluginLifecycle;
}

/** The only public export file kinds: one stylesheet plus PNG/SVG artwork. */
const EXPORT_FILE_TYPES: Readonly<Record<string, string>> = { ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

/** Fixed refusal never exposes containment errors or local package paths. */
function notFound({ res }: { res: Response }, _options = {}): void {
  res.status(404).set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).type("text/plain").send("Not found");
}

/** Match URL ids/path against declarations before any file read; no URL path is joined to disk.
 * @complexity O(p + e + a) catalog, export and declared asset scans, then one contained read.
 */
async function resolveFile(required: { source: PluginExportSource; workspaceId: string; pluginId: string; component: string; path: string }, _options = {}) {
  const packages = await required.source.list({ workspaceId: required.workspaceId });
  const owners = packages.filter(item => item.enabled && item.plugin.pluginId === required.pluginId);
  if (owners.length !== 1) return undefined;
  const owner = owners[0]!;
  const entry = Object.entries(owner.exports).find(([name]) => name === required.component)?.[1];
  if (!entry) return undefined;
  const declared = [entry.styles, ...Object.values(entry.assets ?? {})];
  const type = EXPORT_FILE_TYPES[required.path.slice(required.path.lastIndexOf(".")).toLowerCase()];
  // An unknown extension (e.g. a declared .html or .js) is refused, never served under an image type.
  if (!type || !declared.includes(required.path)) return undefined;
  const body = await required.source.readAsset({ plugin: owner.plugin, filename: required.path });
  return { body, type };
}

/** Rate-limit before catalog I/O. SVG is an inert image even when navigated to directly.
 * @complexity One lifecycle catalog scan and one declared file read per allowed request.
 */
export function registerPluginExportFilesRoute(required: { app: Express; deps: ExportFilesDeps }, options: { source?: PluginExportSource; limiter?: RateLimiter } = {}): void {
  const { app, deps } = required;
  const source = options.source ?? createPluginExportSource({ lifecycle: deps.agentPluginLifecycle });
  const limiter = options.limiter ?? createRateLimiter({ profile: ADMIN_SURFACE_FILES_PER_IP, clock: deps.clock });
  app.get(`${PLUGIN_EXPORT_FILES_PREFIX}/:pluginId/:component/*`, async (req, res) => {
    try {
      const limit = await limiter.check({ key: resolveClientIp(req) });
      if (!limit.allowed) {
        res.status(429).set({ "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" }).send("Too many requests");
        return undefined;
      }
      const file = await resolveFile({ source, workspaceId: deps.workspaceId, pluginId: String(req.params.pluginId),
        component: String(req.params.component), path: String((req.params as Record<string, string>)[0]) });
      if (!file) return notFound({ res });
      res.status(200).set({ "Content-Type": file.type, "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer",
        "Cache-Control": "public, max-age=60" }).send(typeof file.body === "string" ? file.body : Buffer.from(file.body));
    } catch {
      notFound({ res });
    }
    return undefined;
  });
}
