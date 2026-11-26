import { buildMembersRegistrations as build, membersDerivedRisk, type MembersToolDeps as Deps } from "@jini-ai/user-management/members/tool-registrations";
import { membersAgentToolCatalog } from "@jini-ai/user-management/members/agent-tools";
import type { ToolContributor } from "@jini-ai/core";
import { contentReadVocabulary } from "#src/contracts/core/tool-metadata/content-read";
import { membersMailTransport } from "./mail-transport.js";

export type MembersToolDeps = Omit<Deps, "catalog" | "hostReads" | "mailTransport">;

export function buildMembersRegistrations(deps: MembersToolDeps) {
  return build({ ...deps, catalog: membersAgentToolCatalog, hostReads: contentReadVocabulary, mailTransport: membersMailTransport });
}

export function contributeMembersTools(): ToolContributor<MembersToolDeps, unknown> {
  return { domain: "members", build: buildMembersRegistrations, risk: membersDerivedRisk };
}
