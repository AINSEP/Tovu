import { adaptLegacyAuthorize, requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  ToolInputError,
  type AgentToolDefinition,
  type DerivedRiskByToolId,
  type ToolExecutionContext,
  type ToolExecutionOptions,
  type ToolRegistration,
} from "@jini-ai/core";

import type { ToolContributor } from "#src/assistant/index";
import { resolveConfirmationDecision, type AssistantSurfaceDeps, type ConfirmationOutcome } from "../../contracts/core/tool-surface-exchanges.js";
import { buildSkillInstallConfirmationResource, SKILLS_INSTALL_TOOL_ID } from "./install-confirmation-ui.js";
import { commitSkillInstall, listManagedSkills, prepareSkillInstall, SkillInputError, type PreparedSkillInstall } from "./install-service.js";

/**
 * @file `skills_install` — installs a standalone Agent Skill from a public GitHub URL, through the
 * SAME `install-service.ts` the admin Skills screen's "Add from GitHub" calls (`routes/skills/
 * manage.ts` -> `installSkill`, which is `prepareSkillInstall` + `commitSkillInstall`). Same
 * `admin.assistant.use` permission as that route.
 *
 * The admin confirms before it fetches; this tool fetches and validates first, so the dialog can name
 * the skill and its pinned commit, then writes exactly those validated bytes. Uploaded folders/ZIPs
 * are not a source here: the admin chat composer already installs a dropped skill through the Skills
 * screen's own upload path.
 */

export interface SkillsInstallToolDeps {
  readonly workspaceId: string;
  readonly authorize: AuthorizeFn;
  /** Test seam for the GitHub fetch; defaults to global `fetch` inside the service. */
  readonly skillFetch?: typeof fetch;
}

export const catalog: AgentToolDefinition[] = [{
  name: SKILLS_INSTALL_TOOL_ID,
  description:
    "Installs a standalone Agent Skill (a folder with SKILL.md) from a public GitHub URL into this workspace. Use when the user asks to " +
    "install or add a skill from GitHub. The skill is fetched from api.github.com at one pinned commit and validated, then a confirmation " +
    "dialog shows its name, description, source and commit; nothing is written unless the human confirms, and a cancel comes back as a " +
    "result. The installed skill is ON and becomes its own skill_<name> tool, found by search_tools. Refused if a skill with that name is " +
    "already installed. Installation runs no code. Does not install plugins, Agent Plugins or themes, and does not take local files.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: "admin.assistant.use" },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["githubUrl"],
    properties: {
      githubUrl: {
        type: "string",
        minLength: 1,
        description: "HTTPS github.com repository URL, optionally ending in /tree/<ref>/<skill-folder>, e.g. https://github.com/owner/repo/tree/main/skills/my-skill.",
      },
    },
  },
}];

export const derivedRisk: DerivedRiskByToolId = new Map([
  // -> prepareSkillInstall (GitHub fetch, read-only) then commitSkillInstall: writes the skill folder
  //    under <site>/skills/ws/<workspaceId>/. Durable file writes; no code runs. The admin Skills
  //    screen's Remove is the inverse.
  [SKILLS_INSTALL_TOOL_ID, "mutates-durable-state"],
]);

/** Fails CLOSED without a dialog channel, like every confirmed install. @complexity O(1) + human latency. */
async function confirmSkill(
  surfaces: AssistantSurfaceDeps,
  ctx: Pick<ToolExecutionContext, "principal" | "signal">,
  prepared: PreparedSkillInstall,
  optional: ToolExecutionOptions,
): Promise<ConfirmationOutcome> {
  if (!optional.emitSurface) throw new Error("skills_install: this execution context has no interactive confirmation channel, so an install cannot be approved here. Nothing was installed.");
  const exchange = surfaces.surfaceExchanges.open({ toolId: SKILLS_INSTALL_TOOL_ID, principalId: ctx.principal.id }, optional.emitSurface);
  const ui = buildSkillInstallConfirmationResource({ prepared, exchangeId: exchange.id, expiresAtMs: exchange.expiresAtMs() });
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try { return await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } }); }
  finally { ctx.signal.removeEventListener("abort", closeOnAbort); }
}

/** ADR-055 Decision 6: no answer is a RESULT. @complexity O(1). */
function notConfirmedResult(outcome: Exclude<ConfirmationOutcome, { confirmed: true }>, name: string): unknown {
  const note = outcome.reason === "declined" ? `The user declined. The ${name} skill was NOT installed.`
    : outcome.reason === "expired" ? `The user did not answer before the confirmation expired. The ${name} skill was NOT installed.`
    : `The confirmation closed because the run ended. The ${name} skill was NOT installed.`;
  return { installed: false, name, cancelled: outcome.reason === "declined", ...(outcome.reason === "declined" ? {} : { reason: outcome.reason }), note };
}

/** Service refusals are input problems the model can relay; anything else propagates. */
async function asToolInput<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) { if (error instanceof SkillInputError) throw new ToolInputError({ message: error.message }); throw error; }
}

/**
 * Order: authorize -> parse -> fetch+validate -> already-installed check -> confirm -> write.
 * @complexity O(skill files + bytes) plus the human's latency.
 */
export function buildRegistrations(deps: SkillsInstallToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return buildDomainRegistrations({
    domain: "skills-install",
    catalogModule: "features/skills/install-tool.ts",
    catalog: indexCatalogById({ catalog }),
    derivedRisk,
    handlers: {
      [SKILLS_INSTALL_TOOL_ID]: async (ctx, optional = {}) => {
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.assistant.use" }, { entityType: "skill" });
        const input = requireInputRecord({ input: ctx.input });
        if (typeof input.githubUrl !== "string" || !input.githubUrl.trim() || Object.keys(input).some((key) => key !== "githubUrl")) {
          throw new ToolInputError({ message: "githubUrl (an https://github.com/... URL) is the only, required argument." });
        }
        const githubUrl = input.githubUrl.trim();
        const prepared = await asToolInput(() => prepareSkillInstall({ workspaceId: deps.workspaceId, githubUrl }, deps.skillFetch ? { fetchImpl: deps.skillFetch } : {}));
        if ((await listManagedSkills({ workspaceId: deps.workspaceId })).some((skill) => skill.toolId === prepared.toolId)) {
          throw new ToolInputError({ message: `Skill '${prepared.name}' is already installed. Remove it from the Skills screen before installing another version.` });
        }
        const outcome = await confirmSkill(surfaces, ctx, prepared, optional);
        if (!outcome.confirmed) return notConfirmedResult(outcome, prepared.name);
        const skill = await asToolInput(() => commitSkillInstall({ workspaceId: deps.workspaceId, prepared }));
        return { installed: true, skill, note: `Installed the ${skill.name} skill; it is on. Its tool ${skill.toolId} is picked up by the next search_tools call.` };
      },
    },
  });
}

/** Contributes `skills_install` as its own domain. */
export function contributeSkillsInstallTools(): ToolContributor {
  return { domain: "skills-install", build: buildRegistrations, risk: derivedRisk };
}
