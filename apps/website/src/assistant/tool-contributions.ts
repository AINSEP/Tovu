/** Resource contribution contracts only: features return data; composition owns registration.
 * Preserve the generic dependency contract rather than binding features to the full tool registry. */
export type { DuplicateResourceHandler, DuplicateResourceHandlerContributor } from "./duplicate-resource-registry.js";
