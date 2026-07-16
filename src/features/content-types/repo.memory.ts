import type { ContentTypeRepoPort, ContentTypeRevisionInput, IndexProvisionerPort, OutboxPort } from "./write-service";
import type { TeardownIndexProvisionerPort } from "./lifecycle";
import type { ContentTypeListPort } from "./list";
import type { ContentTypeRecord } from "./types";

/**
 * @file In-memory adapters for the `content-types` package's write/list ports (ADR-006 rule-of-two
 * "one being built now" half). Backs `server/app.ts`'s hermetic test/dev composition AND, until a
 * real SQLite adapter is built for this domain (a disclosed gap — see this dispatch's handoff),
 * `server/deps.ts`'s real running-server composition too — the same precedent `mediaRepo`/
 * `transformDefinitionRepo`/`memberRepo` already establish in both those files (in-process,
 * non-persistent-across-restarts rows are an accepted stand-in until each domain gets its own
 * `repo.sqlite.ts`).
 */

/** In-memory `ContentTypeRepoPort` + `ContentTypeListPort` double, keyed by `(workspaceId, key)`. */
export class InMemoryContentTypeRepo implements ContentTypeRepoPort, ContentTypeListPort {
  private readonly rows = new Map<string, ContentTypeRecord>();
  private readonly revisions: ContentTypeRevisionInput[] = [];

  private static key(workspaceId: string, key: string): string {
    return `${workspaceId}::${key}`;
  }

  async save(row: ContentTypeRecord): Promise<void> {
    this.rows.set(InMemoryContentTypeRepo.key(row.workspaceId, row.key), { ...row });
  }

  async appendRevision(revision: ContentTypeRevisionInput): Promise<void> {
    this.revisions.push(revision);
  }

  async findByKey(params: { workspaceId: string; key: string }): Promise<ContentTypeRecord | null> {
    const row = this.rows.get(InMemoryContentTypeRepo.key(params.workspaceId, params.key));
    return row ? { ...row } : null;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async listByWorkspace(params: { workspaceId: string }): Promise<ContentTypeRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === params.workspaceId).map((row) => ({ ...row }));
  }
}

/** In-memory `IndexProvisionerPort` + `TeardownIndexProvisionerPort` no-op double. Real DDL index
 * provisioning (`index-provisioning.ts`'s CAST-mapping) targets `content.db` tables this domain
 * has no SQLite adapter for yet (see this file's header) — a no-op here is honest given that, not
 * a shortcut around a working implementation. */
export class NoopContentTypeIndexProvisioner implements IndexProvisionerPort, TeardownIndexProvisionerPort {
  async provisionIndexesForNewContentType(): Promise<void> {}
  async applyFieldIndexTransitions(): Promise<void> {}
  async tearDownAllIndexesForContentType(): Promise<void> {}
}

/** Adapts a real `core/ports` `OutboxPort` (`{name,payload}` -> full `DomainEvent`) into the
 * narrower `{enqueue({name,payload})}` shape this package's write-service/lifecycle modules
 * declare locally (mirrors their own "no shared import, kept decoupled" convention). */
export function toContentTypeOutbox(deps: {
  outbox: { enqueue(event: { id: string; name: string; occurredAt: string; payload: Record<string, unknown> }): Promise<void> };
  clock: { nowIso(): string };
  idGen: { newId(): string };
}): OutboxPort {
  return {
    enqueue: async (event) => {
      await deps.outbox.enqueue({ id: deps.idGen.newId(), name: event.name, occurredAt: deps.clock.nowIso(), payload: event.payload });
    },
  };
}
