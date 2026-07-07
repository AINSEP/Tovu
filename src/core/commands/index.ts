/**
 * @file Public surface of the command gateway module (ADR-018).
 *
 * The admin mutation write path: `executeCommand` records an auditable,
 * revertible change set; `revertChangeSet` undoes one via the inverse-applier
 * registry. Adapters implement `ChangeSetRepoPort`.
 */
export * from "./change-set";
export * from "./command";
export * from "./appliers";
export * from "./revert";
export { InMemoryChangeSetRepo } from "./repo.memory";
