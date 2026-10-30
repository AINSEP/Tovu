/** Shared hosted sign-in path recognition; URL admission remains caller-owned. */

/** Recognizes only this host adapter's path; callers still own URL origin/scheme admission. */
export function isHostedSignInLinkPath(required: { readonly pathname: string }, _optional: Record<string, never> = {}): boolean {
  return /^\/api\/admin\/v1\/workspaces\/[^/]+\/agent-plugins\/connections\/sign-in\/[A-Za-z0-9_-]{43}$/.test(required.pathname);
}
