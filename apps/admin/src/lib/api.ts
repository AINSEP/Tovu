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

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    throw new ApiError(String(body?.error ?? `request failed (${res.status})`), res.status);
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
  getPost: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`),
  updatePost: (id: string, input: Pick<AdminPost, "title" | "slug" | "bodyJson" | "status">) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
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
};
