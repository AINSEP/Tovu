import type {
  AdminPublishConnectionInput,
  AdminPublishCredentialSummary,
  AdminPublishCredentialsSnapshot,
  AdminPublishCredentialVerification,
} from "@/lib/api";

/**
 * @file What `usePublishCredentials` needs from the outside world, as an interface rather than a
 * direct `lib/api` import — same shape as `static-publish-port.hooks.ts` in this directory.
 */
export interface PublishCredentialsPort {
  /** Every configured credential for this workspace, plus the server's own `executionMode` — see
   *  `AdminPublishCredentialsSnapshot`'s own doc. */
  listCredentials(): Promise<AdminPublishCredentialsSnapshot>;
  /** Creates one named connection. Rejects with an `ApiError` (`code: "DUPLICATE_LABEL"`) if this
   *  workspace already has a credential with the same label. */
  createCredential(input: { label: string; connection: AdminPublishConnectionInput; isDefault?: boolean }): Promise<AdminPublishCredentialSummary>;
  /** Updates a credential's label, connection, and/or default status. Omitting `connection` keeps the
   *  stored secret untouched — see `use-publish-credentials.hooks.ts`'s header for why the form can
   *  never send a half-blank one. */
  updateCredential(
    id: string,
    input: { label?: string; connection?: AdminPublishConnectionInput; isDefault?: boolean }
  ): Promise<AdminPublishCredentialSummary>;
  /** Idempotent — deleting an id that is already gone still resolves. */
  deleteCredential(id: string): Promise<void>;
  /** Re-checks one already-saved credential against its real provider right now — see
   *  `api.verifyPublishCredential`'s own doc for why this is a real `200` result even when the
   *  provider rejects the credential, not a thrown error. */
  verifyCredential(id: string): Promise<AdminPublishCredentialVerification>;
}
