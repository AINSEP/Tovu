/**
 * @file What `use-security-permissions.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import — same shape as `comments-port.hooks.ts`'s `CommentsPort`
 * and `use-external-mcp-admissions.hooks.ts`'s `ExternalMcpAdmissionsPort.me`.
 */
export interface SecurityPermissionsPort {
  /** Narrowed to the one field this hook reads — the real `api.me()` also returns `user`, which
   *  this hook never uses. Matches `comments-port.hooks.ts`'s identical narrowing. */
  me(): Promise<{ effectivePermissions?: string[] }>;
}
