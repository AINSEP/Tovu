import { createAgentPluginUpdateEffects, requireUpdateMcpDeps } from "#src/features/agent-plugins/update-effects";
import type { Request, RequestHandler, Response } from "express";
import { raw } from "express";

import { maxAgentPluginInstallArchiveBytes } from "../../../../../features/agent-plugins/lifecycle.js";
import { installUploadedAgentPlugin } from "#src/features/agent-plugins/install-upload";
import { isAgentPluginName } from "@jini-ai/agent-plugins/lifecycle";
import { loadAgentPluginSearchCandidates } from "#src/features/agent-plugins/tool-registrations";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "./deps.js";
import { bodyParseRefusal, installErrorResponse, installedAgentPluginRow, type InstallRefusal } from "./install-response.js";

/**
 * @file `AGENT_PLUGIN_INSTALL_ZIP` — `POST /api/admin/v1/workspaces/:workspaceId/agent-plugins/install/zip?expectedSha256=<hex>`
 * (2026-10-06). The Agent Plugins screen's "Add a plugin" upload. Raw `application/zip` body, the
 * same transport `routes/plugins/install.ts` uses for site plugins; all install work is
 * `installUploadedAgentPlugin` (`features/agent-plugins/install-upload.ts`), which goes through
 * the one `installAgentPlugin` the bundled seed uses and leaves the plugin switched off.
 *
 * No `TOVU_PLUGIN_LOCAL_INSTALL` opt-in, unlike site plugins: those packages run server code, while
 * nothing in an uploaded Agent Plugin runs (`trusted-plugin-files.ts` trusts bundled digests only).
 * Gated on `admin.plugins.enable`, the permission the enable switch beside it already needs.
 *
 * Answers 201 with the new row in `list.ts`'s shape, or 200 when the same bytes were already there.
 * Error bodies carry a code and a plain message; no host path ever reaches them.
 *
 * `AGENT_PLUGIN_UPDATE_ZIP` — `POST .../agent-plugins/:pluginId/update/zip?expectedSha256=&expectedOldDigest=`
 * (2026-10-21) shares this handler: the same upload checks, then `installUploadedAgentPlugin({ update })`,
 * which hands the candidate to the lifecycle owner's update transaction. `expectedOldDigest` is the
 * row's `archiveDigest` the operator saw; a changed, bundled, pending or downgraded plugin is a 409
 * with the owner's code. Answers 200 with the updated row and any compatibility warnings.
 */

const DIGEST_REFUSAL: InstallRefusal = { status: 400, body: { code: "VALIDATION_ERROR", error: "expectedSha256 must be the file's lowercase hex SHA-256." } };
const NOT_ZIP_REFUSAL: InstallRefusal = { status: 400, body: { code: "VALIDATION_ERROR", error: "An application/zip upload is required." } };
const REPLACE_REFUSAL: InstallRefusal = { status: 400, body: { code: "VALIDATION_ERROR", error: "replace must be true or false." } };
const PLUGIN_ID_REFUSAL: InstallRefusal = { status: 400, body: { code: "VALIDATION_ERROR", error: "pluginId is not a valid Agent Plugin id." } };
const OLD_DIGEST_REFUSAL: InstallRefusal = { status: 400, body: { code: "VALIDATION_ERROR", error: "expectedOldDigest must be the installed revision's lowercase hex SHA-256." } };

/** Which installed revision an update replaces: the URL's plugin id and the digest the operator saw. */
interface UpdateTarget {
  readonly pluginId: string;
  readonly expectedOldDigest: string;
}

/** A checked upload: the zip bytes, the digest the client computed, and whether to replace. */
interface ZipUpload {
  readonly archive: Buffer;
  readonly expectedSha256: string;
  readonly replace: boolean;
}

/** Sends a refusal, logging its operator-side warning first when it has one. */
function sendRefusal(res: Response, refusal: InstallRefusal): void {
  if (refusal.warning) console.warn(refusal.warning);
  res.status(refusal.status).json(refusal.body);
}

/**
 * Checks the query and reads the raw zip body, in this order: digest, content type, body, replace.
 * Runs only after authorization, so no unauthorized request gets its body parsed.
 * @complexity O(b) in body bytes, capped by the raw parser's limit.
 */
async function readZipUpload(required: { req: Request; res: Response; parseZip: RequestHandler }): Promise<ZipUpload | InstallRefusal> {
  const { req, res, parseZip } = required;
  const expectedSha256 = req.query.expectedSha256;
  if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256)) return DIGEST_REFUSAL;
  // ZIP parsing follows authorization, as in `routes/plugins/install.ts`.
  if (!req.is("application/zip")) return NOT_ZIP_REFUSAL;
  const parseError = await new Promise<unknown>((resolve) => parseZip(req, res, (error?: unknown) => resolve(error)));
  if (parseError) return bodyParseRefusal(parseError);

  const replace = req.query.replace;
  if (replace !== undefined && replace !== "true" && replace !== "false") return REPLACE_REFUSAL;
  return { archive: req.body as Buffer, expectedSha256, replace: replace === "true" };
}

/** The update target from the URL and query, or the refusal for a malformed one. A plain install
 *  has no target. Checked after authorization and before the body is read.
 *  @complexity O(1). */
function readUpdateTarget({ req }: { req: Request }, _optional: Record<string, never> = {}): { update?: UpdateTarget } | InstallRefusal {
  if (req.params.pluginId === undefined) return {};
  const pluginId = req.params.pluginId;
  // The Agent Plugins name grammar (`plugin.json` `name`), owned by Jini's manifest parser: the URL id
  // is checked against it before it names anything on disk.
  if (!isAgentPluginName({ value: pluginId })) return PLUGIN_ID_REFUSAL;
  const expectedOldDigest = req.query.expectedOldDigest;
  if (typeof expectedOldDigest !== "string" || !/^[a-f0-9]{64}$/.test(expectedOldDigest)) return OLD_DIGEST_REFUSAL;
  return { update: { pluginId, expectedOldDigest } };
}

/** The installer's optional ports; an update adds its MCP effects and settings-snapshot owner. */
function installOptions(required: { deps: AgentPluginsRouteDeps; actor: string }, optional: { update?: UpdateTarget } = {}) {
  const { deps, actor } = required;
  const base = { layout: deps.agentPluginLayout, pluginHost: deps.pluginHost };
  if (!optional.update) return base;
  return { ...base, mcpProvisioning: createAgentPluginUpdateEffects({ deps: requireUpdateMcpDeps({ deps }), actor }), snapshotSettings: deps.snapshotAgentPluginSettings };
}

export const registerAgentPluginInstallRoute: AgentPluginsRouteRegistrar = (app, deps) => {
  const parseZip = raw({ type: "application/zip", limit: maxAgentPluginInstallArchiveBytes(), inflate: false });
  const installHandler: RequestHandler = async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "admin.plugins.enable", workspaceId: deps.workspaceId }))) return;
      const target = readUpdateTarget({ req });
      if ("status" in target) return sendRefusal(res, target);
      const upload = await readZipUpload({ req, res, parseZip });
      if ("status" in upload) return sendRefusal(res, upload);
      const result = await installUploadedAgentPlugin({ ...upload, workspaceId: deps.workspaceId, actor: principal.id, ...target },
        installOptions({ deps, actor: principal.id }, target));
      const candidate = (await loadAgentPluginSearchCandidates(deps)).find((entry) => entry.pluginId === result.plugin.pluginId);
      // An update replaces an existing row, so it is never 201.
      const status = result.alreadyInstalled || target.update ? 200 : 201;
      res.status(status).json({ alreadyInstalled: result.alreadyInstalled, warnings: result.warnings ?? [], agentPlugin: installedAgentPluginRow(candidate) });
    } catch (error) {
      const refusal = installErrorResponse(error);
      // A 500 is redacted for the client, so the operator's log is the only place its cause survives.
      if (refusal.status === 500) console.error("[agent-plugins] install/update request failed", error);
      sendRefusal(res, refusal);
    }
  };
  app.post("/api/admin/v1/workspaces/:workspaceId/agent-plugins/install/zip", installHandler);
  app.post("/api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId/update/zip", installHandler);
};
