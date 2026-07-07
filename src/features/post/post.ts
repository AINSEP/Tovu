import type { ClockPort, JsonObject, UUID } from "../../core/ports";

export type PostStatus = "draft" | "published";

export interface PostRecord {
  id: UUID;
  workspaceId: UUID;
  title: string;
  slug: string;
  bodyJson: JsonObject;
  status: PostStatus;
  updatedAt: string;
  version: number;
}

export interface PostRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<PostRecord | null>;
  findBySlug(required: { workspaceId: UUID; slug: string }): Promise<PostRecord | null>;
  list(required: { workspaceId: UUID }): Promise<PostRecord[]>;
  save(record: PostRecord): Promise<void>;
}

export interface UpdatePostInput {
  workspaceId: UUID;
  id: UUID;
  title: string;
  slug: string;
  bodyJson: JsonObject;
  status: PostStatus;
}

export interface UpdatePostDeps {
  clock: ClockPort;
  repo: PostRepoPort;
}

export interface UpdatePostRequired {
  deps: UpdatePostDeps;
  input: UpdatePostInput;
}

export interface UpdatePostOptional {}

export interface GetPostByIdRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; id: UUID };
}

export interface GetPostBySlugRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; slug: string };
}

export interface GetPostOptional {}

export class PostNotFoundError extends Error {}
export class PostValidationError extends Error {}
export class PostConflictError extends Error {}

export async function updatePost(
  required: UpdatePostRequired,
  _optional: UpdatePostOptional = {}
): Promise<{ post: PostRecord }> {
  const { deps, input } = required;
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) throw new PostNotFoundError(`post '${input.id}' was not found`);

  const title = input.title.trim();
  const slug = input.slug.trim().toLowerCase();

  if (!title) throw new PostValidationError("title is required");
  if (!slug.match(/^[a-z0-9-]+$/)) {
    throw new PostValidationError("slug must use lowercase letters, numbers, and dashes");
  }
  if (!isJsonObject(input.bodyJson)) {
    throw new PostValidationError("bodyJson must be a JSON object");
  }
  if (input.status !== "draft" && input.status !== "published") {
    throw new PostValidationError("status must be 'draft' or 'published'");
  }

  const duplicate = await deps.repo.findBySlug({ workspaceId: input.workspaceId, slug });
  if (duplicate && duplicate.id !== input.id) {
    throw new PostConflictError(`slug '${slug}' already exists`);
  }

  const post: PostRecord = {
    ...existing,
    title,
    slug,
    bodyJson: input.bodyJson,
    status: input.status,
    updatedAt: deps.clock.nowIso(),
    version: existing.version + 1,
  };

  await deps.repo.save(post);
  return { post };
}

export interface ListPostsRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID };
}

/** List all posts in a workspace for admin views (drafts included). */
export async function listAdminPosts(
  required: ListPostsRequired,
  _optional: GetPostOptional = {}
): Promise<{ posts: PostRecord[] }> {
  const posts = await required.deps.repo.list({ workspaceId: required.input.workspaceId });
  return { posts };
}

/** List published posts for the public site. */
export async function listPublishedPosts(
  required: ListPostsRequired,
  _optional: GetPostOptional = {}
): Promise<{ posts: PostRecord[] }> {
  const posts = await required.deps.repo.list({ workspaceId: required.input.workspaceId });
  return { posts: posts.filter((post) => post.status === "published") };
}

export async function getAdminPostById(
  required: GetPostByIdRequired,
  _optional: GetPostOptional = {}
): Promise<{ post: PostRecord }> {
  const { workspaceId, id } = required.input;
  const post = await required.deps.repo.findById({ workspaceId, id });
  if (!post) throw new PostNotFoundError(`post '${id}' was not found`);
  return { post };
}

export async function getPublishedPostBySlug(
  required: GetPostBySlugRequired,
  _optional: GetPostOptional = {}
): Promise<{ post: PostRecord }> {
  const { workspaceId } = required.input;
  const slug = required.input.slug.trim().toLowerCase();
  const post = await required.deps.repo.findBySlug({ workspaceId, slug });
  if (!post || post.status !== "published") {
    throw new PostNotFoundError(`post '${slug}' was not found`);
  }
  return { post };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
