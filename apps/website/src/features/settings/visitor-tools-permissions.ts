import { registerPermission } from "@jini-ai/user-management";
import type { PermissionGrantRegistry } from "../identity/permission-grants.js";
import { VISITOR_TOOLS_PERMISSION } from "../../contracts/site-assistant/visitor-tools.js";

/** Reconcile fresh and existing owner/admin policies through the existing additive boot owner.
 * Review F12 grants management to owner/admin, never editor/viewer. @complexity O(1).
 * @example registerVisitorToolsPermissionGrants({ registry });
 */
export function registerVisitorToolsPermissionGrants({ registry }: { registry: PermissionGrantRegistry }, _options = {}): void {
  registerPermission({ id: VISITOR_TOOLS_PERMISSION, owner: "visitor-tools",
    description: "Choose which tools anonymous site visitors' chat may use, and their limits." });
  for (const role of ["owner", "admin"]) registry.roleGrants.register({ role, permission: VISITOR_TOOLS_PERMISSION,
    reason: "Visitor-tools T2 / T1-J1 review F12: owner and admin manage the public visitor tool policy." });
}
