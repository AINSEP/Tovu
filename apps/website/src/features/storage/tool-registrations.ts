import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type DerivedRiskByToolId, type ToolContributor, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { approvalToolHandler } from "#src/contracts/core/human-confirm";
import { toolMetadata } from "#src/contracts/core/tool-metadata/storage";
import { STORAGE_CLEANUP_TOOL_ID, storageAgentToolCatalog } from "./agent-tools.js";

/**
 * @file Binds the storage tools (ST-15c). `site_storage_report` reads; `site_storage_cleanup`
 * always previews first and, for a live run, raises the owner's card before `runOnce({ dryRun: false })`.
 */

export const storageDerivedRisk: DerivedRiskByToolId = new Map([["site_storage_report", "none"], ["site_storage_cleanup", "mutates-durable-state"]]);

/** A pass as the routes show it: per-policy numbers, never paths. */
export interface StoragePassView { readonly status: string; readonly dryRun: boolean; readonly policies?: readonly { readonly id: string; readonly bytes?: number | null; readonly items?: number }[] }

/** Required collaborators of {@link createStorageToolContributor}. */
export interface StorageToolContributorRequired {
  measure: (required: Record<string, never>, optional: Record<string, never>) => Promise<object>;
  runOnce: (required: { dryRun: boolean }, optional: Record<string, never>) => Promise<StoragePassView>;
  /** Strict: the calling principal must be the site owner (not merely an admin). Throws to refuse. */
  authorizeOwner: (required: { principalId: string }, optional: Record<string, never>) => Promise<void>;
  approval: { handler: typeof approvalToolHandler };
  copy: { protectedContent: string; cardTitle: string; confirmLabel: string };
}

const CONTENT_KINDS: ReadonlySet<string> = new Set(["chats", "chat", "revisions", "screenshots", "media", "uploads", "content", "yours"]);

interface Prepared { readonly dryRun: boolean; readonly preview: StoragePassView }

function readCleanupInput({ input, copy }: { input: unknown; copy: StorageToolContributorRequired["copy"] }): { dryRun: boolean } {
  const record = requireInputRecord({ input });
  const dryRun = record.dryRun === undefined ? true : record.dryRun;
  if (typeof dryRun !== "boolean") throw new ToolInputError({ message: "Pass dryRun: true to preview or dryRun: false to clean up." });
  const classes = record.classes;
  if (classes !== undefined && (!Array.isArray(classes) || classes.some(kind => typeof kind !== "string"))) throw new ToolInputError({ message: "List the kinds of storage to clean up as words." });
  if ((classes as string[] | undefined)?.some(kind => CONTENT_KINDS.has(kind))) throw new ToolInputError({ message: copy.protectedContent });
  return { dryRun };
}

function cleanupHandler({ required, surfaces }: { required: StorageToolContributorRequired; surfaces: AssistantSurfaceDeps }) {
  const { runOnce, authorizeOwner, approval, copy } = required;
  return approval.handler<Prepared>({ surfaces,
    // Why preview is not itself approval: the dry run only measures what a pass would free, so the card
    // can show real categories and bytes. Nothing the agent sends (a preview, a flag, an earlier yes)
    // stands in for the owner's click; a live pass runs only from `run`, after the card is answered.
    prepare: async ({ ctx }) => {
      const { dryRun } = readCleanupInput({ input: ctx.input, copy });
      await authorizeOwner({ principalId: ctx.principal.id }, {});
      return { dryRun, preview: await runOnce({ dryRun: true }, {}) };
    },
    describe: ({ prepared }) => ({ toolId: STORAGE_CLEANUP_TOOL_ID, errorCode: "SITE_STORAGE", title: copy.cardTitle, confirmLabel: copy.confirmLabel,
      details: (prepared.preview.policies ?? []).map(policy => ({ label: policy.id, value: { bytes: policy.bytes ?? null, items: policy.items ?? null } })) }),
    run: async ({ ctx, prepared }) => {
      if (prepared.dryRun) return { cleaned: false, dryRun: true, pass: prepared.preview };
      // The card may have sat open: re-check the owner at the moment of the delete.
      await authorizeOwner({ principalId: ctx.principal.id }, {});
      return { cleaned: true, dryRun: false, pass: await runOnce({ dryRun: false }, {}) };
    },
  }, { flag: "cleaned", ask: ({ prepared }) => prepared.dryRun === false });
}

/**
 * The `system-storage` contributor: both tools, owner-only. No `rememberKey`: every live cleanup asks.
 * @complexity O(1) to build; per call one measurement or one/two retention passes.
 */
export function createStorageToolContributor(required: StorageToolContributorRequired, _optional: Record<string, never> = {}): ToolContributor<unknown, AssistantSurfaceDeps> {
  const build = (_deps: unknown, surfaces: AssistantSurfaceDeps): ToolRegistration[] => buildDomainRegistrations({
    metadata: toolMetadata, domain: "system-storage", catalogModule: "features/storage/agent-tools.ts", catalog: indexCatalogById({ catalog: storageAgentToolCatalog }), derivedRisk: storageDerivedRisk,
    handlers: {
      site_storage_report: async (ctx: ToolExecutionContext) => {
        requireInputRecord({ input: ctx.input });
        await required.authorizeOwner({ principalId: ctx.principal.id }, {});
        return required.measure({}, {});
      },
      site_storage_cleanup: cleanupHandler({ required, surfaces }),
    },
  });
  return { domain: "system-storage", build, risk: storageDerivedRisk };
}
