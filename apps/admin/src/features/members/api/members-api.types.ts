export interface AdminMember {
  id: string;
  workspaceId: string;
  email: string;
  name?: string;
  status: "pending" | "active" | "disabled";
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
