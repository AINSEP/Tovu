import { randomUUID } from "node:crypto";
import { createDurableJsonFile, createNodeDurableJsonPorts } from "@jini-ai/platform/fs";
import { backfillImportIndex, type BackfillResult } from "@jini-ai/devops/backup/site/import-index/backfill";

export function bindSiteImportBackfill({ directory, fs, clock, policy, openCandidate, log }: {
  directory: string;
} & Omit<Parameters<typeof backfillImportIndex>[0], "root" | "readJson" | "newDbId">, _optional: Record<string, never> = {}): (required: Record<string, never>, optional?: Record<string, never>) => BackfillResult {
  // The SQL marker proves a complete candidate, not permission to treat it as the authority.
  // The external state publish is a separate, later operation.
  return (_required, _optional = {}) => backfillImportIndex({ root: directory, fs, clock, policy, openCandidate, log,
    readJson: ({ file }, _optional = {}) => createDurableJsonFile({ ...createNodeDurableJsonPorts({}), filePath: file, notices: { prefix: "Site imports", lockTimeout: () => "Import registry is busy." } }).read({}),
    newDbId: (_required, _optional = {}) => randomUUID(),
  });
}
