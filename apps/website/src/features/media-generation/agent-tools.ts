import type { AgentToolSideEffect } from "@jini-ai/cms/core";
import { IMAGE_MODELS, findProvider } from "@jini-ai/integrations/media-providers/catalog";

/**
 * @file Agent-tool catalog for `features/media-generation` — closes the "I cannot generate images,
 * as Tovu does not have an AI image generation tool configured" gap a production transcript
 * surfaced (the assistant found `media_upload_asset`/`content_post_create` via `search_tools` five
 * times over and never found a generation tool, because none existed). The engine this tool wraps
 * (`@jini-ai/integrations/media-providers`'s multi-vendor dispatch engine) already existed and was
 * imported nowhere under `apps/` — this catalog is the first caller.
 *
 * ONE tool, `media_generate_asset`. Provider-agnostic as of the 2026-09-02 follow-up dispatch: the
 * first landed slice was OpenAI-only, which turned out to be unusable on machines with no OpenAI
 * credential and a different vendor's key instead (this one has `GEMINI_API_KEY`, no
 * `OPENAI_API_KEY`) — see `tool-registrations.ts`'s module doc for the credential-resolution half of
 * that fix. This file's half: `model` now accepts one id from every vendor the catalogue itself
 * marks real (see {@link IMAGE_MODEL_IDS}), not a fixed 3-entry OpenAI literal.
 *
 * Architectural role: `features/media-generation` domain declaration — no dependency on any other
 * Tovu feature module. Its one external import, `@jini-ai/integrations/media-providers/catalog`, is
 * that package's deliberately dependency-free reference-data subpath (no `node:*`/`undici` imports —
 * see that subpath's own module doc): reference data, not I/O, so importing it does not compromise
 * this file's standalone-domain-declaration role the way importing the dispatch engine
 * (`tool-registrations.ts`'s heavier import) would.
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
 * Every catalogued image model whose vendor the catalogue itself marks `integrated` (a real vendor,
 * not a planned/placeholder entry — see `MediaProvider.integrated`'s own doc in
 * `@jini-ai/integrations/media-providers`). Computed at import time from `IMAGE_MODELS`, the SAME
 * catalogue the dispatch engine itself validates `model` against (`engine.ts`'s own
 * `findMediaModel`/`modelsForSurface`) — replaces this file's old `OPENAI_IMAGE_MODELS`, a fixed
 * 3-entry literal that made every non-OpenAI vendor (including this machine's actually-configured
 * one, Nano Banana / `nanobanana`) unreachable through this tool no matter what credential existed.
 * Exported (not module-private) so `tool-registrations.ts` can validate `model` at the handler level
 * against the SAME set the published schema's `enum` names — the schema's `enum` is descriptive only
 * (the kernel "neither parses nor validates" a tool's schema, per `@jini-ai/core`'s own
 * `ToolDescriptor.inputSchema` doc), so a caller-supplied `model` outside this set must be rejected in
 * the handler, not merely described here.
 *
 * As of the 2026-09-02 catalogue fix, this filter IS a perfect proxy for "the dispatch engine has a
 * real adapter wired up": `hyperframes`/`fal`/`leonardo` used to ship `integrated: true` with zero
 * `mediaVendorRegistry.register(...)` calls anywhere for them (a catalogue lie caught by
 * `providers.test.ts`'s adapter-coverage assertion), so selecting one of their models used to reach
 * the dispatch engine's own clean `no renderer configured for provider "..." ... pass
 * allowStubFallback: true` error at generation time instead of a real image. Now that all three are
 * `integrated: false`, every image-surface provider this filter includes
 * (`openai`/`nanobanana`/`grok`/`volcengine`/`imagerouter`/`senseaudio`/`openrouter`/`custom-image`/
 * `aihubmix`) has a registered adapter (`dispatch/vendor-registry.ts`'s `mediaVendorRegistry`, which
 * this dependency-free file deliberately does not import — see this file's own header), same as every
 * excluded provider (`fal`/`leonardo`/`bfl`/`replicate`/`google`/`kling`/`midjourney`/`comfyui`/
 * `suno`/`udio`) is genuinely unwired anywhere in this codebase — so this filter is reading the
 * catalogue's own signal, not a guess.
 */
export const IMAGE_MODEL_IDS: readonly string[] = IMAGE_MODELS.filter(
  (model) => findProvider(model.provider)?.integrated === true
).map((model) => model.id);

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
      enum: [...IMAGE_MODEL_IDS],
      description:
        "Which image model to use — picking a model also picks its vendor; there is no separate provider field. " +
        "Defaults to 'gpt-image-2' (OpenAI) when omitted. Other options include 'gemini-3.1-flash-image-preview' " +
        "(Nano Banana / Google Gemini) and 'grok-imagine-image' (xAI Grok), across every registered vendor. Which " +
        "ones actually work depends on which vendor has a credential configured for this workspace (Admin -> Media " +
        "-> 'Media providers') or set as an environment variable on this install — an unconfigured vendor fails " +
        "with a clear message rather than silently substituting a different one.",
    },
    allowStubFallback: {
      type: "boolean",
      description:
        "Opt-in escape hatch, default false. When true, and the selected model's vendor has no real integration " +
        "wired up in this build yet (a small remainder of the catalog the engine itself decides, not a fixed list " +
        "here), a deterministic PLACEHOLDER image is returned instead of failing outright, and the returned " +
        "media's `placeholder` field is set to true. Never used silently when this is false/omitted — a vendor " +
        "with no real integration fails with a clear error instead. Does NOT paper over a missing/invalid " +
        "credential for a vendor that DOES have a real integration — that still fails with a normal error either way.",
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
      "THIS IS HOW TO GENERATE A NEW IMAGE FROM A TEXT PROMPT — the assistant's own image generator, not a saved custom credential and not a raw API call. Call this whenever asked to create, generate, draw, design, or make an image (a logo, a hero banner, an illustration, a placeholder photo, ...) rather than uploading an existing file. Generates one image from `prompt` using whichever vendor the `model` field selects (see that field's own description — every registered vendor is supported, not just OpenAI), then uploads the result into the media library exactly like media_upload_asset would — the returned `media` object (id, title, alt, caption, credit, sha256, status, version, publicUrl, placeholder) is the SAME shape media_upload_asset/content_read.media_asset return plus one extra field: `placeholder` is true only on the rare deterministic-stub fallback (see the `allowStubFallback` field), false for a real generation. The same `id` can immediately be used with media_update_metadata/media_trash_asset, and `publicUrl` (when present) is a real URL usable to embed the image in a post/page right away. Credentials are resolved per-vendor: a saved one from Admin -> Media -> 'Media providers' first, an environment variable second. A vendor with neither configured fails with a clear message pointing at the Media providers tab rather than a raw API error — tell the human to add one there, do not retry. Costs real money per call for a real (non-placeholder) generation — do not call speculatively or in a loop; generate once per request unless explicitly asked to try again.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "media.upload" },
    inputSchema: GENERATE_SCHEMA,
  },
];
