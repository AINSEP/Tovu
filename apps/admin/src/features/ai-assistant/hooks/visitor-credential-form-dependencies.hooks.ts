import type { SiteAssistantCredential } from "@jini-ai/core/contracts/site/api-ai-assistant-api-types";
import { DEFAULT_PROVIDER_PRESETS } from "@jini-ai/integrations/media-providers/catalog";
import type { ExecutionPort } from "@jini-ai/ui";
import { useVisitorCredentialForm } from "@jini-ai/admin/screens/assistant-settings/use-visitor-credential-form.hooks";
import type {
  VisitorCredentialFormController,
  VisitorCredentialFormDependencies,
  VisitorCredentialFormPort,
  VisitorCredentialFormRules,
} from "@jini-ai/admin/screens/assistant-settings/visitor-credential-form-port";
import { aiAssistantApi } from "@/features/ai-assistant/api/ai-assistant-api";
import { createExecutionPort } from "@/lib/execution-settings";
import { describeProbeError, hasUsableKey, storedKeyBlocksProbe, storedKeyIsForOtherEndpoint } from "@/lib/stored-credential-endpoint";
import { DEFAULT_VISITOR_PRESET_ID, describeApiError } from "../rules";

/**
 * @file The host binding for the visitor credential form, whose hook, port and rules now live in
 * `@jini-ai/admin/screens/assistant-settings`. This is the only place that form reaches `lib/api`,
 * the provider catalog, this app's error copy and its stored-key endpoint rules — see that package's
 * `visitor-credential-form-port.ts` for why the split exists.
 */

/** The model discovery seeds first when a key offers it: the server's own default (`site-assistant.ts`'s
 *  `DEFAULT_MODEL`), so the UI agrees with what the server would pick. */
export const VISITOR_PREFERRED_MODEL = "gemini-flash-latest";

/** This app's error copy and stored-key endpoint rules, as the form's injected rules. */
export const visitorCredentialFormRules: VisitorCredentialFormRules = {
  describeApiError: ({ e, fallback }) => describeApiError({ e, fallback }),
  describeProbeError: ({ e, fallback }) => describeProbeError({ e, fallback }),
  storedKeyIsForOtherEndpoint: ({ stored, baseUrl }) => storedKeyIsForOtherEndpoint({ stored, baseUrl }),
  hasUsableKey: ({ apiKey, stored, baseUrl }) => hasUsableKey({ apiKey, stored, baseUrl }),
  storedKeyBlocksProbe: ({ apiKey, stored, baseUrl }) => storedKeyBlocksProbe({ apiKey, stored, baseUrl }),
};

/** Everything but the credential client. `useStoredCredential` is what makes both probes work
 *  against a key this browser does not have; Settings → Execution mode deliberately does NOT opt in. */
const hostBindings: Omit<VisitorCredentialFormDependencies, "port"> = {
  rules: visitorCredentialFormRules,
  presets: DEFAULT_PROVIDER_PRESETS,
  defaultPresetId: DEFAULT_VISITOR_PRESET_ID,
  preferredModel: VISITOR_PREFERRED_MODEL,
  createExecutionPort: () => createExecutionPort({ useStoredCredential: true }),
};

/**
 * The form with this app's rules, catalog and defaults bound, over a caller-chosen credential
 * client — what tests compose with a fake port (and optionally a fake probe transport).
 *
 * @complexity Time/space: O(1).
 */
export function useHostVisitorCredentialForm(
  { port }: { port: VisitorCredentialFormPort },
  { executionPort }: { executionPort?: ExecutionPort } = {},
): VisitorCredentialFormController {
  return useVisitorCredentialForm({ ...hostBindings, port }, { executionPort });
}

/**
 * Binds the real `/api/.../assistant/site-credential` client — the zero-argument-dependencies half
 * of the `useX(dependencies)` / `useWiredX()` pair, so `AiAssistant.tsx` composes this and a test
 * composes {@link useHostVisitorCredentialForm} with `createFakeVisitorCredentialFormPort`.
 *
 * @returns The full form controller, wired to the real site-credential client.
 */
export function useWiredVisitorCredentialForm(): VisitorCredentialFormController {
  return useHostVisitorCredentialForm({ port: defaultVisitorCredentialFormPort });
}

/** The live implementation, as a module-level singleton — matches `ai-assistant-dependencies
 *  .hooks.ts`'s `defaultAiAssistantPort`. */
export const defaultVisitorCredentialFormPort: VisitorCredentialFormPort = {
  getAssistantSiteCredential: () => aiAssistantApi.getAssistantSiteCredential(),
  setAssistantSiteCredential: (patch, _optional: Record<string, never> = {}) => aiAssistantApi.setAssistantSiteCredential(patch),
};

/** Seed state for {@link createFakeVisitorCredentialFormPort}. */
export interface FakeVisitorCredentialFormPortOptions {
  credential?: SiteAssistantCredential;
}

const DEFAULT_FAKE_CREDENTIAL: SiteAssistantCredential = {
  isSet: false,
  masked: null,
  provider: "google",
  baseUrl: null,
  model: null,
  updatedAt: null,
};

/**
 * An in-memory {@link VisitorCredentialFormPort} for tests — shipped alongside the real binding per
 * the pattern's "every port gets a fake" rule (see `ai-assistant-dependencies.hooks.ts`'s identical
 * note). `use-visitor-credential-form.unit.test.ts`'s own hand-rolled fake predates this file (the
 * F05 coupling fix landed before the port/dependencies split) and still covers the injected-port
 * seam directly; this is the shared fake future tests can reach for instead of rebuilding one.
 */
export function createFakeVisitorCredentialFormPort(
  options: FakeVisitorCredentialFormPortOptions = {},
): VisitorCredentialFormPort & {
  /** The fake's current credential record. */
  readonly current: SiteAssistantCredential;
} {
  let current = options.credential ?? DEFAULT_FAKE_CREDENTIAL;

  return {
    get current() {
      return current;
    },

    async getAssistantSiteCredential() {
      return { data: current };
    },

    async setAssistantSiteCredential(patch) {
      current = { ...current, ...patch, isSet: true };
      return { data: current };
    },
  };
}
