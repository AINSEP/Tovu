import { api } from "@/lib/api";
import type { SecurityPermissionsPort } from "./security-permissions-port.hooks";

/**
 * @file The only place `use-security-permissions.hooks.ts` reaches `lib/api` — see
 * `security-permissions-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `comments-dependencies
 *  .hooks.ts`'s `defaultCommentsPort`. */
export const defaultSecurityPermissionsPort: SecurityPermissionsPort = {
  me: () => api.me(),
};
