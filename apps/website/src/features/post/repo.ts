import { bindPostRepoFor } from "@jini-ai/cms/posts/sql/repo";
import { POST_SEARCH_HOST } from "./search-host-config.js";
import { createHash, randomUUID } from "node:crypto";
import { postRevisionLockKey } from "@jini-ai/core/contracts/site/post-revision-lock";
import { schemaErasedKernel } from "../../platform/db/content-kernel.js";
import { currentIso } from "@jini-ai/core/scheduled-publish";

export const postRepoFor = bindPostRepoFor({
  eraseKernel: schemaErasedKernel,
  searchHost: POST_SEARCH_HOST,
  nowIso: currentIso,
  newId: randomUUID,
  hashJsonText: text => createHash("sha256").update(text).digest("hex"),
  postRevisionLockKey,
}, {});
