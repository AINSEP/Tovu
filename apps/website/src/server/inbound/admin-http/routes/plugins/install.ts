import { PluginInstallError, type PluginInstallerPort } from "@jini-ai/plugins/host/node";
import { MAX_PLUGIN_ARCHIVE_BYTES } from "#src/features/plugin-runtime/install-archive";
import { raw, type Express, type Request, type Response } from "express";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { PluginsRouteDeps } from "./deps.js";
import { localPluginInstaller, type LocalInstallerDeps } from "./local-installer.js";

const conflicts = new Set(["PLUGIN_SHADOWS_BUILT_IN", "PLUGIN_ID_CONFLICT", "PLUGIN_IN_TRASH", "PLUGIN_ENABLED", "PLUGIN_VERSION_EXISTS", "PLUGIN_DOWNGRADE", "PLUGIN_CHANGED_SINCE_PREVIEW", "PLUGIN_INSTALL_BUSY"]);
const REVIEWED_DIGEST = /^sha256-[a-f0-9]{64}$/;
const INPUT_INVALID = "PLUGIN_INSTALL_INPUT_INVALID";

/** The deps the install routes read. */
export type PluginInstallRouteDeps = Pick<PluginsRouteDeps, "workspaceId" | "authorize" | "tracker"> & LocalInstallerDeps;

/** Which of the four install endpoints a request hit: ZIP upload or folder source, preview or install. */
interface InstallRoute { readonly zip: boolean; readonly preview: boolean }
/** A request refused with `{ code, error }` at `status`. */
interface Refused { readonly refusal: { readonly status: number; readonly code: string; readonly error: string } }
type ZipParser = ReturnType<typeof raw>;
type InstallOptions = Readonly<Record<string, unknown>>;
type InstallerInput = Parameters<PluginInstallerPort["preview"]>[0];
interface InstallContext { readonly deps: PluginInstallRouteDeps; readonly route: InstallRoute; readonly parseZip: ZipParser }

const refused = (status: number, code: string, error: string): Refused => ({ refusal: { status, code, error } });
const LOCAL_INSTALL_DISABLED = refused(403, "PLUGIN_LOCAL_INSTALL_DISABLED", "Local folder installs are disabled on this server.");
const OPTIONS_INVALID = refused(400, INPUT_INVALID, "Valid replacement options and the reviewed digest are required.");

function respondRefused(res: Response, { refusal }: Refused): void {
  res.status(refusal.status).json({ code: refusal.code, error: refusal.error });
}

/** `replace` may be absent, a JSON boolean (folder body) or "true"/"false" (ZIP query string). */
function validReplacement(replacement: unknown, zip: boolean): boolean {
  if (replacement === undefined) return true;
  return zip ? replacement === "true" || replacement === "false" : typeof replacement === "boolean";
}

/** A preview needs no digest; an install needs the sha256 digest the admin reviewed. */
function validDigest(expectedDigest: unknown, preview: boolean): boolean {
  return preview || (typeof expectedDigest === "string" && REVIEWED_DIGEST.test(expectedDigest));
}

function validOptions(options: InstallOptions | undefined, route: InstallRoute): options is InstallOptions {
  // `!options` is a wiring guard: `req.body` is undefined when the route is mounted without express.json().
  if (!options) return false;
  return validReplacement(options.replace, route.zip) && validDigest(options.expectedDigest, route.preview);
}

/** Anything but `{ kind: "folder", path: <non-blank string> }` is refused; the path goes on untrimmed. */
function readFolderSource(source: unknown): Refused | { sourceDir: string } {
  const folder = source as { kind?: unknown; path?: unknown } | null | undefined;
  if (folder?.kind !== "folder" || typeof folder.path !== "string" || !folder.path.trim()) return refused(400, INPUT_INVALID, "A folder source is required.");
  return { sourceDir: folder.path };
}

function zipParseRefusal(parseError: unknown): Refused {
  return (parseError as { type?: string }).type === "entity.too.large"
    ? refused(413, "PLUGIN_PACKAGE_TOO_LARGE", "ZIP exceeds the 32 MiB upload limit.")
    : refused(400, "PLUGIN_ARCHIVE_INVALID", "ZIP upload could not be read.");
}

async function readZipUpload(req: Request, res: Response, parseZip: ZipParser): Promise<Refused | { archive: Buffer }> {
  // req.is() is true only for a non-empty application/zip body, and raw() then always leaves
  // a Buffer in req.body, so the archive below needs no separate Buffer check.
  if (!req.is("application/zip")) return refused(400, INPUT_INVALID, "An application/zip upload is required.");
  const parseError = await new Promise<unknown>((resolve) => parseZip(req, res, (error?: unknown) => resolve(error)));
  if (parseError) return zipParseRefusal(parseError);
  return { archive: req.body as Buffer };
}

/** Validates the options, then reads the ZIP upload or folder source into the installer's input. */
async function readInstallInput(req: Request, res: Response, context: InstallContext): Promise<Refused | { input: InstallerInput; expectedDigest: unknown }> {
  // ZIP options ride the query string; folder options are the JSON body.
  const options: InstallOptions | undefined = context.route.zip ? req.query : req.body;
  if (!validOptions(options, context.route)) return OPTIONS_INVALID;
  const source = context.route.zip ? await readZipUpload(req, res, context.parseZip) : readFolderSource(options.source);
  if ("refusal" in source) return source;
  return { input: { ...source, replace: options.replace === true || options.replace === "true" }, expectedDigest: options.expectedDigest };
}

async function handleInstall(req: Request, res: Response, context: InstallContext): Promise<void> {
  const { deps, route } = context;
  const principal = getAuthedPrincipal(res);
  if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "admin.plugins.enable", workspaceId: deps.workspaceId }))) return;
  const installer = localPluginInstaller(deps);
  if (!installer) { respondRefused(res, LOCAL_INSTALL_DISABLED); return; }
  const read = await readInstallInput(req, res, context);
  if ("refusal" in read) { respondRefused(res, read); return; }
  // validDigest() admitted only a sha256 string on install (non-preview) routes.
  const result = route.preview
    ? await installer.preview(read.input)
    : await installer.install({ ...read.input, expectedDigest: read.expectedDigest as string });
  if (!route.preview) deps.tracker.capture({ name: "plugin_installed", userId: principal.id, properties: { pluginId: result.id, pluginKind: "cms", source: "admin" } });
  res.status(route.preview ? 200 : 201).json({ plugin: result });
}

function installErrorStatus(code: string): number {
  if (code === "PLUGIN_INSTALL_RECOVERY_REQUIRED") return 500;
  return conflicts.has(code) ? 409 : 400;
}

function respondInstallFailure(res: Response, error: unknown): void {
  if (error instanceof PluginInstallError) { res.status(installErrorStatus(error.code)).json({ code: error.code, error: error.message }); return; }
  res.status(500).json({ code: "INTERNAL_ERROR", error: "internal error" });
}

/** Local sources are explicitly opt-in, even for admins. ZIP parsing follows authorization. */
export const registerPluginInstallRoutes = (app: Express, deps: PluginInstallRouteDeps): void => {
  const parseZip = raw({ type: "application/zip", limit: MAX_PLUGIN_ARCHIVE_BYTES, inflate: false });
  for (const [zip, preview] of [[false, true], [false, false], [true, true], [true, false]] as const) {
    const context: InstallContext = { deps, route: { zip, preview }, parseZip };
    app.post(`/api/admin/v1/workspaces/:workspaceId/plugins/install${zip ? "/zip" : ""}${preview ? "/preview" : ""}`, async (req, res) => {
      if (req.params.workspaceId !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
      try {
        await handleInstall(req, res, context);
      } catch (error) {
        if (!preview) deps.tracker.capture({ name: "operation_failed", userId: getAuthedPrincipal(res).id,
          properties: { operationKind: "plugin_install", reasonClass: error instanceof PluginInstallError ? "refused" : "internal", surface: "admin", retryable: false } });
        respondInstallFailure(res, error);
      }
    });
  }
};
