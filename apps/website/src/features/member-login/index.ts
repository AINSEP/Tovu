/** Member-login public facade; HTTP composition owns cookies, responses and route registration. */
export { loadBundledLoginProviders, loadLoginProviders, parseLoginProviders, LOGIN_PROVIDERS_FILENAME } from "./providers.js";
export { hasLoginCredentials, resolveLoginCredentials } from "./credentials.js";
export { beginOidcLogin, completeOidcLogin, memberLoginCallbackUrl, sealLoginEmailContinuation, openLoginEmailContinuation } from "./oidc-login.js";
export type { OidcLoginDeps, LoginContext, CompletedOidcLogin } from "./oidc-login.js";
export { decideMemberLogin } from "./link-policy.js";
export { resolveFederatedIdentity, requestLoginEmailProof } from "./link-service.js";
export type { MemberLoginLinkDeps, MemberLoginLinkInput, MemberLoginLinkResult } from "./link-service.js";
export { MemberLoginError } from "./types.js";
export type { LoginProvider, LoginProviderPreset, VerifiedLoginIdentity, MemberLoginOutcomeCode } from "./types.js";
