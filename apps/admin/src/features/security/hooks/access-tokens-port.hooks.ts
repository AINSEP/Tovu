import type {
  AdminPublishConnectionInput,
  AdminPublishCredentialSummary,
  AdminPublishCredentialsSnapshot,
  AdminSourceControlConnectionInput,
  AdminSourceControlCredentialSummary,
  AdminSourceControlCredentialsSnapshot,
} from "../../../lib/api";

/**
 * @file What `useAccessTokens` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — same shape as `deployment/hooks/publish-credentials-port.hooks.ts`/
 * `source-control/hooks/source-control-credentials-port.hooks.ts`. Two flat method groups (`publish`/
 * `sourceControl`), not one unified CRUD surface: the two stores' create/update calls take
 * differently-shaped connection inputs (`AdminPublishConnectionInput` vs
 * `AdminSourceControlConnectionInput`), and collapsing them into one generic method would just move
 * that distinction into a runtime branch this interface can otherwise let the type system carry.
 */
export interface AccessTokensPort {
  readonly publish: {
    list(): Promise<AdminPublishCredentialsSnapshot>;
    create(input: { label: string; connection: AdminPublishConnectionInput; isDefault?: boolean }): Promise<AdminPublishCredentialSummary>;
    update(
      id: string,
      input: { label?: string; connection?: AdminPublishConnectionInput; isDefault?: boolean }
    ): Promise<AdminPublishCredentialSummary>;
    /** Idempotent — deleting an id that is already gone still resolves. */
    remove(id: string): Promise<void>;
  };
  readonly sourceControl: {
    list(): Promise<AdminSourceControlCredentialsSnapshot>;
    create(input: { label: string; connection: AdminSourceControlConnectionInput; isDefault?: boolean }): Promise<AdminSourceControlCredentialSummary>;
    update(
      id: string,
      input: { label?: string; connection?: AdminSourceControlConnectionInput; isDefault?: boolean }
    ): Promise<AdminSourceControlCredentialSummary>;
    /** Idempotent — deleting an id that is already gone still resolves. */
    remove(id: string): Promise<void>;
  };
}
