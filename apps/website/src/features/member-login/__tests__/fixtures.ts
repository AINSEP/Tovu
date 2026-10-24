import { randomBytes } from "node:crypto";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { createFakeClock } from "../../../__tests__/support/fake-clock.js";
import type { LoginProvider } from "../types.js";

export const provider: LoginProvider = { id: "google", label: "Google", pluginId: "google-login", configurationVersion: "preset-v1",
  issuer: "https://accounts.google.com", authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token", jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  scopes: ["openid", "email", "profile"], signingAlgorithm: "RS256", clientAuthentication: "client_secret_post", pkce: "S256",
  credentialLabel: "google-login/google OAuth client", credentialCardTarget: "google-login-oauth-client",
  authoritativeEmailDomains: ["gmail.com", "googlemail.com"], hostedDomainClaim: "hd" };

export function cryptoFixture() {
  const clock = createFakeClock({ startIso: "2026-10-24T12:00:00.000Z" });
  const keyring = new InMemoryKeyring();
  return { clock, keyring, sealer: new AesGcmSecretSealer(keyring), randomBytesFn: ({ byteLength }: { byteLength: number }) => randomBytes(byteLength) };
}

export function originFixture() {
  return {
    canonicalOrigin: async () => ({ scheme: "https" as const, host: "site.example", verifiedAt: "2026-10-24T12:00:00.000Z", source: "workspace-setting" as const }),
    isAllowedRedirectTarget: async () => false,
    isAllowedEgressTarget: async () => false,
  };
}
