export interface AdminIdentityUser {
  /** Server capability: the seeded owner cannot be renamed. */
  canRename?: boolean;
  isOwner?: boolean;
  isProtectedAccount?: boolean;
  principalId: string;
  workspaceId: string;
  username: string;
  email?: string;
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt?: string;
  roleIds: string[];
  policyIds: string[];
}
