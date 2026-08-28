# Spec: Import, Export, And Migration

## Goal

Define the server contract for canonical export, import validation, migration dry-runs, redirect mapping, and reversible migration records.

This is critical because migration is one of Tovu's main adoption wedges.

## Export

The server must support canonical export contracts that are:

- explicit
- versioned
- auditable
- decoupled from internal persistence layout

Exports may be:

- streaming
- batched
- asynchronous when large

Minimum export result contract:

```ts
type ExportRunResult = {
  runId: string;
  schemaVersion: string;
  mode: "sync" | "async";
  status: "completed" | "accepted";
  summary: {
    exportedCount: number;
    skippedCount: number;
  };
  warnings: string[];
  artifactUrl?: string | null;
  jobId?: string | null;
};
```

## Import

Imports must support:

- dry-run validation
- mapping and transform reporting
- conflict reporting
- resumability or restartability for large jobs

Minimum dry-run result contract:

```ts
type ImportDryRunResult = {
  runId: string;
  schemaVersion: string;
  status: "validated";
  summary: {
    creates: number;
    updates: number;
    skips: number;
  };
  warnings: string[];
  conflicts: Array<{
    resourceRef: string;
    code: string;
    summary: string;
  }>;
};
```

## Migration Records

The server should record migration runs with:

- source system
- target scope
- mapping configuration
- result summary
- redirect outputs where applicable
- rollback or compensation notes when possible

Minimum migration-run record fields:

- `runId`
- `sourceSystem`
- `schemaVersion`
- `targetScope`
- `mode`
- `status`
- `summary`
- `warnings`
- `conflicts`
- `redirectArtifact`
- `jobId` when asynchronous

## URL And Redirect Safety

Migration flows that affect public URLs must support:

- canonical URL mapping
- redirect generation
- validation before cutover

Redirect artifact contract:

- canonical source URL
- canonical target URL
- redirect type/status
- validation state
- cutover batch or migration run reference

## Privacy And Data Operations

The migration/import/export surface should be compatible with:

- personal data export requests
- deletion or erasure requests
- audit of what data moved where

## Acceptance Checks

- The export contract is independent of raw storage layout.
- Large migrations can run without pretending to be a single synchronous request.
- Redirect and URL mapping are part of the contract, not an afterthought.
- Large imports/exports expose dry-run or accepted-async result shapes instead of opaque background work.

## Non-goals (current)

- Supporting every legacy CMS import format immediately
- Final bulk job execution engine details
