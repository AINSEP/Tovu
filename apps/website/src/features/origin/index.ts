// Trusted-origin invariants are owned by Jini packages/http-kit/src/verified-origin/types.ts (ADR-040).
/** Tovu's configured-origin policy; generic consumers import Jini directly. */
export {
  planOriginBoot,
  resolveConfiguredOrigin,
  type ConfiguredOriginOptions,
  type OriginBootPlan,
} from "./configured-origin.js";
