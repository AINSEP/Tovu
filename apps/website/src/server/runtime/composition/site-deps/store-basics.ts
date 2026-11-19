import { bindProviderFacePorts } from "#src/features/agent-plugins/provider-plugin-link";
import { createSiteAssistantErrorReporter } from "#src/assistant/site/public-errors";
import { followProviderActivations } from "#src/features/agent-plugins/provider-plugin-link";
import { preparePostSearchIndex } from "#src/features/post/index";
import { randomUUID } from "node:crypto";
import { redactSecrets } from "@jini-ai/core";
import { sqlitePluginActivationRepoFor } from "#src/features/plugin-runtime/repo.sqlite";
import type { SiteStore } from "../open-site-store.js";
import type { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";

interface ComposeStoreBasicsRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  agentPluginLayout: ReturnType<typeof resolveAgentPluginLayout>;
}

export function composeStoreBasics(required: ComposeStoreBasicsRequired, _optional = {}) {
  const { kernel, workspaceId, agentPluginLayout } = required;
  // Posts written before migration 0022 existed — and the demo content `prepareContentStore` seeds
  // directly into `posts`, bypassing `SqlitePostRepo` entirely — have no FTS projection yet, so
  // `content_post_search` would not find them without an edit. Unconditional, and awaited by every
  // search (`postSearch` below takes it as `ready`), so no consumer can ever observe a
  // half-indexed corpus; on a warm database it is a single indexed anti-join that writes nothing.
  // A failure is logged and search carries on over what is indexed. See
  // `backfillPostSearchIndex`'s own doc for why it fills gaps rather than rebuilding.
  // Rows written by OLDER projection code (e.g. HTML pages indexed before f7ca1e766 projected
  // `body_html`) are re-projected once per site by the same step when the stored projection version
  // is behind the code's — no resave needed (`reindexStalePostSearchIndex`). Not awaited by boot.
  const postSearchBackfillReady = preparePostSearchIndex({ kernel }).catch((err) => {
    console.error(`preparePostSearchIndex failed at boot: ${(err as Error).message}`);
  });
  // Canonical Jini clocks use milliseconds; existing CMS/DB host ports still read ISO timestamps.
  const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  const reportToolAuditError = createSiteAssistantErrorReporter({ ids: idGen, redact: redactSecrets,
    log: entry => console.error("[tool-audit]", entry) });
  // One vendor, one switch (owner 2026-10-25): a provider plugin's linked agent plugin face follows
  // every write of its activation row (`provider-plugin-link.ts`).
  const pluginActivationRepo = followProviderActivations({ repo: sqlitePluginActivationRepoFor({ store: kernel }), workspaceId,
    ports: bindProviderFacePorts({ workspaceRoot: () => agentPluginLayout.forWorkspace({ workspaceId }).root }) });
  return { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo };
}
