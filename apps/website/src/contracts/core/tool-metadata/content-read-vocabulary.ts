import type { HostReadVocabulary } from "@jini-ai/cms/core";

/**
 * How Tovu's model-facing CMS tool text names the read of an entity: the `content_read.<resource>`
 * card of `assistant/content-read-tool.ts`. `@jini-ai/cms` words its redirect, taxonomy and widget
 * refusals and field help through this port because the engine may not name a host tool id; the
 * text a model sees stays byte-identical to what the cms domains wrote before the port existed
 * (pinned by the tool-contract golden files and the term-card test).
 */
export const contentReadVocabulary: HostReadVocabulary = {
  readRef: ({ entity }) => `content_read.${entity}`,
};
