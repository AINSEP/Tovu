import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { SealedSecret } from "../../webhooks/types";

/**
 * @file Domain types for named, workspace-scoped source-control identity connections
 * (`source_control_credential_sets`, `src/db/schema.ts`). Structurally mirrors
 * `features/deployments/publish-credentials/types.ts` — see that file's own header for the design
 * this one copies verbatim — but is its OWN closed provider union, deliberately not reusing
 * `PublishProviderId`: that type is a deploy-target id by design (aliased to
 * `AdminStaticPublishTargetId` so the two can never drift), and none of GitLab, Bitbucket, or a
 * *source* GitHub account is a static-publish target. See `src/db/schema.ts`'s
 * `sourceControlCredentialSets` doc comment for the full "why a second table, not a wider union"
 * reasoning.
 *
 * Purpose:
 * This page connects an IDENTITY, not a publish target — no commit history, sync, or versioning
 * lives here (see the admin `SourceControl.tsx` page's own header for that scope boundary). A saved
 * connection's `SourceControlConnectionInput` therefore carries only what authenticates the account
 * (a token, plus Bitbucket's paired username) — never a repository, owner, or branch, which are
 * per-operation choices a future git-operating caller would supply, not properties of the saved
 * credential.
 *
 * Architectural role:
 * Domain types only — no I/O, no sealer/keyring dependency. `store.ts` is the one place a
 * `SourceControlConnectionInput` is validated, serialized, and sealed; `repo.memory.ts`/
 * `../../db/sqlite/source-control-credential-repo.sqlite.ts` are the two
 * `SourceControlCredentialSetRepoPort` adapters (ADR-006 rule-of-two).
 */

export type SourceControlProviderId = "github" | "gitlab" | "bitbucket";

export interface GitHubSourceControlConnectionInput {
  readonly providerId: "github";
  readonly token: string;
}

export interface GitLabSourceControlConnectionInput {
  readonly providerId: "gitlab";
  readonly token: string;
}

/** Bitbucket authenticates the pair, not the token alone — same citation
 *  `apps/admin/src/features/source-control/rules.ts`'s `SOURCE_CONTROL_PROVIDERS` gives. */
export interface BitbucketSourceControlConnectionInput {
  readonly providerId: "bitbucket";
  readonly token: string;
  readonly username: string;
}

/** Closed discriminated union — see this file's header. This whole object is what gets serialized
 *  to JSON and sealed as ONE ciphertext blob per credential set (never per-field columns — see
 *  `src/db/schema.ts`'s `sourceControlCredentialSets` header for why). */
export type SourceControlConnectionInput =
  | GitHubSourceControlConnectionInput
  | GitLabSourceControlConnectionInput
  | BitbucketSourceControlConnectionInput;

/** A `source_control_credential_sets` row, decrypted-shape (`sealed` is the DB's opaque
 *  `SealedSecret` — nothing in this feature decrypts it yet; see this file's header on the
 *  connect-an-identity-only scope). */
export interface SourceControlCredentialSetRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly providerId: SourceControlProviderId;
  readonly label: string;
  readonly sealed: SealedSecret;
  /** At most one `TRUE` per `(workspaceId, providerId)`, maintained by `store.ts`'s write path —
   *  see `src/db/schema.ts`'s `sourceControlCredentialSets.isDefault` doc. */
  readonly isDefault: boolean;
  /** Migration `0044` (2026-08-16) — the verified GitHub `login`, held in the clear (never sealed) —
   *  see `src/db/schema.ts`'s `sourceControlCredentialSets.accountLabel` doc for the full reasoning.
   *  `null` for `gitlab`/`bitbucket` connections (no reviewed identity extractor exists for either
   *  yet) and for a `github` connection whose save-time identity probe failed or timed out. */
  readonly accountLabel: string | null;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** The read model every route in this feature returns — see `store.ts`'s `toSummary`. NEVER
 *  contains `sealed`, a token, or any `SourceControlConnectionInput` field — enforced by
 *  construction: this type has no field capable of carrying one. */
export interface SourceControlCredentialSummary {
  readonly id: UUID;
  readonly providerId: SourceControlProviderId;
  readonly label: string;
  readonly configured: true;
  readonly isDefault: boolean;
  /** See `SourceControlCredentialSetRecord.accountLabel`'s own doc — carried through unchanged. */
  readonly accountLabel: string | null;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link SourceControlCredentialSetRecord} (ADR-007 §1). `insert`
 *  assumes the caller already checked/accepted the `(workspaceId, providerId, label)` UNIQUE
 *  constraint may reject it — see `store.ts`'s `isUniqueLabelViolation` for how that DB error is
 *  turned into `SourceControlCredentialDuplicateLabelError` rather than propagated as a raw driver
 *  error.
 *
 * `insert`/`update`/`delete` ALSO own the `isDefault` invariant, mirroring
 * `PublishCredentialSetRepoPort`'s own contract exactly: if the written `record.isDefault` is
 * `true`, `insert`/`update` atomically clear `isDefault` on every OTHER row sharing
 * `(workspaceId, providerId)`, in the SAME transaction as the write. `delete` promotes the group's
 * most-recently-updated remaining row to default if the deleted row WAS the default. */
export interface SourceControlCredentialSetRepoPort {
  insert(record: SourceControlCredentialSetRecord): Promise<void>;
  /** Full-row replace by `(workspaceId, id)` — used for both a label rename and a connection
   *  rotation. Same UNIQUE-violation possibility as `insert` (renaming into another row's label). */
  update(record: SourceControlCredentialSetRecord): Promise<void>;
  findById(input: { workspaceId: UUID; id: UUID }): Promise<SourceControlCredentialSetRecord | null>;
  /** The current default row for one `(workspaceId, providerId)` pair — `null` if that provider has
   *  no rows at all for this workspace. */
  findDefaultByProvider(input: { workspaceId: UUID; providerId: SourceControlProviderId }): Promise<SourceControlCredentialSetRecord | null>;
  /** Every row for one `(workspaceId, providerId)` pair — used by `store.ts`'s write path to decide
   *  "is this the group's first row" (create-time auto-default) and, ahead of `delete`, to reason
   *  about the promotion candidate. */
  listByProvider(input: { workspaceId: UUID; providerId: SourceControlProviderId }): Promise<SourceControlCredentialSetRecord[]>;
  /** Every credential set a workspace has saved, across all providers — inherently small (bounded
   *  by how many connections a human bothers to save through this exact form), so no
   *  pagination/cap is added here. */
  listByWorkspace(input: { workspaceId: UUID }): Promise<SourceControlCredentialSetRecord[]>;
  /** No-op (not an error) if no row exists for `(workspaceId, id)` — matches this feature's own
   *  `DELETE .../credentials/:id` route contract (204, idempotent). */
  delete(input: { workspaceId: UUID; id: UUID }): Promise<void>;
}
