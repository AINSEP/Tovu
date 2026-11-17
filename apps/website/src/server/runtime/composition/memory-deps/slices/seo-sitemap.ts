import { InMemoryTransformDefinitionRepo } from "#src/features/media/index";
import { createSeoDeps } from "#src/features/seo/index";
import { createSitemapService } from "@jini-ai/cms/seo";
import { InMemoryPostRepo } from "#src/features/post/index";
import { InMemorySettingsRepo } from "#src/features/settings/index";
import type { composeOriginNewsletter } from "./origin-newsletter.js";
import type { MemoryClock } from "../ports.js";
import type { InMemoryVersionedMediaRepo, InMemoryMediaContentTypeStore } from "#src/features/media/index";

export interface MemorySeoInput {
  postRepo: InMemoryPostRepo;
  settingsRepo: InMemorySettingsRepo;
  mediaRepo: InMemoryVersionedMediaRepo;
  mediaContentTypeStore: InMemoryMediaContentTypeStore;
  originRegistry: ReturnType<typeof composeOriginNewsletter>["originRegistry"];
  clock: MemoryClock;
}

export function composeMemorySeo(required: MemorySeoInput, _optional = {}) {
  const { postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, originRegistry, clock } = required;
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo({}, { initialRows: [] });
  const seoDeps = createSeoDeps({ deps: { postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, transformDefinitionRepo, originRegistry, clock } }, {});
  const sitemapService = createSitemapService({ deps: seoDeps }, {});
  return { seoDeps, sitemapService, transformDefinitionRepo };
}
