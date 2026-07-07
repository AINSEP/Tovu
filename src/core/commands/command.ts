import type {
  ClockPort,
  DomainEvent,
  IdGeneratorPort,
  JsonObject,
  OutboxPort,
  UUID,
} from "../ports";
import type { ChangeSetOperation, ChangeSetRepoPort } from "./change-set";

/**
 * @file The single mutation write path (ADR-008 §4).
 *
 * Purpose:
 * Every admin mutation — human save or AI tool call — runs through
 * `executeCommand`, which captures the inverse, executes the feature call, and
 * records an auto-applied single-item change set. Audit trail by construction.
 *
 * How it relates to the project:
 * - Wraps `features/*` mutation functions; never contains domain logic itself.
 * - Persists via `ChangeSetRepoPort`; announces via the outbox when provided.
 * - `revert.ts` consumes the recorded inverse payloads to undo change sets.
 *
 * Architectural role:
 * The gate that makes "auditable and undoable" a property of the system rather
 * than a per-feature effort. Proposed (unapplied) multi-item change sets for
 * agent plans build on this same envelope later.
 */

/** Principal executing a command. Agents act on behalf of a user. */
export interface CommandActor {
  id: UUID;
  kind: "user" | "agent";
  /** User the agent is acting for; unset for direct human commands. */
  onBehalfOfId?: UUID;
}

/** Cross-cutting command metadata; the mutation itself lives in `CommandMutation`. */
export interface CommandEnvelope {
  workspaceId: UUID;
  actor: CommandActor;
  /** Human-readable description recorded on the change set. */
  summary: string;
  /** Supplied by retry-capable callers (agents must always send one). */
  idempotencyKey?: string;
  /** Chat message / plan step that motivated this command. */
  intentRef?: string;
}

/** The entity write a command performs, with its inverse capture. */
export interface CommandMutation<TResult> {
  entityType: string;
  entityId: UUID;
  operation: ChangeSetOperation;
  /**
   * Snapshot whatever is needed to undo this mutation, read *before* execute.
   * Return null when no inverse exists — the change set is then recorded but
   * cannot be reverted (and agents must not be offered this mutation).
   */
  captureInverse(): Promise<JsonObject | null>;
  /** The actual feature call. Runs only after inverse capture succeeds. */
  execute(): Promise<TResult>;
  /**
   * Read the entity's version from the execute result (the version *after* the
   * mutation, REQ-08 / AC-02). Stamped onto the item as the revert guard input.
   * Omit for entity types without a version.
   */
  captureEntityVersion?(result: TResult): number | null;
  /**
   * Compensating rollback for the memory adapter's all-or-nothing guarantee
   * (REQ-01 / BR-04 / EC-08 / AC-17). If the change-set record fails to persist
   * *after* `execute()` has applied the feature mutation, the gateway calls this
   * to undo the mutation — restoring the entity to its exact pre-`execute` state
   * (verbatim, including `version`) so no "mutation without a record" survives
   * (INV-01). On the SQLite adapter (RT-004) a real transaction replaces this and
   * `rollback` becomes a no-op/omitted. Omit only for a mutation whose record step
   * cannot fail independently of its feature write (none in v1).
   */
  rollback?(): Promise<void>;
}

/** Dependencies for executeCommand. */
export interface ExecuteCommandDeps {
  clock: ClockPort;
  idGen: IdGeneratorPort;
  changeSets: ChangeSetRepoPort;
  /** When provided, `change-set.applied` is enqueued for async consumers. */
  outbox?: OutboxPort;
}

/** Required parameters for executeCommand. */
export interface ExecuteCommandRequired<TResult> {
  deps: ExecuteCommandDeps;
  command: CommandEnvelope;
  mutation: CommandMutation<TResult>;
}

/** Optional parameters for executeCommand. Reserved for future use. */
export interface ExecuteCommandOptional {}

/**
 * Thrown when a command's idempotency key was already used in the workspace.
 * Callers should re-read current state instead of retrying the mutation.
 */
export class DuplicateCommandError extends Error {
  readonly changeSetId: UUID;

  constructor(message: string, changeSetId: UUID) {
    super(message);
    this.changeSetId = changeSetId;
  }
}

/**
 * Execute a mutation through the command gateway.
 *
 * Order matters: idempotency check → inverse capture → execute → record.
 * If execute throws, nothing is recorded; if inverse capture throws, the
 * mutation never runs.
 *
 * The feature mutation and its change-set record commit as one unit of work
 * (REQ-01 / BR-04): if `changeSets.insert` fails after `execute` has applied the
 * mutation, the gateway rolls the mutation back via `mutation.rollback` and
 * re-throws, so no change set and no outbox event survive (EC-08 / AC-17,
 * INV-01). Outbox enqueue is the only step outside this boundary (BR-04) — an
 * enqueue failure propagates but never rolls back the committed change set.
 */
export async function executeCommand<TResult>(
  required: ExecuteCommandRequired<TResult>,
  _optional: ExecuteCommandOptional = {}
): Promise<{ result: TResult; changeSetId: UUID }> {
  const { deps, command, mutation } = required;

  if (command.idempotencyKey) {
    const existing = await deps.changeSets.findByIdempotencyKey({
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
    });
    if (existing) {
      throw new DuplicateCommandError(
        `command with idempotency key '${command.idempotencyKey}' was already executed`,
        existing.id
      );
    }
  }

  const inversePayload = await mutation.captureInverse();
  const result = await mutation.execute();

  const entityVersionAtApply = mutation.captureEntityVersion?.(result) ?? undefined;

  const now = deps.clock.nowIso();
  const changeSetId = deps.idGen.newId();

  // Unit of work: the change-set record must land, or the feature mutation is
  // rolled back (REQ-01 / BR-04 / EC-08). On the in-memory adapter this is a
  // compensating restore via `mutation.rollback`; the SQLite adapter (RT-004)
  // does this as one real transaction and the rollback becomes a no-op.
  try {
    await deps.changeSets.insert(
      {
        id: changeSetId,
        workspaceId: command.workspaceId,
        actorId: command.actor.id,
        status: "applied",
        summary: command.summary,
        idempotencyKey: command.idempotencyKey,
        intentRef: command.intentRef,
        createdAt: now,
        appliedAt: now,
      },
      [
        {
          id: deps.idGen.newId(),
          changeSetId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          operation: mutation.operation,
          inversePayload: inversePayload ?? undefined,
          entityVersionAtApply,
          position: 0,
        },
      ]
    );
  } catch (recordError) {
    // AC-17 / EC-08: the mutation applied but its record did not. Undo the
    // mutation so INV-01 holds (no mutation without a record). We surface the
    // original persist error; a rollback that itself throws is a harder failure
    // that the SQLite transaction path is designed to remove.
    await mutation.rollback?.();
    throw recordError;
  }

  if (deps.outbox) {
    const event: DomainEvent<{ changeSetId: UUID; entityType: string; entityId: UUID }> = {
      id: deps.idGen.newId(),
      name: "change-set.applied",
      occurredAt: now,
      aggregateId: changeSetId,
      workspaceId: command.workspaceId,
      actorId: command.actor.id,
      changeSetId,
      payload: {
        changeSetId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
      },
    };
    await deps.outbox.enqueue(event);
  }

  return { result, changeSetId };
}
