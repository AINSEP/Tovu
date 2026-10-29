import type { Request, Response } from "express";
import type { MemberSignInResult } from "#src/features/members/index";
import { captureVisitorEvent, type VisitorAnalyticsDeps } from "../../visitor-analytics.js";

/** One session outcome after its authoritative owner commits. Account metadata stays local.
 * @complexity O(1). */
export function captureMemberSignedIn(
  { deps, request, result, method, workspaceId }: { deps: VisitorAnalyticsDeps; request: Request; result: MemberSignInResult;
    method: "password" | "challenge" | "oidc"; workspaceId: string },
  _optional: Record<string, never> = {},
): void {
  const subjectId = `member:${workspaceId}:${result.member.id}`;
  void captureVisitorEvent({ deps, request, name: "member_signed_in", properties: {
    eventId: `member-signed-in:${result.session.id}`, method, realm: "member", isNewMember: result.isNewMember === true,
  } }, { subjectId });

}

/** Observe refused password/challenge responses once, including validation and rate-limit exits.
 * OIDC redirect failures are captured by their fixed redirect error path. @complexity O(1). */
export function observeMemberSignInFailure(
  { deps, request, response, method }: { deps: VisitorAnalyticsDeps; request: Request; response: Response;
    method: "password" | "challenge" | "oidc" },
  _optional: Record<string, never> = {},
): void {
  response.once("finish", () => {
    if (response.statusCode < 400) return;
    void captureVisitorEvent({ deps, request, name: "member_sign_in_failed", properties: {
      method, realm: "member", reasonClass: "authentication_failed",
    } });
  });
}
