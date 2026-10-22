import { ensureSettingDefinitions, InMemorySettingsRepo, type SetValueRequired } from "@jini-ai/core/settings";
import { ensurePublicAssistantSettingDefinitions } from "../../../assistant/public-assistant-settings.js";
import { readVisitorToolPolicy } from "../../../assistant/site/visitor-tool-settings.js";
import { writeVisitorTools } from "../visitor-tools-write.js";
import { VISITOR_TOOLS_PERMISSION, VISITOR_TOOLS_SETTING } from "../../../contracts/site-assistant/visitor-tools.js";
export const ws = "visitor-site";
export const off = { version: 1, tools: { list_categories: { mode: "off" } } };
export async function visitorSettingsFixture() {
  let id = 0;
  const permissions: string[] = [], reports: unknown[] = [];
  const repo = new InMemorySettingsRepo();
  const grants = new Set([VISITOR_TOOLS_PERMISSION]);
  const clock = { nowMs: () => 0, nowIso: () => "1970-01-01T00:00:00.000Z" };
  const deps: SetValueRequired["deps"] = { repo, clock, ids: { newId: () => `visitor-settings-${++id}` },
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed: grants.has(permission), reason: "test" }; },
    principals: { findActiveById: async ({ id }) => ({ id }) } };
  await ensurePublicAssistantSettingDefinitions({ settingsRepo: repo, clock, ids: deps.ids, principals: deps.principals, ensureSettingDefinitions }, { workspaceId: ws, systemPrincipalId: "boot" });
  const read = () => readVisitorToolPolicy({ settingsRepo: repo, workspaceId: ws, reportError: error => { reports.push(error); } });
  return { repo, deps, grants, permissions, reports, read,
    write: (value: unknown = off) => writeVisitorTools({ deps, value, workspaceId: ws, callerPrincipalId: "owner" }),
    input: { ...VISITOR_TOOLS_SETTING, workspaceId: ws, authWorkspaceId: ws, scope: "workspace" as const, callerPrincipalId: "owner", value: off as SetValueRequired["input"]["value"] },
  };
}
