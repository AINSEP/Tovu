import { ApiError } from "../../lib/api";
import type {
  AdminSourceControlConnectionInput,
  AdminSourceControlCredentialSummary,
  AdminSourceControlProviderId,
} from "./types";

/**
 * @file Pure data and computation for the Source Control page — no React, no fetch, no `t()` calls
 * (every function here returns a dictionary key for a caller to translate). Same
 * `rules.ts`-holds-the-logic convention `deployment/rules.ts`/`integrations/rules.ts` follow.
 *
 * This page is a CONNECTION page, not git integration — see `SourceControl.tsx`'s own header for
 * the scope boundary. There is no "which provider am I currently viewing" picker to model here (the
 * three provider rows below all render at once — see that file's header for why), so this file is
 * far smaller than `deployment/rules.ts`'s equivalent: one provider table, and the same
 * connect/validate/build trio `PUBLISH_CREDENTIAL_PROVIDERS` needed, nothing about publish targets,
 * CLI tools, or execution mode.
 */

/** A field the connection form can show for one provider, beyond the universal `token`. Kept as a
 *  union (of one, today) rather than inlined as a string literal so a future provider needing its
 *  own extra field extends this type in one place — same reasoning `PublishCredentialFieldKey`
 *  gives in `deployment/rules.ts`. */
export type SourceControlCredentialFieldKey = "username";

/** One provider this page can save a connection for. Order here is this page's row order —
 *  GitHub first (the one that matters), then GitLab, then Bitbucket. */
export interface SourceControlProviderInfo {
  readonly id: AdminSourceControlProviderId;
  /** Proper noun — rendered verbatim, never translated, same treatment `StaticPublishTargetInfo.label`
   *  gets in `deployment/rules.ts`. */
  readonly label: string;
  /** Where to create a token for this provider. Always opened in a new tab — a third-party
   *  account-security page has no business rendering inside this admin. */
  readonly tokenPageUrl: string;
  /** Short, inline scope guidance shown under this provider's form — a dictionary key, translated
   *  the same as every other chrome string on this page. States what KIND of token is needed, not
   *  how OAuth or PATs work in general. */
  readonly scopeGuidanceKey: string;
  /** Fields (beyond the universal `token`) this provider cannot function without — mirrors
   *  `PublishCredentialProviderInfo.requiredFields`'s exact role. Empty for GitHub and GitLab;
   *  Bitbucket needs `username` alongside its app password (Bitbucket's own REST API authenticates
   *  the pair, not the app password alone — https://support.atlassian.com/bitbucket-cloud/docs/app-passwords/). */
  readonly requiredFields: readonly SourceControlCredentialFieldKey[];
}

/**
 * The three providers this page connects, verified against each provider's own token-creation
 * docs. `requiredFields` is the single source both {@link buildSourceControlConnectionInput} and
 * {@link sourceControlCredentialRowReadyToSave} read from — a field that should gate saving belongs
 * there, never hardcoded again at either call site (same discipline `PUBLISH_CREDENTIAL_PROVIDERS`
 * documents for its own four rows).
 */
export const SOURCE_CONTROL_PROVIDERS: readonly SourceControlProviderInfo[] = [
  {
    id: "github",
    label: "GitHub",
    tokenPageUrl: "https://github.com/settings/tokens",
    scopeGuidanceKey:
      'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.',
    requiredFields: [],
  },
  {
    id: "gitlab",
    label: "GitLab",
    tokenPageUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    scopeGuidanceKey: 'Needs a personal access token with the "read_repository" and "write_repository" scopes.',
    requiredFields: [],
  },
  {
    id: "bitbucket",
    label: "Bitbucket",
    tokenPageUrl: "https://bitbucket.org/account/settings/app-passwords/",
    scopeGuidanceKey:
      "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.",
    requiredFields: ["username"],
  },
] as const;

/** Looks up one provider's registry entry, falling back to the first (GitHub) — the same
 *  "the row list can never render something absent from its own table" guarantee
 *  `publishCredentialProviderInfo` relies on in `deployment/rules.ts`.
 *  @complexity O(1) — the array has exactly three entries. */
export function sourceControlProviderInfo(id: AdminSourceControlProviderId): SourceControlProviderInfo {
  return SOURCE_CONTROL_PROVIDERS.find((provider) => provider.id === id) ?? SOURCE_CONTROL_PROVIDERS[0]!;
}

/** One provider row's connection fields, kept together as one shape so
 *  {@link buildSourceControlConnectionInput} and {@link sourceControlCredentialRowReadyToSave} share
 *  a single parameter type — mirrors `PublishCredentialFormFields`'s exact role. */
export interface SourceControlCredentialFormFields {
  providerId: AdminSourceControlProviderId;
  token: string;
  username: string;
}

/**
 * Builds the wire {@link AdminSourceControlConnectionInput} from the form's current field values —
 * the one function that decides which fields matter for which provider, mirroring
 * `buildPublishConnectionInput`. `username` is trimmed and included only for `bitbucket` (required
 * there, absent everywhere else).
 *
 * Always trims and includes `token`, even when blank — detecting "no new token typed" is
 * {@link sourceControlCredentialRowReadyToSave}'s job (a blank token on an already-connected row
 * means "leave unchanged," which is a decision about whether to send a `connection` at all, not
 * about how to shape one once the caller has decided to).
 * @complexity O(1).
 */
export function buildSourceControlConnectionInput(fields: SourceControlCredentialFormFields): AdminSourceControlConnectionInput {
  const token = fields.token.trim();
  switch (fields.providerId) {
    case "github":
      return { providerId: "github", token };
    case "gitlab":
      return { providerId: "gitlab", token };
    case "bitbucket":
      return { providerId: "bitbucket", token, username: fields.username.trim() };
  }
}

/** The single fixed label every connection saved through this page's flat per-provider row list
 *  uses — same "there is no picker left to order, every provider gets its own always-visible row,
 *  so there is nothing left to name" reasoning `PUBLISH_CREDENTIAL_ROW_LABEL` documents. If the
 *  backing table keeps a `(workspace_id, provider_id, label)` UNIQUE constraint the way
 *  `publish_credential_sets` does, this satisfies it without ever asking an operator to type one. */
export const SOURCE_CONTROL_CREDENTIAL_ROW_LABEL = "default";

/**
 * Every saved credential for one provider, in the order the server returned them.
 * @complexity O(n) in this workspace's total saved-credential count (small).
 */
export function sourceControlCredentialsForProvider(
  credentials: readonly AdminSourceControlCredentialSummary[],
  providerId: AdminSourceControlProviderId
): AdminSourceControlCredentialSummary[] {
  return credentials.filter((credential) => credential.providerId === providerId);
}

/** Which saved connection (if any) a provider's flat row should treat as "connected" — the group's
 *  DEFAULT row. Falls back to the first saved row only as a defensive read; mirrors
 *  `defaultCredentialForProvider`'s exact reasoning in `deployment/rules.ts`.
 *  @complexity O(n) in this provider's own (small) saved-connection count. */
export function defaultSourceControlCredentialForProvider(
  credentials: readonly AdminSourceControlCredentialSummary[],
  providerId: AdminSourceControlProviderId
): AdminSourceControlCredentialSummary | undefined {
  const forProvider = sourceControlCredentialsForProvider(credentials, providerId);
  return forProvider.find((credential) => credential.isDefault) ?? forProvider[0];
}

/**
 * Whether one provider's row has enough typed to save — "connected" vs. "not connected" is read
 * directly off {@link AdminSourceControlCredentialSummary} presence, not form state, so a blank
 * token always means "nothing to save" whether or not the row is already connected (leaving it
 * blank on an already-connected row keeps the stored secret untouched). Mirrors
 * `publishCredentialRowReadyToSave` exactly.
 * @complexity O(k) in this provider's own required-field count (at most one — `username` for
 *   Bitbucket; GitHub and GitLab need nothing beyond the already-checked token).
 */
export function sourceControlCredentialRowReadyToSave(fields: SourceControlCredentialFormFields): boolean {
  if (fields.token.trim() === "") return false;
  const info = sourceControlProviderInfo(fields.providerId);
  return info.requiredFields.every((field) => fields[field].trim() !== "");
}

/** What a rejected credential create/update means for the FORM — a dictionary-key-shaped result to
 *  translate and apply, mirroring `PublishCredentialSubmitFailure` exactly. `"generic"` is the
 *  catch-all every other kind falls back to. */
export type SourceControlCredentialSubmitFailure = { kind: "duplicate-label" } | { kind: "validation"; detail: string } | { kind: "generic" };

/**
 * Classifies a rejected create/update call. Checks BOTH `e.code` and `e.message` for the two known
 * markers, same reasoning `classifyPublishCredentialSubmitError` documents in `deployment/rules.ts`
 * — this page's own backend slice (not yet built, see this feature's handoff note) is expected to
 * follow the same `409 -> { error: "DUPLICATE_LABEL" }` / `400 -> { error: "VALIDATION", detail }`
 * shape every other admin write route in this app uses.
 * @complexity O(1).
 */
export function classifySourceControlCredentialSubmitError(e: unknown): SourceControlCredentialSubmitFailure {
  if (!(e instanceof ApiError)) return { kind: "generic" };
  const marker = e.code ?? e.message;
  if (marker === "DUPLICATE_LABEL") return { kind: "duplicate-label" };
  if (marker === "VALIDATION") {
    const detail = typeof e.body?.detail === "string" ? e.body.detail : e.message;
    return { kind: "validation", detail };
  }
  return { kind: "generic" };
}
