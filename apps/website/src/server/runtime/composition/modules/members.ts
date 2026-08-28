import { registerAdminMemberListRoute } from "../../../inbound/admin-http/routes/members/list.js";
import { registerAdminMemberGetRoute } from "../../../inbound/admin-http/routes/members/get-by-id.js";
import { registerAdminMemberDisableRoute } from "../../../inbound/admin-http/routes/members/disable.js";
import { registerAdminMemberRequestMagicLinkRoute } from "../../../inbound/admin-http/routes/members/request-magic-link.js";
import type { MembersRouteDeps } from "../../../inbound/admin-http/routes/members/deps.js";
import { registerPublicMemberSignInRequestRoute } from "../../../inbound/public-http/routes/members/sign-in.js";
import { registerPublicMemberCompleteSignInRoute } from "../../../inbound/public-http/routes/members/complete-sign-in.js";
import type { MemberPublicRouteDeps } from "../../../inbound/public-http/routes/members/deps.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-038) — the `members` server module (ADR-030 Members admin CRUD +
 * ADR-PIPE-013 public sign-in).
 *
 * Owns 6 registrations: 4 admin CRUD/list routes (list/get/disable/request-magic-link) plus 2
 * public, unauthenticated sign-in routes (sign-in-request/complete-sign-in) — moved here verbatim
 * from `app.ts`'s `createApp()`, same registrar function bodies, no behavior change, same relative
 * order.
 *
 * Genuinely needs TWO deps objects, not one: `MembersRouteDeps`/`MemberPublicRouteDeps` already
 * existed pre-slice as a deliberate split (`routes/admin/members/deps.ts`/`routes/members/deps.ts`)
 * — the public sign-in family must never carry an `authorize`/session field (ADR-PIPE-013
 * Enforcement: "no route in either family may read the other's cookie"), while the admin family
 * needs the full session-gated surface. This module does not force them into one shape; see those
 * two files' own headers for the full split rationale.
 *
 * `MembersRouteDeps extends RouteDeps` (a widening, not a narrowing — see that file's header, which
 * documents this as a historical artifact awaiting `RouteDeps` to carry the fields directly), so
 * `deps.admin` is passed straight through to each admin registrar's existing `RouteRegistrar`
 * (`(app, deps: RouteDeps) => void`) signature unchanged; no retyping of those 4 route files was
 * needed or done, unlike `media`/`taxonomy` in SPEC-034 (which were genuine narrowings).
 */
export function createMembersModule(deps: {
  admin: MembersRouteDeps;
  public: MemberPublicRouteDeps;
}): ServerModuleHandle {
  return {
    name: "members",
    registerRoutes: (app) => {
      registerAdminMemberListRoute(app, deps.admin);
      registerAdminMemberGetRoute(app, deps.admin);
      registerAdminMemberDisableRoute(app, deps.admin);
      registerAdminMemberRequestMagicLinkRoute(app, deps.admin);
      registerPublicMemberSignInRequestRoute(app, deps.public);
      registerPublicMemberCompleteSignInRoute(app, deps.public);
    },
  };
}
