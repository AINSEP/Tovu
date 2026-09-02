import type { AgentToolSideEffect } from "@jini-ai/cms/core";

/**
 * @file Agent-tool catalog for `features/media-generation` — closes the "I cannot generate images,
 * as Tovu does not have an AI image generation tool configured" gap a production transcript
 * surfaced (the assistant found `media_upload_asset`/`content_post_create` via `search_tools` five
 * times over and never found a generation tool, because none existed). The engine this tool wraps
 * (`@jini-ai/integrations/media-providers`'s multi-vendor dispatch engine) already existed and was
 * imported nowhere under `apps/` — this catalog is the first caller.
 *
 * ONE tool, `media_generate_asset`. OpenAI-only in this slice (2026-09-02 dispatch scope): every
 * other vendor the dispatch engine supports (Grok, NanoBanana, ElevenLabs, ...) is a real, separate
 * capability this catalog deliberately does not claim yet — adding a second provider is a second,
 * independently-scoped tool-catalog change, not a hidden default this tool falls back to. The
 * three model ids below are exactly OpenAI's registered image models
 * (`@jini-ai/integrations/media-providers`'s `IMAGE_MODELS`, filtered to `provider: 'openai'`) —
 * duplicated here as a fixed enum (not imported) for the same reason `media/agent-tools.ts` inlines
 * its own MIME allowlist into its schema: a published JSON Schema must be a static literal, not a
 * value computed at import time from a catalogue that could grow to include non-OpenAI ids this
 * tool must never silently accept.
 *
 * Architectural role: `features/media-generation` domain declaration. No dependencies.
 */

/** Local declaration, not shared — same "duplicate the tiny type, never share across
 *  features/files" convention `custom-credentials/agent-tools.ts`'s own `AgentToolDefinition` doc
 *  establishes. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/**
 * OpenAI's registered image models (`@jini-ai/integrations/media-providers`'s `IMAGE_MODELS`,
 * `provider: 'openai'` rows only) — see this file's header for why this is a fixed literal rather
 * than computed from the catalogue at import time. Exported (not module-private) so
 * `tool-registrations.ts` can validate `model` at the handler level against the SAME set the
 * published schema's `enum` names — the schema's `enum` is descriptive only (the kernel "neither
 * parses nor validates" a tool's schema, per `@jini-ai/core`'s own `ToolDescriptor.inputSchema` doc,
 * the same caveat `custom-credentials/tool-registrations.ts`'s own allowlist checks document), so a
 * caller-supplied `model` outside this set must be rejected in the handler, not merely described
 * here.
 */
export const OPENAI_IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5", "dall-e-3"] as const;

const GENERATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompt"],
  properties: {
    prompt: {
      type: "string",
      minLength: 1,
      description: "A text description of the image to generate. Be specific and detailed — the vendor generates from this text alone, with no other context.",
    },
    model: {
      type: "string",
      enum: [...OPENAI_IMAGE_MODELS],
      description:
        "Which OpenAI image model to use. Defaults to 'gpt-image-2' (4K, native multimodal) when omitted. " +
        "'gpt-image-1.5' is 4x faster; 'dall-e-3' is the older, classic model. Only these three are supported — no other vendor is wired up yet.",
    },
    alt: { type: "string", description: "Optional accessibility alt text for the uploaded asset." },
    caption: { type: "string", description: "Optional display caption for the uploaded asset." },
    credit: { type: "string", description: "Optional attribution/credit line for the uploaded asset." },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const mediaGenerationAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "media_generate_asset",
    description:
      "THIS IS HOW TO GENERATE A NEW IMAGE FROM A TEXT PROMPT — the assistant's own image generator, not a saved custom credential and not a raw API call. Call this whenever asked to create, generate, draw, design, or make an image (a logo, a hero banner, an illustration, a placeholder photo, ...) rather than uploading an existing file. Uses the workspace's saved OpenAI media-provider credential (Admin → Media → 'Media providers' tab) to generate one image from `prompt`, then uploads the result into the media library exactly like media_upload_asset would — the returned `media` object (id, title, alt, caption, credit, sha256, status, version, publicUrl) is the SAME shape media_upload_asset/media_list_assets return, so the same `id` can immediately be used with media_update_metadata/media_trash_asset, and `publicUrl` (when present) is a real URL usable to embed the image in a post/page right away. Only OpenAI is supported in this build ('gpt-image-2' default, or 'gpt-image-1.5'/'dall-e-3' — see the `model` field); no other vendor is wired up. If no OpenAI credential is configured yet, this tool fails with a clear message pointing at the Media providers tab rather than a raw API error — tell the human to add one there, do not retry. Costs real money per call (a paid third-party API) — do not call speculatively or in a loop; generate once per request unless explicitly asked to try again.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "media.upload" },
    inputSchema: GENERATE_SCHEMA,
  },
];
