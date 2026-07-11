export {
  type OriginScheme,
  type OriginSource,
  type VerifiedOrigin,
  InsecureOriginSourceError,
  OriginNotVerifiedError,
  createVerifiedOrigin,
} from "./types";
export type {
  OriginContext,
  RedirectTargetContext,
  EgressTargetContext,
  OriginRegistryPort,
  OriginSettingRepoPort,
} from "./ports";
export { OriginRegistry, normalizeOriginCandidate, type NormalizedTarget, type OriginRegistryDeps } from "./origin";
export { InMemoryOriginSettingRepo, type OriginSettingSeed } from "./repo.memory";
