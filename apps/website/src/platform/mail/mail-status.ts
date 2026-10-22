import type { MailStatus } from "@jini-ai/platform/mail";

/**
 * The site's mail status: Jini's `computeMailStatus` projection (state, per-lane provider/state,
 * warnings) plus the catalog facts the admin screen and `system_get_mail_status` show. Built by
 * `server/runtime/boot/resolve-mailer.ts`; declared here so routes and features need no boot import.
 */
export interface MailStatusReport extends MailStatus {
  /** Every installed provider's safe configuration (a superset of the v1 `{id,label,hosted,origin}`). */
  readonly providers: readonly MailProviderConfiguration[];
  /** Plugin providers that were not loaded, and why (log-safe). */
  readonly refusals: readonly string[];
  /** When these facts were computed (ISO). A cached report keeps its original time. */
  readonly checkedAt: string;
  /** The most recent provider failure this process observed (a send or a status check), if any. */
  readonly lastError?: MailProviderError;
}

/** A provider failure, caller-safe: never a credential, never a message body. */
export interface MailProviderError {
  readonly at: string;
  /** null when the failure belongs to no single provider (the credential store itself). */
  readonly providerId: string | null;
  readonly source: "send" | "check";
  readonly code?: string;
  readonly message: string;
}

/**
 * One credential field a provider's setup form shows, declared by data (a plugin's
 * `tovu-mail-adapters.json` `setup`, or the core SMTP protocol), never by a vendor branch in code.
 * `key` is the credential field it fills: `token` (always secret), `username` or `baseUrl`.
 */
export interface MailProviderField {
  readonly key: string;
  readonly label: string;
  readonly type: "secret" | "text" | "url" | "email";
  readonly required: boolean;
  /** A non-secret default, e.g. the provider's API origin or a preset server endpoint. */
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly help?: string;
  readonly helpUrl?: string;
}

export interface MailProviderSetup {
  readonly fields: readonly MailProviderField[];
  /** Where the operator gets this provider's key (plugin-declared). */
  readonly helpUrl?: string;
}

/** The safe configuration DTO: credential presence only, never a secret or a username. */
export interface MailProviderConfiguration {
  readonly id: string;
  readonly label: string;
  readonly origin: "core" | "plugin";
  readonly hosted: boolean;
  /** Lanes this provider currently sends for; empty = installed but not active. */
  readonly lanes: readonly ("transactional" | "bulk")[];
  readonly capabilities: { readonly feedback: boolean; readonly domainVerification: boolean; readonly rateLimit?: { readonly perSecond: number; readonly burst: number } };
  readonly credential: {
    /** False for a provider that reads no saved key (console, keyless plugins). */
    readonly required: boolean;
    readonly saved: boolean;
    /** The exact Access Tokens label the key is saved under (not a secret). */
    readonly label?: string;
    readonly credentialId?: string;
    readonly updatedAt?: string;
  };
  /** Whether `mail_set_provider` would accept it now (presence check; activation re-checks fully). */
  readonly selectable: boolean;
  /** Why it is not selectable (log-safe). */
  readonly refusal?: string;
  readonly setup: MailProviderSetup;
}

export interface MailProviderConfigurationReport {
  readonly setting: { readonly transactional: string | null; readonly bulk: string | null };
  readonly providers: readonly MailProviderConfiguration[];
  /** Plugin providers that were not loaded, and why (log-safe). */
  readonly refusals: readonly string[];
}

/** Explicit provider selection: `check` validates without sending, `select` writes both lanes. */
export interface MailProviderControl {
  check(required: { id: string }): Promise<{ ok: true; label: string } | { ok: false; reason: string }>;
  select(required: { id: string; principalId: string }): Promise<void>;
  /** The safe configuration DTO for every installed provider. Absent in older roots. */
  describe?(): Promise<MailProviderConfigurationReport>;
  /** Drops cached provider mailers and status so the next send and status read start fresh. */
  invalidate?(): void;
}
