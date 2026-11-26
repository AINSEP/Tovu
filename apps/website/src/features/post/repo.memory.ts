import { bindInMemoryPostRepo } from "@jini-ai/cms/posts/repo.memory";
import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import { currentIso } from "@jini-ai/core/scheduled-publish";
import { createHash, randomUUID } from "node:crypto";

export const InMemoryPostRepo = bindInMemoryPostRepo({ nowIso: currentIso, newId: randomUUID, hashJsonText: (text) => createHash("sha256").update(text).digest("hex"), createEvidence: createMediaAccessEvidence });
export type InMemoryPostRepo = InstanceType<typeof InMemoryPostRepo>;
