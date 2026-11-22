/** Member-login public facade; HTTP composition owns cookies, responses and route registration. */
export { loadBundledLoginProviders, loadLoginProviders, parseLoginProviders, LOGIN_PROVIDERS_FILENAME } from "./providers.js";
export { hasLoginCredentials, resolveLoginCredentials } from "./credentials.js";
export { beginOidcLogin, completeOidcLogin, memberLoginCallbackUrl, sealLoginEmailContinuation, openLoginEmailContinuation } from "./oidc-login.js";
export type { OidcLoginDeps, LoginContext, CompletedOidcLogin } from "./oidc-login.js";
export { resolveFederatedIdentity, requestLoginEmailProof } from "./link-service.js";
export type { MemberLoginLinkDeps, MemberLoginLinkInput, MemberLoginLinkResult } from "./link-service.js";

export { createReadyLoginProviderList } from "./ready-providers.js";
