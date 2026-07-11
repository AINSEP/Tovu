import { MemberValidationError, requestSignInLink } from "../../../../members";
import type { RouteRegistrar } from "../../../routes/types";
import { toMembersWriteServiceDeps, type MembersRouteDeps } from "./deps";

/**
 * POST request a passwordless sign-in link for a member email (operator-
 * triggered resend, e.g. from an admin member-detail screen's "resend
 * sign-in link" action).
 *
 * Always resolves `{ delivered: true }` for a syntactically valid email — the
 * write-service's constant-response anti-enumeration behavior (ADR-030 OQ-8:
 * a distinguishable response would let a caller probe which emails are
 * registered) is preserved end-to-end. A malformed email is the only path
 * that reaches the 400 branch below.
 */
export const registerAdminMemberRequestMagicLinkRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/members/request-magic-link", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const result = await requestSignInLink({
        deps: toMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          email: String(req.body?.email ?? ""),
          redirectPath: req.body?.redirectPath ? String(req.body.redirectPath) : undefined,
        },
      });

      res.json(result);
    } catch (err) {
      if (err instanceof MemberValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
