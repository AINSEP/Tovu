import type { Express } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { createMemberAccessResolver } from "#src/features/members/index";
import { toPublicMemberResponse } from "../../http/members.js";
import { checkMemberWorkspace, type MemberPublicRouteDeps } from "./deps.js";
import { sendMemberAuthError, MEMBER_SESSION_COOKIE } from "./complete-sign-in.js";
import { MemberLoginError } from "#src/features/member-login/index";
import { uniqueMemberCookie, sendMemberOidcError, type MemberOidcRouteDeps } from "./oidc-deps.js";

/** Never cache identity; resolver validates sessions, then the member row enforces current status. */
export function registerPublicMemberMeRoute(app: Express, deps: MemberPublicRouteDeps, options: { login?: MemberOidcRouteDeps } = {}): void {
  const resolver = createMemberAccessResolver({ deps });
  app.get("/api/members/v1/workspaces/:workspaceId/me", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (!checkMemberWorkspace({ req, res, deps })) return;
      const context = await resolver.resolveContext({ workspaceId: deps.workspaceId, nowIso: nowIso({ clock: deps.clock }),
        sessionToken: uniqueMemberCookie({ req, name: MEMBER_SESSION_COOKIE }) });
      const member = context.memberId ? await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: context.memberId }) : null;
      const visible = member && (member.status === "active" || member.status === "pending") ? member : null;
      const identities = visible ? await publicMemberIdentities({ memberId: visible.id, deps: options.login }) : [];
      res.json({ member: visible ? toPublicMemberResponse(visible) : null, identities });
    } catch (error) {
      if (error instanceof MemberLoginError) { sendMemberOidcError({ res, error }); return; }
      sendMemberAuthError({ res, error });
    }
  });
}

/** Expose labels/IDs only, including a disconnected provider so members can still unlink it.
 * Subjects, issuer, timestamps and unlinked markers stay internal. O(p) member providers.
 */
async function publicMemberIdentities({ memberId, deps }: { memberId: string; deps?: MemberOidcRouteDeps }, _options = {}) {
  if (!deps) return [];
  const identities = await deps.links.identities.listByMember({ workspaceId: deps.members.workspaceId, memberId });
  const linked = identities.filter(identity => !identity.unlinkedAt);
  if (!linked.length) return [];
  // Provider availability must not prevent account access/unlink after a plugin is disabled.
  const providers = await deps.listProviders({ workspaceId: deps.members.workspaceId }).catch(() => []);
  const labels = new Map(providers.map(provider => [provider.id, provider.label]));
  return linked.map(identity => ({ providerId: identity.providerId, label: labels.get(identity.providerId) ?? identity.providerId }));
}
