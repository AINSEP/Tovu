import { executeCommand } from "@jini-ai/cms/core";
import type { JsonObject } from "@jini-ai/cms/core";

import { PublishContentApplyRowError } from "./apply-errors.js";
import { contentHash, CONTENT_HASH_VERSION } from "./content-hash.js";
import { addressHeldByOther, changedSincePlan, notWired, trashedAtDestination } from "./precheck-reasons.js";
import type { PackedEntity, PublishContentContributor, PublishContentDeps, PublishContentHandler } from "./type-registry.js";

/**
 * @file Slice F1 of `ADS-memory/.local-artifacts/plan-publish-all-types-2026-09-25.md` — the generic
 * `PublishContentHandler` factory (plan §2). About 60% of every existing repo-backed handler
 * (`post`/`page`, `media`, `menu`, `redirect`) is the identical shape this file now owns once:
 * trash-skip on pack, a second-unique-address precheck, the trashed-at-destination refusal, the
 * three optimistic-concurrency CAS cases at apply, mapping a thrown domain error to a per-row report
 * outcome, and the optional `executeCommand`-wrapped write with compensating rollback. The migrations
 * that put the existing handlers onto this factory are later slices (M-RED/M-MENU/M-MED/M-POST); this
 * slice builds and tests the factory in isolation, with no real type wired to it yet.
 *
 * `dependsOn` on the returned handler lists only references the destination's write path validates
 * AT WRITE TIME — see `type-registry.ts`'s `PublishContentHandler.dependsOn` doc. A soft/render-time
 * reference (e.g. a widget embed, a relation field) needs no ordering entry; G3's scope closure is
 * what makes sure such references still arrive in the same publish run.
 *
 * Zero-import discipline: this module imports only `type-registry.ts`'s TYPES (never
 * `registerPublishContentContributor`), plus `content-hash.ts`, `apply-errors.ts`,
 * `precheck-reasons.ts`, and `executeCommand`/`JsonObject` from `@jini-ai/cms/core` — the same
 * dependency shape every hand-written `features/<type>/publish-content.ts` file already has, so a
 * config built on this factory sits at the identical place in the dependency graph a hand-written one
 * would.
 */

/** What a factory-packed field contributes: `"transferred"` travels on the wire AND is hashed,
 *  `"provenance"` travels on the wire but is excluded from the hash (a value the destination cannot
 *  be made to hold identically — see `features/redirects/publish-content.ts`'s own doc for the
 *  defect this distinction prevents), `"local"` never leaves the source row at all. */
export type FieldDisposition = "transferred" | "provenance" | "local";

/** An error constructor, used only for `instanceof` matching in {@link RepoPublishTypeConfig.errors}
 *  — never invoked by the factory itself. */
type ErrorClass = abstract new (...args: never[]) => Error;

/** Everything a type's {@link RepoPublishTypeConfig.write} needs to perform its one write — assembled
 *  by the factory so `write` never has to re-derive the destination row, the CAS basis, or which
 *  ports/deps it was given. */
export interface RepoWriteContext<Row, Ports> {
  readonly ports: Ports;
  readonly deps: PublishContentDeps;
  readonly workspaceId: string;
  /** The packed id (row id or natural key) — `PackedEntity.id`. */
  readonly id: string;
  /** Packed state, already validated by precheck. */
  readonly state: Record<string, unknown>;
  /** The destination row, already CAS-checked by the factory before `write` is ever called. */
  readonly existing: Row | null;
  readonly expectedVersion: number | undefined;
  readonly principalId: string;
}

/**
 * One publishable type's contribution to {@link createRepoPublishHandler} — the config every
 * factory-built `contribute<Type>Publish()` writes instead of a hand-rolled
 * `PublishContentHandler`. See the plan's §2.1 design sketch for the full field-by-field reasoning;
 * this is that interface, typed in.
 */
export interface RepoPublishTypeConfig<Row, Ports> {
  readonly entityType: string;
  /** Defaults to 1. */
  readonly schemaVersion?: number;
  /** This type's own existing write permission — used both as the handler's `permission` and, when
   *  {@link undo} is set, as the `executeCommand` command's `permission`. */
  readonly permission: string;
  /** Types that must apply before this one — write-time-validated references only. */
  readonly dependsOn?: readonly string[];

  /** This type's ports from the shared deps bag. `undefined` means not wired on this instance: pack
   *  yields nothing, inspect returns `null`, precheck refuses, apply throws — the one absent-port
   *  guard, written once here rather than once per migrated type. */
  readonly ports: (deps: PublishContentDeps) => Ports | undefined;
  readonly list: (ports: Ports, workspaceId: string) => Promise<readonly Row[]>;
  readonly find: (ports: Ports, workspaceId: string, id: string) => Promise<Row | null>;
  /** Defaults to `row.id`. */
  readonly idOf?: (row: Row) => string;
  /** Defaults to `row.version`. */
  readonly versionOf?: (row: Row) => number;
  /** Extra pack filter beyond trash: kind, active status, excluded keys. */
  readonly include?: (row: Row) => boolean;
  /** Pack skips a trashed row; precheck refuses a trashed destination row. */
  readonly isTrashed?: (row: Row) => boolean;
  /** e.g. parent-first for a tree-shaped type. */
  readonly packOrder?: (rows: readonly Row[]) => readonly Row[];

  /** Every field this type packs, and whether it is also hashed. */
  readonly fields: Record<Extract<keyof Row, string>, FieldDisposition>;
  /** Legacy hash-stability knobs — only a MIGRATED handler sets these, to keep its `contentHash`
   *  byte-identical to what it produced before moving onto this factory (plan §7's own warning: a
   *  changed hash makes every existing destination baseline look edited). A new type never sets
   *  either. `stateOf`, when given, replaces the whole hash-input derivation below. */
  readonly legacyHash?: {
    readonly includeProvenance?: true;
    readonly stateOf?: (row: Row) => Record<string, unknown>;
  };
  /** Defaults to `[]`. */
  readonly requiredBlobs?: (row: Row) => readonly string[];

  /** A second unique address besides `id` (slug, key, name, ...). The factory refuses when a
   *  different id already holds it, using the shared {@link addressHeldByOther} reason. */
  readonly address?: {
    readonly field: string;
    readonly holder: (
      ports: Ports,
      workspaceId: string,
      value: string,
      state: Record<string, unknown>
    ) => Promise<{ id: string } | null>;
  };
  /** Type-specific refusals, run after every generic one. Returns a reason, or `null`. */
  readonly validate?: (input: {
    ports: Ports;
    workspaceId: string;
    entity: PackedEntity;
    existing: Row | null;
  }) => Promise<string | null>;

  /** The one write. Throws domain errors; {@link errors} maps them to row outcomes. May return the
   *  domain's own id for the report row (`changeSetId`); the factory falls back to `id` when it
   *  doesn't, and ignores it entirely when {@link undo} is set (the gateway's own id wins there). */
  readonly write: (ctx: RepoWriteContext<Row, Ports>) => Promise<{ changeSetId?: string } | void>;
  /** When set, the factory wraps {@link write} in `executeCommand` (change set, `captureInverse` =
   *  {@link find}, rollback = `restore(prior)` or `remove(id)`). When unset, the domain write is
   *  trusted to record its own revision (redirect, menu — see those files' own disclosed reasoning
   *  for why routing them through the gateway too would add a redundant audit row). */
  readonly undo?: {
    readonly restore: (ctx: RepoWriteContext<Row, Ports>, prior: Row) => Promise<void>;
    readonly remove: (ctx: RepoWriteContext<Row, Ports>, id: string) => Promise<void>;
    readonly summary?: (ctx: RepoWriteContext<Row, Ports>) => string;
  };
  readonly errors?: { readonly blocked?: readonly ErrorClass[]; readonly conflict?: readonly ErrorClass[] };

  /** Genuinely type-specific capabilities, passed through unchanged onto the returned handler. */
  readonly extend?: (ctx: { deps: PublishContentDeps; ports: () => Ports | undefined }) => Partial<
    Pick<PublishContentHandler, "planRetire" | "retire" | "referencesTo" | "repointReferences" | "seedHash" | "listSkipped">
  >;
}

/** Every field name on {@link RepoPublishTypeConfig.fields} whose disposition is `kind`, in the map's
 *  own key order.
 *  @complexity O(n) in the type's field count. */
function fieldsOfKind<Row>(fields: Record<Extract<keyof Row, string>, FieldDisposition>, kind: FieldDisposition): string[] {
  return Object.entries(fields)
    .filter(([, disposition]) => disposition === kind)
    .map(([field]) => field);
}

/** Reads `fieldNames` off `row`, defaulting a missing value to `null` — the same "field never set is
 *  an explicit `null`, not a dropped key" convention `content-hash.ts`'s own `normalize` establishes.
 *  @complexity O(fieldNames.length). */
function pickFields(row: Record<string, unknown>, fieldNames: readonly string[]): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const field of fieldNames) state[field] = row[field] ?? null;
  return state;
}

/**
 * Builds one `PublishContentHandler` from a {@link RepoPublishTypeConfig} — the factory itself.
 * `PublishContentContributor`'s own `build(deps)` shape is preserved exactly, so a config-built
 * contributor is indistinguishable from a hand-written one to every existing caller
 * (`type-registry.ts`'s registry, `apply-loop.ts`, the export route).
 */
export function createRepoPublishHandler<Row, Ports>(config: RepoPublishTypeConfig<Row, Ports>): PublishContentContributor {
  const entityType = config.entityType;
  const schemaVersion = config.schemaVersion ?? 1;
  const dependsOn = config.dependsOn ?? [];
  const idOf = config.idOf ?? ((row: Row) => (row as unknown as { id: string }).id);
  const versionOf = config.versionOf ?? ((row: Row) => (row as unknown as { version: number }).version);
  const transferredFields = fieldsOfKind(config.fields, "transferred");
  const packedFields = [...transferredFields, ...fieldsOfKind(config.fields, "provenance")];

  function toPackedState(row: Row): Record<string, unknown> {
    return pickFields(row as unknown as Record<string, unknown>, packedFields);
  }

  /** The hash input — {@link RepoPublishTypeConfig.legacyHash}'s `stateOf` when given, otherwise
   *  every `"transferred"` field (plus `"provenance"` too, only under `includeProvenance`). */
  function toHashableState(row: Row): Record<string, unknown> {
    if (config.legacyHash?.stateOf) return config.legacyHash.stateOf(row);
    const hashedFields = config.legacyHash?.includeProvenance ? packedFields : transferredFields;
    return pickFields(row as unknown as Record<string, unknown>, hashedFields);
  }

  /** Maps a thrown domain error to the per-row downgrade `apply-loop.ts` recognizes, or passes a
   *  genuine fault (including an already-thrown {@link PublishContentApplyRowError}, e.g. this
   *  factory's own CAS checks) through unchanged.
   *  @complexity O(config.errors' combined class count). */
  function mapWriteError(err: unknown): Error {
    if (err instanceof PublishContentApplyRowError) return err;
    for (const cls of config.errors?.blocked ?? []) {
      if (err instanceof cls) return new PublishContentApplyRowError("blocked", (err as Error).message);
    }
    for (const cls of config.errors?.conflict ?? []) {
      if (err instanceof cls) return new PublishContentApplyRowError("conflict", (err as Error).message);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  function build(deps: PublishContentDeps): PublishContentHandler {
    function ports(): Ports | undefined {
      return config.ports(deps);
    }

    async function* pack(): AsyncIterable<PackedEntity> {
      const p = ports();
      if (!p) return;
      let rows = (await config.list(p, deps.workspaceId)).filter((row) => !(config.isTrashed?.(row) ?? false));
      if (config.include) rows = rows.filter(config.include);
      if (config.packOrder) rows = [...config.packOrder(rows)];
      for (const row of rows) {
        yield {
          entityType,
          id: idOf(row),
          schemaVersion,
          contentHash: contentHash(entityType, toHashableState(row)),
          hashVersion: CONTENT_HASH_VERSION,
          requiredBlobs: config.requiredBlobs?.(row) ?? [],
          state: toPackedState(row),
        };
      }
    }

    async function inspect(id: string): Promise<{ version: number; hash: string } | null> {
      const p = ports();
      if (!p) return null;
      const row = await config.find(p, deps.workspaceId, id);
      if (!row) return null;
      return { version: versionOf(row), hash: contentHash(entityType, toHashableState(row)) };
    }

    /** Precheck order (plan §2.2): ports missing, address held, destination trashed, then the
     *  type's own `validate`. */
    async function precheck(entity: PackedEntity): Promise<string | null> {
      const p = ports();
      if (!p) return notWired(entityType, entity.id, `${entityType} ports`);

      if (config.address) {
        const value = entity.state[config.address.field];
        if (typeof value === "string") {
          const holder = await config.address.holder(p, deps.workspaceId, value, entity.state);
          if (holder && holder.id !== entity.id) {
            return addressHeldByOther(entityType, config.address.field, value, holder.id);
          }
        }
      }

      const existing = await config.find(p, deps.workspaceId, entity.id);
      if (existing && config.isTrashed?.(existing)) {
        return trashedAtDestination(entityType, entity.id);
      }

      if (config.validate) {
        const reason = await config.validate({ ports: p, workspaceId: deps.workspaceId, entity, existing });
        if (reason) return reason;
      }
      return null;
    }

    /** The three optimistic-concurrency CAS failures (plan §2.2 step 2), each raised as a `conflict`
     *  row via the shared {@link changedSincePlan} reason. */
    function checkVersion(entity: PackedEntity, expectedVersion: number | undefined, existing: Row | null): void {
      if (expectedVersion === undefined && existing) {
        throw new PublishContentApplyRowError(
          "conflict",
          changedSincePlan(entityType, entity.id, `expected no existing row, found version ${versionOf(existing)}`)
        );
      }
      if (expectedVersion !== undefined) {
        if (!existing) {
          throw new PublishContentApplyRowError(
            "conflict",
            changedSincePlan(entityType, entity.id, `expected version ${expectedVersion}, but the row is gone`)
          );
        }
        if (versionOf(existing) !== expectedVersion) {
          throw new PublishContentApplyRowError(
            "conflict",
            changedSincePlan(entityType, entity.id, `expected version ${expectedVersion}, found version ${versionOf(existing)}`)
          );
        }
      }
    }

    async function apply(input: {
      entity: PackedEntity;
      expectedVersion: number | undefined;
      principalId: string;
      idempotencyKey: string;
    }): Promise<{ changeSetId: string }> {
      const maybePorts = ports();
      if (!maybePorts) {
        throw new Error(
          `publish-content: ${entityType}.apply() requires its ports wired on this deps bag — wire them from ` +
            "the real apply-loop composition root (features/publish-content/apply-loop.ts)."
        );
      }
      // Narrowed into its own binding: a `const` narrowed by the guard above does not stay narrowed
      // once captured by the nested closures below (TS does not carry control-flow narrowing across
      // a closure boundary), so `runWrite`/the `executeCommand` callbacks close over THIS binding,
      // whose declared type is already the non-optional `Ports`.
      const p: Ports = maybePorts;

      /** Version-checks, calls `config.write`, and maps any thrown domain error — shared by both the
       *  plain and `executeCommand`-wrapped paths below so the CAS/error-mapping logic exists once. */
      async function runWrite(existing: Row | null): Promise<{ changeSetId?: string }> {
        checkVersion(input.entity, input.expectedVersion, existing);
        const ctx: RepoWriteContext<Row, Ports> = {
          ports: p,
          deps,
          workspaceId: deps.workspaceId,
          id: input.entity.id,
          state: input.entity.state,
          existing,
          expectedVersion: input.expectedVersion,
          principalId: input.principalId,
        };
        try {
          return (await config.write(ctx)) ?? {};
        } catch (err) {
          throw mapWriteError(err);
        }
      }

      if (!config.undo) {
        const existing = await config.find(p, deps.workspaceId, input.entity.id);
        const written = await runWrite(existing);
        return { changeSetId: written.changeSetId ?? input.entity.id };
      }

      const { changeSets, authorize, outbox } = deps;
      if (!changeSets) {
        throw new Error(
          `publish-content: ${entityType}.apply() requires PublishContentDeps.changeSets wired for undo support ` +
            "— wire it from the real apply-loop composition root (features/publish-content/apply-loop.ts)."
        );
      }
      let prior: Row | null = null;
      const undo = config.undo;
      const { changeSetId } = await executeCommand<{ changeSetId?: string }>({
        deps: { clock: deps.clock, idGen: deps.idGen, changeSets, outbox, authorize },
        command: {
          workspaceId: deps.workspaceId,
          actor: { id: input.principalId, kind: "user" as const },
          summary:
            undo.summary?.({
              ports: p,
              deps,
              workspaceId: deps.workspaceId,
              id: input.entity.id,
              state: input.entity.state,
              existing: null,
              expectedVersion: input.expectedVersion,
              principalId: input.principalId,
            }) ?? `Import ${entityType} '${input.entity.id}' via publish-content`,
          permission: config.permission,
          idempotencyKey: input.idempotencyKey,
        },
        mutation: {
          entityType,
          entityId: input.entity.id,
          operation: input.expectedVersion === undefined ? "create" : "update",
          captureInverse: async () => {
            prior = await config.find(p, deps.workspaceId, input.entity.id);
            return prior ? ({ ...prior } as unknown as JsonObject) : null;
          },
          execute: () => runWrite(prior),
          rollback: async () => {
            const ctx: RepoWriteContext<Row, Ports> = {
              ports: p,
              deps,
              workspaceId: deps.workspaceId,
              id: input.entity.id,
              state: input.entity.state,
              existing: prior,
              expectedVersion: input.expectedVersion,
              principalId: input.principalId,
            };
            if (prior) await undo.restore(ctx, prior);
            else await undo.remove(ctx, input.entity.id);
          },
        },
      });
      return { changeSetId };
    }

    return {
      entityType,
      schemaVersion,
      permission: config.permission,
      dependsOn,
      pack,
      inspect,
      precheck,
      apply,
      ...(config.extend ? config.extend({ deps, ports }) : {}),
    };
  }

  return { entityType, dependsOn, build };
}
