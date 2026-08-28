import type {
  AdminSourceControlConnectionInput,
  AdminSourceControlCredentialSummary,
  AdminSourceControlCredentialsSnapshot,
} from "@/lib/api";

/**
 * @file What `useSourceControlCredentials` needs from the outside world, as an interface rather
 * than a direct API import — same shape as `deployment/hooks/publish-credentials-port.hooks.ts`, so
 * a test can describe this hook's behavior against a fake port instead of stubbing global `fetch`.
 */
export interface SourceControlCredentialsPort {
  /** Every configured connection for this workspace. */
  listCredentials(): Promise<AdminSourceControlCredentialsSnapshot>;
  /** Creates one named connection. Rejects with an `ApiError` (`code: "DUPLICATE_LABEL"`) if this
   *  workspace already has a connection with the same label. */
  createCredential(input: {
    label: string;
    connection: AdminSourceControlConnectionInput;
    isDefault?: boolean;
  }): Promise<AdminSourceControlCredentialSummary>;
  /** Updates a connection's label, secret, and/or default status. Omitting `connection` keeps the
   *  stored secret untouched — see `use-source-control-credentials.hooks.ts`'s header for why the
   *  form can never send a half-blank one. */
  updateCredential(
    id: string,
    input: { label?: string; connection?: AdminSourceControlConnectionInput; isDefault?: boolean }
  ): Promise<AdminSourceControlCredentialSummary>;
  /** Idempotent — deleting an id that is already gone still resolves. Not called anywhere on this
   *  page today (there is no delete affordance in the UI — replacing a token PUTs over the existing
   *  row), kept on the port only for parity with `PublishCredentialsPort`'s own shape. */
  deleteCredential(id: string): Promise<void>;
}
