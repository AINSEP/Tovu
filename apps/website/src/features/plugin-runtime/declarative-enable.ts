/** Concrete Tovu content-type write binding; generic enable/defer live in @jini-ai/plugins/host. */
import {
  NoopContentTypeIndexProvisioner,
  registerContentType,
  toContentTypeOutbox,
  type ContentTypeRepoPort,
  type ContentTypeWriteServiceDeps,
  type IndexProvisionerPort,
} from "#src/features/content-types/index";

import type { DeclaredContentTypePorts } from "./declarative-content-types.js";

export interface CreateDeclaredContentTypePortsRequired {
  readonly repo: ContentTypeRepoPort;
  readonly clock: ContentTypeWriteServiceDeps["clock"];
  readonly ids: { newId: () => string };
  /** The root's raw outbox; wrapped per call with `toContentTypeOutbox` (it needs the workspace). */
  readonly outbox: Parameters<typeof toContentTypeOutbox>[0]["outbox"];
}

export interface CreateDeclaredContentTypePortsOptional {
  /** Defaults to the no-op provisioner — the same one both composition roots use today. */
  readonly indexProvisioner?: IndexProvisionerPort;
}

/**
 * Binds core's `registerContentType` for the provisioner. `authorize` always allows, on purpose: the
 * real authorization already happened one layer up — turning a plugin on requires the plugin-manage
 * permission and the owner's consent, and these types are what that consented action declares
 * (the same reasoning as widgets' `PRE_AUTHORIZED`). The write is recorded as `principalKind:
 * "system"` with the plugin as actor, so the revision log says no human typed this schema.
 */
export function createDeclaredContentTypePorts(
  required: CreateDeclaredContentTypePortsRequired,
  optional: CreateDeclaredContentTypePortsOptional = {}
): DeclaredContentTypePorts {
  const { repo, clock, ids, outbox } = required;
  const indexProvisioner = optional.indexProvisioner ?? new NoopContentTypeIndexProvisioner();
  return {
    findByKey: (params) => repo.findByKey(params),
    async register(input) {
      const deps: ContentTypeWriteServiceDeps = {
        repo,
        clock,
        ids,
        authorize: async () => ({ allowed: true, reason: "declared by an enabled plugin" }),
        indexProvisioner,
        outbox: toContentTypeOutbox({ outbox, clock, idGen: ids, workspaceId: input.workspaceId }),
      };
      const result = await registerContentType({
        deps,
        input: { ...input, principalKind: "system" },
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  };
}
