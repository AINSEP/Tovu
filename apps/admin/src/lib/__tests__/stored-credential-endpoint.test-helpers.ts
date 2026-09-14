import { act } from "@testing-library/react";
import { vi } from "vitest";
import { DEFAULT_PROVIDER_PRESETS, type ByokConfig, type ExecutionPort } from "@jini-ai/ui";

import { ApiError, type AdminExecutionCredential } from "../api";

/**
 * @file Shared fixtures for the suites that drive the REAL `ExecutionTab` over the admin's stored BYOK
 * key: `features/ai-assistant/__tests__/AdminExecutionMode.unit.test.tsx` (AI Assistant -> Admin AI
 * Assistant) and `features/settings/__tests__/SettingsUi.unit.test.tsx` (Settings -> Execution mode).
 * The two mounts must never disagree, so both suites use the same saved key and the same server stand-in.
 */

export const GOOGLE = "https://generativelanguage.googleapis.com";
export const OPENAI = "https://api.openai.com/v1";

/** The owner's repro key (`owner-screenshots-2026-09-13/29-*.png`): a Google key, saved for Google. */
export const GOOGLE_ADMIN_KEY: AdminExecutionCredential = {
  isSet: true,
  masked: "••••mw4w",
  protocol: "google",
  providerId: "google",
  baseUrl: GOOGLE,
  model: "gemini-flash-latest",
  maxTokens: null,
  updatedAt: "2026-09-13T00:00:00.000Z",
};

/** The built-in preset that owns `baseUrl`. Throws when none does, so a renamed preset fails loudly. */
export function presetFor(baseUrl: string) {
  const preset = DEFAULT_PROVIDER_PRESETS.find((p) => p.baseUrl === baseUrl);
  if (!preset) throw new Error(`no built-in preset for ${baseUrl}`);
  return preset;
}

/** The form on whichever built-in preset owns `baseUrl`, with nothing typed. */
export function formOn(baseUrl: string, model: string): ByokConfig {
  const preset = presetFor(baseUrl);
  return { protocol: preset.protocol, providerId: preset.id, apiKey: "", baseUrl, model };
}

/**
 * An `ExecutionPort` whose `listModels` answers the way the server's endpoint pin does
 * (`stored-credential-probe.ts`, reached through `list-models.ts`): a typed key may go anywhere; with
 * nothing typed, the stored key goes only to the endpoint it was saved for. The two refusals carry the
 * server's own API-caller text, the text the owner saw rendered raw.
 */
export function createServerPinnedProbes(stored: AdminExecutionCredential) {
  return {
    detectLocalAgents: vi.fn(async () => []),
    testConnection: vi.fn(async () => ({ ok: true, message: "Connected" })),
    listModels: vi.fn(async (byok: ByokConfig): Promise<string[]> => {
      if (byok.apiKey.trim()) return ["typed-key-model"];
      if (!stored.baseUrl) {
        throw new ApiError(
          "the admin execution credential has no saved endpoint, so this probe has no approved destination — save a base URL for the credential first, or supply an apiKey in this request",
          400,
          "STORED_CREDENTIAL_ENDPOINT_UNSET",
        );
      }
      if (stored.baseUrl !== byok.baseUrl) {
        throw new ApiError(
          `the admin execution credential is saved for '${stored.baseUrl}' and cannot be probed against '${byok.baseUrl}' — save the new endpoint first, or supply an apiKey for it in this request`,
          400,
          "STORED_CREDENTIAL_ENDPOINT_MISMATCH",
        );
      }
      return ["gemini-flash-latest"];
    }),
  } satisfies ExecutionPort;
}

/** `ByokProviderForm`'s API-key input. It has no id, and its label also holds the "Get key" link. */
export function apiKeyField(): HTMLInputElement {
  const field = document.querySelector<HTMLInputElement>('input[autocomplete="new-password"]');
  if (!field) throw new Error("no API key field rendered");
  return field;
}

/** Lets every settled probe render. A refusal lands a microtask after its call, so a "nothing on screen"
 *  assertion made sooner could pass on a screen about to show one. */
export async function settle(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}
