import { createShareFilePolicy } from "@jini-ai/devops/backup/site/share-file-policy";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { checkTreePath } from "../publish-content/file-tree-policy.js";
import { SHARE_LIMITS } from "./share-policy.js";

/** The engine share file policy bound to Tovu's secret shapes (incl. the host API-key rule),
 * the publish tree-path rules and the host share depth limit. */
export const { secretSharePath, excludedSharePath, validateSharePath, requireShareSecretFree, claimSharePath } =
  createShareFilePolicy({ redactSecretShapes, checkTreePath, maxPathSegments: SHARE_LIMITS.maxPathSegments });
