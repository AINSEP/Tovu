export const WORKSPACE_ID = "workspace-local";

const BASE = "/api/admin/v1";

export interface AdminUser {
  id: string;
  username: string;
}

export interface AdminPost {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  bodyJson: Record<string, unknown>;
  status: "draft" | "published";
  updatedAt: string;
  version: number;
}

export interface PresentationSettings {
  workspaceId: string;
  activeThemeId: string;
  updatedAt: string;
}

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

export interface AdminAnalyticsHit {
  occurredAt: string;
  kind: "pageview" | "event";
  path: string;
  referrerHost: string | null;
  deviceClass: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  browserFamily: string | null;
  eventName: string | null;
}

export interface AdminMenuTarget {
  kind: "entryRef" | "termRef" | "url" | "route";
  entryId?: string;
  termId?: string;
  taxonomy?: string;
  href?: string;
  route?: string;
}

export interface AdminMenuItem {
  id: string;
  label?: string;
  target: AdminMenuTarget;
  children?: AdminMenuItem[];
}

export interface AdminMenu {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "trash";
  items: AdminMenuItem[];
  locations: string[];
  updatedAt: string;
  version: number;
}

export interface AdminMedia {
  id: string;
  workspaceId: string;
  title: string;
  alt: string;
  caption: string;
  credit: string;
  sha256: string;
  status: "active" | "trashed";
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AdminWebhookDeliverySummary {
  id: string;
  status: "pending" | "delivering" | "delivered" | "failed" | "dead" | "canceled";
  attempts: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface AdminWebhookSubscription {
  id: string;
  label: string;
  targetUrl: string;
  topics: string[];
  status: "active" | "paused" | "disabled";
  secretVersion: number;
  previousSecretVersion: number | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  lastDelivery: AdminWebhookDeliverySummary | null;
}

export interface AdminWebhookDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  topic: string;
  status: AdminWebhookDeliverySummary["status"];
  attempts: number;
  nextAttemptAt: string;
  lastResponseStatus: number | null;
  lastError: string | null;
  signedWithVersion: number | null;
  createdAt: string;
  deliveredAt: string | null;
  deadAt: string | null;
}

export interface AdminIdentityUser {
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

export interface AdminRole {
  id: string;
  workspaceId: string;
  name: string;
  isBuiltin: boolean;
}

export interface AdminPolicy {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isBuiltin: boolean;
  isFrozen: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  /** Canonical error `code` from the response body (`FORBIDDEN`, `GRANT_EXCEEDS_ISSUER`,
   * `VALIDATION_ERROR`, `RESOURCE_CONFLICT`, ...) when the server sent one — SPEC-006 errors.spec.md. */
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      String(body?.error ?? `request failed (${res.status})`),
      res.status,
      typeof body?.code === "string" ? body.code : undefined
    );
  }
  return body as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: AdminUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: AdminUser }>("/auth/me"),
  listPosts: () =>
    request<{ posts: Array<{ post: AdminPost }> }>(`/workspaces/${WORKSPACE_ID}/posts`),
  createPost: (title: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  getPost: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`),
  updatePost: (id: string, input: Pick<AdminPost, "title" | "slug" | "bodyJson" | "status">) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  listPages: () =>
    request<{ posts: Array<{ post: AdminPost }> }>(`/workspaces/${WORKSPACE_ID}/pages`),
  createPage: (title: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  getPresentation: () =>
    request<{ settings: PresentationSettings; availableThemeIds: string[] }>(
      `/workspaces/${WORKSPACE_ID}/presentation`
    ),
  setActiveTheme: (activeThemeId: string) =>
    request<{ settings: PresentationSettings; availableThemeIds: string[] }>(
      `/workspaces/${WORKSPACE_ID}/presentation`,
      { method: "PATCH", body: JSON.stringify({ activeThemeId }) }
    ),
  listMembers: () =>
    request<{ members: AdminMember[] }>(`/workspaces/${WORKSPACE_ID}/members`),
  getMember: (id: string) =>
    request<{ member: AdminMember }>(`/workspaces/${WORKSPACE_ID}/members/${id}`),
  disableMember: (id: string) =>
    request<{ member: AdminMember }>(`/workspaces/${WORKSPACE_ID}/members/${id}/disable`, {
      method: "POST",
    }),
  requestMemberMagicLink: (email: string, redirectPath?: string) =>
    request<{ delivered: true }>(`/workspaces/${WORKSPACE_ID}/members/request-magic-link`, {
      method: "POST",
      body: JSON.stringify({ email, redirectPath }),
    }),
  listRecentAnalyticsHits: (limit?: number) =>
    request<{ hits: AdminAnalyticsHit[] }>(
      `/workspaces/${WORKSPACE_ID}/analytics/recent-hits${limit ? `?limit=${limit}` : ""}`
    ),
  listMenus: () =>
    request<{ menus: AdminMenu[] }>(`/workspaces/${WORKSPACE_ID}/menus`),
  getMenu: (id: string) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${id}`),
  createMenu: (input: { title: string; slug: string; items?: AdminMenuItem[] }) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMenuTree: (
    id: string,
    input: { expectedVersion: number; title?: string; slug?: string; items: AdminMenuItem[] }
  ) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  assignMenuLocation: (id: string, locationKey: string) =>
    request<{
      menu: AdminMenu;
      binding: { locationKey: string; menuId: string; boundAt: string };
      displacedMenu: AdminMenu | null;
    }>(`/workspaces/${WORKSPACE_ID}/menus/${id}/locations`, {
      method: "POST",
      body: JSON.stringify({ locationKey }),
    }),
  deleteMenu: (id: string, force?: boolean) =>
    request<{ menu: AdminMenu | null; purged: boolean }>(
      `/workspaces/${WORKSPACE_ID}/menus/${id}${force ? "?force=true" : ""}`,
      { method: "DELETE" }
    ),
  listIntegrationSubscriptions: () =>
    request<{ subscriptions: AdminWebhookSubscription[] }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions`
    ),
  createIntegrationSubscription: (input: { label: string; targetUrl: string; topics: string[] }) =>
    request<{ subscription: AdminWebhookSubscription }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  pauseIntegrationSubscription: (id: string, paused: boolean) =>
    request<{ subscription: AdminWebhookSubscription }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${id}/pause`,
      { method: "POST", body: JSON.stringify({ paused }) }
    ),
  deleteIntegrationSubscription: (id: string) =>
    request<{ subscription: AdminWebhookSubscription }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${id}`,
      { method: "DELETE" }
    ),
  listIntegrationDeliveries: (subscriptionId: string) =>
    request<{ deliveries: AdminWebhookDelivery[] }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${subscriptionId}/deliveries`
    ),
  listMedia: () => request<{ media: AdminMedia[] }>(`/workspaces/${WORKSPACE_ID}/media`),
  uploadMedia: (input: {
    filename: string;
    contentType: string;
    dataBase64: string;
    alt?: string;
    caption?: string;
    credit?: string;
  }) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMedia: (
    id: string,
    input: { title?: string; alt?: string; caption?: string; credit?: string }
  ) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  trashMedia: (id: string) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media/${id}/trash`, {
      method: "POST",
    }),
  deleteMedia: (id: string) =>
    request<{ purged: boolean }>(`/workspaces/${WORKSPACE_ID}/media/${id}`, {
      method: "DELETE",
    }),
  listUsers: () => request<{ users: AdminIdentityUser[] }>(`/workspaces/${WORKSPACE_ID}/users`),
  createUser: (input: { username: string; password: string; email?: string }) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  assignRole: (principalId: string, roleId: string) =>
    request<{ assignment: unknown }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/roles`, {
      method: "POST",
      body: JSON.stringify({ roleId }),
    }),
  attachPolicy: (principalId: string, policyId: string) =>
    request<{ attachment: unknown }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/policies`, {
      method: "POST",
      body: JSON.stringify({ policyId }),
    }),
  listRoles: () => request<{ roles: AdminRole[] }>(`/workspaces/${WORKSPACE_ID}/roles`),
  createRole: (name: string) =>
    request<{ role: AdminRole }>(`/workspaces/${WORKSPACE_ID}/roles`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  listPolicies: () => request<{ policies: AdminPolicy[] }>(`/workspaces/${WORKSPACE_ID}/policies`),
  createPolicy: (name: string, description?: string) =>
    request<{ policy: AdminPolicy }>(`/workspaces/${WORKSPACE_ID}/policies`, {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
};
