import { buildFormSurface, buildOutcomeSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import { CUSTOM_CREDENTIAL_CATEGORIES } from "./types.js";

/**
 * @file The MCP-UI surfaces `tool-registrations.ts` raises for `custom_credential_create`
 * (2026-09-03) — a multi-field in-chat form for creating a brand-new saved custom credential (label,
 * base URL, category, optional username, and the token), and the result document that replaces it
 * once the save actually finishes.
 *
 * Closes a gap `custom_credential_set_token`'s own header names but does not itself solve: that tool
 * can only ROTATE a token on a credential that already exists (it resolves an existing row by `label`
 * before ever opening its form) — until this file, there was no way for the assistant to create the
 * ROW itself, so an agent that found no saved credential for a provider had to dead-end the human with
 * "go to Admin -> Access Tokens -> Add custom provider" instead of finishing the job in chat. This
 * surface is `buildSetTokenFormResource`'s sibling for the CREATE case, holding up the SAME property
 * that whole mechanism exists for — "a token must never pass through the model's context" — see
 * `custom-credential-set-token-ui.ts`'s own header for the full reasoning (a human typing a token into
 * ordinary chat text would land in `ai_chat_messages`, the model's own context, and the CLI's session
 * history; this form is the escape from that). Extended with the two fields a NEW row additionally
 * needs that a rotation does not: `baseUrl` and `category` (a closed enum — the Access Tokens page's
 * own filter set, `types.ts`'s `CUSTOM_CREDENTIAL_CATEGORIES`).
 *
 * Structurally closer to `deployment_propose_custom_provider_credential`'s own multi-field form
 * (`features/deployments/publish-agent-tools.ts`'s `buildProposeCredentialForm`) than to
 * `custom_credential_set_token`'s single-field one — both collect several non-secret fields alongside
 * one secret. Driven by `askThenReport`, like `custom_credential_set_token` (not `askOnce`, unlike the
 * propose-credential form): the identical defect `custom-credential-set-token-ui.ts`'s header
 * describes applies here too (a submission's `tools/call` round trip resolving the instant the
 * exchange DELIVERS the click, before `createCustomCredential` has actually run), and this tool sits
 * directly beside `custom_credential_set_token` in `tool-registrations.ts`, so it follows that
 * sibling's precedent rather than the cross-feature one.
 *
 * ## Why the URI carries only the exchange id
 *
 * Same reasoning `custom-credential-set-token-ui.ts` and `customProviderCredentialFormUri`
 * (`publish-agent-tools.ts`) both give: a CREATE has no existing row/version to key against at the
 * point the form is raised — the row does not exist until the human submits — so the exchange id is
 * the only stable handle a fresh form instance has.
 */

export const CREATE_TOOL_ID = "custom_credential_create";

/** Non-secret pre-fill hints the model-issued call may carry — see `agent-tools.ts`'s
 *  `CREATE_CREDENTIAL_SCHEMA` for the exact three fields this accepts. All three are optional; an
 *  absent field renders its form control blank rather than pre-filled. */
export interface CreateCredentialPrefill {
  readonly label?: string;
  readonly baseUrl?: string;
  readonly category?: string;
}

/** Shared by the form and its later outcome document — see this file's header, "Why the URI carries
 *  only the exchange id". Reusing the SAME uri for both is what makes the outcome REPLACE the form
 *  in the transcript instead of opening a second card. */
export function createCredentialSurfaceUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/custom-credential-create/${exchangeId}` as UIResourceUri;
}

/**
 * Renders the credential-creation form: label, base URL, category (a closed select drawn from
 * `CUSTOM_CREDENTIAL_CATEGORIES`, defaulting to `"general"` when unprefilled), an optional username,
 * and the masked token field — the ONLY place the token exists outside the sealed ciphertext it
 * becomes a moment later. It is typed directly into this iframe and posted straight to
 * `mcp-ui-tool-calls-route.ts`, never through the assistant's own text channel. A prefilled `category`
 * that does not match one of the fixed options simply starts unselected (`renderSelect`'s own
 * documented behavior) — never a rendering error.
 *
 * @complexity O(1) — a fixed five-field form (`CUSTOM_CREDENTIAL_CATEGORIES.length` is a small,
 *   compile-time-fixed constant, so the category options list is effectively O(1) too).
 */
export function buildCreateFormResource(spec: { exchangeId: string; prefill: CreateCredentialPrefill }): UIResource {
  const { exchangeId, prefill } = spec;
  return buildFormSurface({
    uri: createCredentialSurfaceUri(exchangeId),
    title: "Save a new custom credential",
    description:
      "Fill in the credential's label, base URL, and category, and type its token directly into the field below. " +
      "The token is sealed on the server the moment you submit — the assistant never sees it, and it is never " +
      "written to the chat transcript.",
    submitLabel: "Save credential",
    toolName: CREATE_TOOL_ID,
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    fields: [
      {
        kind: "string",
        name: "label",
        label: "Label",
        hint: "A short display name, e.g. 'github' or 'fly.io'. Must be unique in this workspace.",
        required: true,
        ...(prefill.label !== undefined ? { value: prefill.label } : {}),
      },
      {
        kind: "string",
        name: "baseUrl",
        label: "Base URL",
        hint: "The provider's API base URL, e.g. 'https://api.github.com'.",
        required: true,
        ...(prefill.baseUrl !== undefined ? { value: prefill.baseUrl } : {}),
      },
      {
        kind: "enum",
        name: "category",
        label: "Category",
        required: true,
        options: CUSTOM_CREDENTIAL_CATEGORIES.map((id) => ({ value: id })),
        // Defaults to "general" (the closed set's catch-all) when the model supplied no prefill hint —
        // mirrors the admin Access Tokens page's own "Add custom provider" form
        // (`apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts`'s `emptyCustomAddForm`),
        // which has always defaulted this field the same way. Without this, `renderSelect` (required +
        // no `value`) renders a genuinely blank, blocking required select — a human with no obvious
        // category for e.g. a fly.io token had nothing sensible to pick. Still freely changeable before
        // submit; a bad/unrecognized prefill still starts unselected, per this file's own header.
        value: prefill.category ?? "general",
      },
      {
        kind: "string",
        name: "username",
        label: "Username (optional)",
        hint: "An account identifier, if this provider needs one alongside the token — never a secret.",
      },
      {
        kind: "string",
        name: "token",
        label: "Token",
        hint: "Pasted or typed here only — never shown to the assistant.",
        required: true,
        secret: true,
      },
    ],
    cancel: {
      label: "Cancel",
      toolName: CREATE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true },
    },
    app: { appName: "tovu-custom-credential-create", appVersion: "1" },
    preferredFrameSize: ["100%", "560px"],
  });
}

/**
 * Renders the RESULT of a submitted create — what replaces the form once `askThenReport`'s `handle`
 * callback (`handleCreateAnswer`, `tool-registrations.ts`) has actually run `createCustomCredential`
 * (or refused to, e.g. a duplicate label or an invalid category). See this file's header for the
 * mechanism and why the `uri` MUST equal {@link createCredentialSurfaceUri} for the same exchange id.
 *
 * `message` is caller-controlled and must never carry the token itself — enforced by construction at
 * every call site in `tool-registrations.ts`, never by this function, which only renders what it is
 * given (same division of responsibility `buildSetTokenOutcomeResource`'s own doc states).
 *
 * @complexity O(1) — fixed-size field reads.
 */
export function buildCreateOutcomeResource(spec: { exchangeId: string; label: string; state: "success" | "failure"; message: string }): UIResource {
  const { exchangeId, label, state, message } = spec;
  return buildOutcomeSurface({
    uri: createCredentialSurfaceUri(exchangeId),
    title: state === "success" ? "Credential saved" : "Credential not saved",
    details: [{ label: "Label", value: label }],
    state,
    message,
    app: { appName: "tovu-custom-credential-create-outcome", appVersion: "1" },
    preferredFrameSize: ["100%", "240px"],
  });
}
