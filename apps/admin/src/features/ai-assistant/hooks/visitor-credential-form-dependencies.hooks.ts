import { api, type SiteAssistantCredential } from "../../../lib/api";
import type { VisitorCredentialFormPort } from "./visitor-credential-form-port.hooks";

/**
 * @file The only place `use-visitor-credential-form.hooks.ts` reaches `lib/api` — see
 * `visitor-credential-form-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `ai-assistant-dependencies
 *  .hooks.ts`'s `defaultAiAssistantPort`. */
export const defaultVisitorCredentialFormPort: VisitorCredentialFormPort = {
  getAssistantSiteCredential: () => api.getAssistantSiteCredential(),
  setAssistantSiteCredential: (patch) => api.setAssistantSiteCredential(patch),
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
