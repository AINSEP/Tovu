import type { ClockPort, DomainEvent, IdGeneratorPort, OutboxPort, UUID } from "../../core/ports";

/**
 * @file Workspace creation vertical slice (domain logic).
 *
 * Purpose:
 * Encapsulates business rules for creating a workspace.
 *
 * How it relates to the project:
 * - Imports abstractions from `src/core/ports.ts` (no framework/db coupling).
 * - Uses `WorkspaceRepoPort` for persistence and `OutboxPort` for event enqueue.
 * - Is invoked by `src/server/app.ts` inside the HTTP route.
 * - Is verified by tests in `src/features/workspace/__tests__`.
 *
 * Architectural role:
 * Demonstrates the intended slice pattern:
 * validate -> check constraints -> persist -> enqueue domain event.
 */
export interface WorkspaceRecord {
  id: UUID;
  name: string;
  slug: string;
  createdAt: string;
}

/** Workspace persistence contract for this slice. */
export interface WorkspaceRepoPort {
  insert(record: WorkspaceRecord): Promise<void>;
  findBySlug(slug: string): Promise<WorkspaceRecord | null>;
}

/** Command payload for workspace creation. */
export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

/** Dependencies required by the create-workspace slice. */
export interface CreateWorkspaceDeps {
  idGen: IdGeneratorPort;
  clock: ClockPort;
  repo: WorkspaceRepoPort;
  outbox: OutboxPort;
}

/** Required parameters for createWorkspace. */
export interface CreateWorkspaceRequired {
  deps: CreateWorkspaceDeps;
  input: CreateWorkspaceInput;
}

/** Optional parameters for createWorkspace. Reserved for future use. */
export interface CreateWorkspaceOptional {}

/** Thrown when incoming command data is invalid. */
export class WorkspaceValidationError extends Error {}

/** Thrown when uniqueness constraints are violated. */
export class WorkspaceConflictError extends Error {}

/**
 * Execute create-workspace command.
 *
 * Synchronous path:
 * - validate input
 * - check uniqueness
 * - write workspace record
 *
 * Asynchronous path:
 * - enqueue `workspace.created` domain event to outbox
 */
export async function createWorkspace(
  required: CreateWorkspaceRequired,
  _optional: CreateWorkspaceOptional = {}
): Promise<{ id: UUID }> {
  const { deps, input } = required;
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  if (!name) throw new WorkspaceValidationError("name is required");
  if (!slug.match(/^[a-z0-9-]+$/)) {
    throw new WorkspaceValidationError("slug must use lowercase letters, numbers, and dashes");
  }

  const existing = await deps.repo.findBySlug(slug);
  if (existing) throw new WorkspaceConflictError(`slug '${slug}' already exists`);

  const now = deps.clock.nowIso();
  const id = deps.idGen.newId();

  await deps.repo.insert({ id, name, slug, createdAt: now });

  const event: DomainEvent<{ workspaceId: UUID; slug: string }> = {
    id: deps.idGen.newId(),
    name: "workspace.created",
    occurredAt: now,
    aggregateId: id,
    workspaceId: id,
    payload: { workspaceId: id, slug },
  };

  await deps.outbox.enqueue(event);
  return { id };
}
