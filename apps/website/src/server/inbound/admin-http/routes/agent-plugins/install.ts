import type { Response } from "express";
import { raw } from "express";

import { AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError } from "@jini-ai/agent-plugins/lifecycle";
import { AgentPluginInstallError, maxAgentPluginInstallArchiveBytes } from "#src/features/agent-plugins/install";
import { AgentPluginUploadError, installUploadedAgentPlugin } from "#src/features/agent-plugins/install-upload";
import { loadAgentPluginSearchCandidates } from "#src/features/agent-plugins/tool-registrations";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteRegistrar } from "./deps.js";

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
 */

const TOO_LARGE_MESSAGE = "The .zip is larger than the 32 MiB limit.";
const UNPACKED_TOO_LARGE_MESSAGE = "The .zip is too big once unpacked: at most 4096 files, 16 MiB per file, 64 MiB in all.";

/** Plain-language text for each refusal the operator can fix by choosing a different file. */
const INSTALL_ERROR_MESSAGES: Readonly<Partial<Record<string, string>>> = {
  ARCHIVE_TOO_LARGE: TOO_LARGE_MESSAGE,
  DIGEST_MISMATCH: "The upload arrived damaged. Try again.",
  MANIFEST_MISSING: "No plugin.json found. Put plugin.json at the top of the .zip, or inside one folder.",
  MANIFEST_INVALID: "plugin.json is not a valid Agent Plugin manifest.",
  TOO_MANY_ENTRIES: UNPACKED_TOO_LARGE_MESSAGE,
  FILE_TOO_LARGE: UNPACKED_TOO_LARGE_MESSAGE,
  DECOMPRESSION_BOMB: UNPACKED_TOO_LARGE_MESSAGE,
  TOTAL_SIZE_EXCEEDED: UNPACKED_TOO_LARGE_MESSAGE,
};

/** Maps a thrown install error to its HTTP response.
 *  @complexity O(1). */
function sendInstallError(res: Response, error: unknown): void {
  if (error instanceof AgentPluginUploadError) {
    const taken = error.code === "PLUGIN_ID_TAKEN";
    res.status(error.code === "ARCHIVE_UNREADABLE" ? 400 : 409).json({
      code: `AGENT_PLUGIN_${error.code}`,
      error: taken ? "This plugin ID is already installed. Choose Replace existing version to upgrade it." : error.code === "ARCHIVE_UNREADABLE" ? "This file is not a readable .zip." : error.message,
    });
    return;
  }
  if (error instanceof AgentPluginInstallError) {
    res.status(error.code === "ARCHIVE_TOO_LARGE" ? 413 : error.code === "PUBLISH_FAILED" ? 500 : 400).json({
      code: `AGENT_PLUGIN_${error.code}`,
      error: INSTALL_ERROR_MESSAGES[error.code] ?? "This .zip contains files or links that plugins may not include.",
    });
    return;
  }
  if (error instanceof AgentPluginActivationsUnreadableError || error instanceof AgentPluginActivationsBusyError) {
    console.warn(`[agent-plugins] upload refused — ${error.message}`);
    res.status(409).json({ code: "AGENT_PLUGIN_ACTIVATIONS_BUSY", error: "Could not install the plugin. Try again." });
    return;
  }
  res.status(500).json({ code: "INTERNAL_ERROR", error: "internal error" });
}

export const registerAgentPluginInstallRoute: AgentPluginsRouteRegistrar = (app, deps) => {
  const parseZip = raw({ type: "application/zip", limit: maxAgentPluginInstallArchiveBytes(), inflate: false });
  app.post("/api/admin/v1/workspaces/:workspaceId/agent-plugins/install/zip", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "admin.plugins.enable", workspaceId: deps.workspaceId }))) return;
      const expectedSha256 = req.query.expectedSha256;
      if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
        res.status(400).json({ code: "VALIDATION_ERROR", error: "expectedSha256 must be the file's lowercase hex SHA-256." });
        return;
      }
      // ZIP parsing follows authorization, as in `routes/plugins/install.ts`.
      if (!req.is("application/zip")) {
        res.status(400).json({ code: "VALIDATION_ERROR", error: "An application/zip upload is required." });
        return;
      }
      const parseError = await new Promise<unknown>((resolve) => parseZip(req, res, (error?: unknown) => resolve(error)));
      if (parseError) {
        const large = (parseError as { type?: string }).type === "entity.too.large";
        res.status(large ? 413 : 400).json({ code: large ? "AGENT_PLUGIN_ARCHIVE_TOO_LARGE" : "AGENT_PLUGIN_ARCHIVE_UNREADABLE", error: large ? TOO_LARGE_MESSAGE : "The upload could not be read." });
        return;
      }

      const replace = req.query.replace;
      if (replace !== undefined && replace !== "true" && replace !== "false") {
        res.status(400).json({ code: "VALIDATION_ERROR", error: "replace must be true or false." });
        return;
      }
      const { plugin, alreadyInstalled } = await installUploadedAgentPlugin({ archive: req.body as Buffer, expectedSha256, workspaceId: deps.workspaceId, actor: principal.id, replace: replace === "true" });
      const candidate = (await loadAgentPluginSearchCandidates({ workspaceId: deps.workspaceId })).find((entry) => entry.pluginId === plugin.pluginId);
      res.status(alreadyInstalled ? 200 : 201).json({
        alreadyInstalled,
        agentPlugin: candidate
          ? {
              pluginId: candidate.pluginId,
              displayName: candidate.displayName ?? null,
              summary: candidate.summary ?? null,
              version: candidate.version ?? null,
              description: candidate.description ?? null,
              keywords: candidate.keywords,
              enabled: candidate.enabled,
              skills: candidate.skills,
              mcpServerIds: candidate.mcpServerIds,
            }
          : null,
      });
    } catch (error) {
      sendInstallError(res, error);
    }
  });
};
