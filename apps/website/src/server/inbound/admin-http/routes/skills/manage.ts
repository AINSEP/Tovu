import type { SkillInstallInput } from "@jini-ai/agentic/skills/install";
import type { Request, Response } from "express";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { installSkill, setSkillEnabled, uninstallSkill, SkillInputError } from "#src/features/skills/install-service";
import { loadInstalledSkillToolSources, buildSkillToolRegistrations } from "#src/features/skills/tool-registrations";
import type { SkillsRouteRegistrar } from "./deps.js";
import type { ApplyExtensionApprovalPolicy } from "#src/contracts/headless/assistant-tool-approval-policy";

function hasUploadedSkillFiles(fields: Record<string, unknown>, _options = {}): fields is Record<string, unknown> & { files: { path: string; contentBase64: string }[] } {
  return Array.isArray(fields.files) && fields.files.every(f => {
    if (!f || typeof f !== "object") return false;
    return typeof f.path === "string" && typeof f.contentBase64 === "string"
      && Object.keys(f).every(key => ["path", "contentBase64"].includes(key));
  });
}

function installationInput(body: unknown, workspaceId: string): SkillInstallInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SkillInputError({ message: "Choose exactly one source: GitHub URL, files, or ZIP." });
  const fields = body as Record<string, unknown>;
  if (fields.confirmed !== true) throw new SkillInputError({ message: "Confirm the skill installation first." });
  const sources = ["githubUrl", "files", "archiveBase64"].filter(key => fields[key] !== undefined);
  if (sources.length !== 1 || Object.keys(fields).some(key => !["confirmed", "githubUrl", "files", "archiveBase64"].includes(key))) throw new SkillInputError({ message: "Choose exactly one source: GitHub URL, files, or ZIP." });
  if (typeof fields.githubUrl === "string") return { workspaceId, githubUrl: fields.githubUrl };
  if (typeof fields.archiveBase64 === "string") return { workspaceId, archiveBase64: fields.archiveBase64 };
  if (hasUploadedSkillFiles(fields)) return { workspaceId, files: fields.files };
  throw new SkillInputError({ message: "Skill source has invalid fields." });
}

/** Session-gated routes; one validator/service owns every installation transport. */
export const registerSkillsManagementRoutes = (
  app: Parameters<SkillsRouteRegistrar>[0],
  deps: Parameters<SkillsRouteRegistrar>[1] & { withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy },
): void => {
  const base = "/api/admin/v1/workspaces/:workspaceId/skills";
  const guarded = (work: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      if (!await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "admin.assistant.use", workspaceId: deps.workspaceId })) return;
      await work(req, res);
    } catch (error) {
      if (error instanceof SkillInputError) res.status(400).json({ error: error.message, code: "VALIDATION_ERROR" });
      else { console.error("[skills] request failed", error); res.status(500).json({ error: "Could not change skills. Try again.", code: "INTERNAL_ERROR" }); }
    }
  };
  app.post(base, guarded(async (req, res) => {
    const skill = await installSkill({ ...installationInput(req.body, deps.workspaceId), skillLayout: deps.skillLayout, siteBinding: deps.siteBinding });
    res.status(201).json({ skill });
  }));
  app.patch(`${base}/:toolId`, guarded(async (req, res) => {
    if (!req.body || typeof req.body.enabled !== "boolean" || Object.keys(req.body).some(key => key !== "enabled")) throw new SkillInputError({ message: "enabled must be a boolean." });
    await setSkillEnabled({ skillLayout: deps.skillLayout, siteBinding: deps.siteBinding, workspaceId: deps.workspaceId, toolId: String(req.params.toolId), enabled: req.body.enabled });
    res.json({ updated: true });
  }));
  app.delete(`${base}/:toolId`, guarded(async (req, res) => {
    await uninstallSkill({ skillLayout: deps.skillLayout, siteBinding: deps.siteBinding, workspaceId: deps.workspaceId, toolId: String(req.params.toolId) });
    res.json({ removed: true });
  }));
  app.get(`${base}/:toolId/guidance`, guarded(async (req, res) => {
    const sources = await loadInstalledSkillToolSources(deps);
    const source = sources.find(s => s.id === req.params.toolId);
    if (!source) { res.status(404).json({ error: "Skill was not found or is disabled.", code: "NOT_FOUND" }); return; }
    const [registration] = buildSkillToolRegistrations({ sources: [source], withExtensionApprovalPolicy: deps.withExtensionApprovalPolicy });
    // The selected skill's read-only handler and the browser share exactly the same payload.
    res.json(await registration!.handler({ executionId: "skill-preview", principal: { id: getAuthedPrincipal(res).id }, run: { id: "skill-preview" }, input: {}, signal: new AbortController().signal }));
  }));
};
