export {
  type OriginScheme,
  type OriginSource,
  type VerifiedOrigin,
  InsecureOriginSourceError,
  OriginNotVerifiedError,
  createVerifiedOrigin,
} from "./types.js";
export type {
  OriginContext,
  RedirectTargetContext,
  EgressTargetContext,
  OriginRegistryPort,
  OriginSettingRepoPort,
} from "./ports.js";
export { OriginRegistry, normalizeOriginCandidate, type NormalizedTarget, type OriginRegistryDeps } from "./origin.js";
export { InMemoryOriginSettingRepo, type OriginSettingSeed } from "./repo.memory.js";
