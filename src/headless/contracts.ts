/**
 * A theme id. Open string since SPEC-004: themes are discovered from disk, so
 * the valid set is dynamic (the built-in trio was the pre-SPEC-004 hardcode).
 * Clients read the current valid ids from `availableThemeIds`.
 */
export type HeadlessThemeId = string;

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

export interface AdminPostEnvelope {
  post: AdminPost;
}

export interface ContentPost {
  id: string;
  title: string;
  slug: string;
  bodyJson: Record<string, unknown>;
  updatedAt: string;
}

export interface AdminPresentation {
  settings: {
    workspaceId: string;
    activeThemeId: HeadlessThemeId;
    updatedAt: string;
  };
  availableThemeIds: HeadlessThemeId[];
}

export interface ContentPostPayload {
  post: ContentPost;
  presentation: {
    activeThemeId: HeadlessThemeId;
  };
}
