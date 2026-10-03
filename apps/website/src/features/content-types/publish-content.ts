import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";

import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import { tombstonedAtDestination } from "#src/features/publish-content/precheck-reasons";
import { createRepoPublishHandler, gatewayDeps, okOrThrow } from "#src/features/publish-content/repo-handler";
import type { PublishContentContributor, PublishContentPorts } from "#src/features/publish-content/type-registry";

import {
  ContentTypeNotFoundError,
  deprecateContentType,
  reactivateContentType,
  registerContentType,
  toContentTypeOutbox,
  updateContentTypeFields,
  VersionConflictError,
  type ContentTypeFieldDef,
  type ContentTypeRecord,
  type ContentTypeStatus,
} from "./index.js";

/**
 * @file `content-type` (a collection's schema) on the publish factory. Addressed by its `key`.
 *
 * `widget` and `widget_area` are seeded per instance, so they never travel. A tombstoned type does
 * not pack, and a tombstoned destination type refuses: tombstone is terminal (INV-06).
 */
const SEEDED_KEYS = new Set(["widget", "widget_area"]);

/** Refuses a seeded key inbound too: `widget`/`widget-area` own those schemas, and a grant limited to
 *  `content-type` must not reach them. */
const seededKeyRefusal = (key: string): string | null =>
  SEEDED_KEYS.has(key) ? `content-type '${key}' is seeded on every instance and is never published` : null;

export const contributeContentTypePublish = (): PublishContentContributor =>
  createRepoPublishHandler<ContentTypeRecord, PublishContentPorts["content-type"]>({
    entityType: "content-type",
    permission: "admin.collections.manage",
    ports: (deps) => deps.ports["content-type"],
    list: (p, workspaceId) => p.repo.listByWorkspace({ workspaceId }),
    find: (p, workspaceId, key) => p.repo.findByKey({ workspaceId, key }),
    idOf: (row) => row.key,
    include: (row) => row.status !== "tombstone" && !SEEDED_KEYS.has(row.key),
    fields: {
      key: "transferred",
      label: "transferred",
      fields: "transferred",
      status: "transferred",
      workspaceId: "local",
      version: "local",
      tombstonedAt: "local",
    },
    validate: async ({ entity, existing }) =>
      seededKeyRefusal(entity.id) ?? (existing?.status === "tombstone" ? tombstonedAtDestination("content-type", entity.id) : null),
    write: async ({ ports, deps, workspaceId, id: key, state, existing, principalId: actorId }) => {
      const seeded = seededKeyRefusal(key);
      if (seeded) throw new PublishContentApplyRowError("blocked", seeded);
      const gateway = gatewayDeps(deps, "content-type");
      const outbox = toContentTypeOutbox({ outbox: gateway.outbox, clock: deps.clock, idGen: deps.idGen, workspaceId });
      // Preserve Jini's content-type scope along with the gateway's publish-type stamp.
      const writeDeps = { repo: ports.repo, clock: deps.clock, ids: deps.idGen, authorize: adaptLegacyAuthorize({ authorize: gateway.authorize }), indexProvisioner: ports.indexProvisioner, outbox };
      const label = state.label as string;
      const fields = state.fields as ContentTypeFieldDef[];
      let current = existing
        ? existing
        : okOrThrow(await registerContentType({ deps: writeDeps, input: { workspaceId, actorId, key, label, fields } })).contentType;
      if (existing && (existing.label !== label || JSON.stringify(existing.fields) !== JSON.stringify(fields))) {
        const input = { workspaceId, actorId, key, label, fields, expectedVersion: existing.version };
        current = okOrThrow(await updateContentTypeFields({ deps: writeDeps, input })).contentType;
      }
      const status = state.status as ContentTypeStatus;
      if (current.status !== status) {
        const input = { workspaceId, actorId, key, expectedVersion: current.version };
        const transition = status === "deprecated" ? deprecateContentType : reactivateContentType;
        current = okOrThrow(await transition({ deps: writeDeps, input })).contentType;
      }
      return { version: current.version };
    },
    errors: { conflict: [VersionConflictError, ContentTypeNotFoundError], blocked: [ToolInputError] },
  });
