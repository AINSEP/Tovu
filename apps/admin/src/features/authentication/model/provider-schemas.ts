/**
 * Credential-field metadata for the provider tabs already exposed by the Authentication screen.
 * This is UI metadata only: it deliberately contains no callback URL, secret value, SDK object,
 * persistence state, or claim that Tovu can complete an OAuth flow.
 */

export type AuthenticationProviderId = "google" | "facebook" | "linkedin";

export interface AuthenticationCredentialFieldSchema {
  readonly key: string;
  readonly label: string;
  readonly kind: "text" | "password";
  readonly placeholder: string;
  readonly hint: string;
  readonly required: true;
}

export interface AuthenticationProviderSchema {
  readonly id: AuthenticationProviderId;
  readonly label: string;
  readonly subtitle: string;
  readonly fields: readonly AuthenticationCredentialFieldSchema[];
}

/**
 * The fixed provider catalog rendered by {@link Authentication}. Adding an entry changes the
 * operator-visible surface, so it must happen only alongside a real product/provider decision.
 */
export const AUTHENTICATION_PROVIDER_SCHEMAS: readonly AuthenticationProviderSchema[] = [
  {
    id: "google",
    label: "Google",
    subtitle: "OAuth client credentials for Google sign-in.",
    fields: [
      {
        key: "clientId",
        label: "Client ID",
        kind: "text",
        placeholder: "1234567890-example.apps.googleusercontent.com",
        hint: "OAuth 2.0 Web application client ID from Google Cloud Console.",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client secret",
        kind: "password",
        placeholder: "Enter Google client secret",
        hint: "OAuth 2.0 client secret paired with the client ID.",
        required: true,
      },
    ],
  },
  {
    id: "facebook",
    label: "Facebook",
    subtitle: "OAuth app credentials for Facebook sign-in.",
    fields: [
      {
        key: "appId",
        label: "App ID",
        kind: "text",
        placeholder: "Enter Meta app ID",
        hint: "Application ID from Meta for Developers.",
        required: true,
      },
      {
        key: "appSecret",
        label: "App secret",
        kind: "password",
        placeholder: "Enter Meta app secret",
        hint: "Application secret paired with the app ID.",
        required: true,
      },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    subtitle: "OAuth client credentials for LinkedIn sign-in.",
    fields: [
      {
        key: "clientId",
        label: "Client ID",
        kind: "text",
        placeholder: "Enter LinkedIn client ID",
        hint: "OAuth 2.0 client ID from the LinkedIn developer application.",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client secret",
        kind: "password",
        placeholder: "Enter LinkedIn client secret",
        hint: "OAuth 2.0 client secret paired with the client ID.",
        required: true,
      },
    ],
  },
] as const;
