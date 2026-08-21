import { describe, expect, it, vi } from "vitest";

import type { SiteAssistantCredential } from "../../../lib/api";

/**
 * @file Coverage for `visitor-credential-form-dependencies.hooks.ts` (2/6 funcs) —
 * `defaultVisitorCredentialFormPort`'s two live `api.*` binds and
 * `createFakeVisitorCredentialFormPort`'s current getter / get / patch-merge-set. The fake's `set`
 * forces `isSet: true` on every patch (unlike its `ai-assistant-dependencies` sibling, which merges
 * with no forced field) — asserted explicitly below since that is the one piece of real logic here.
 */

const { getAssistantSiteCredential, setAssistantSiteCredential } = vi.hoisted(() => ({
  getAssistantSiteCredential: vi.fn(),
  setAssistantSiteCredential: vi.fn(),
}));

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return { ...actual, api: { ...actual.api, getAssistantSiteCredential, setAssistantSiteCredential } };
});

const { createFakeVisitorCredentialFormPort, defaultVisitorCredentialFormPort } = await import("../hooks/visitor-credential-form-dependencies.hooks");

function credential(overrides: Partial<SiteAssistantCredential> = {}): SiteAssistantCredential {
  return { isSet: false, masked: null, provider: "google", baseUrl: null, model: null, updatedAt: null, ...overrides };
}

describe("defaultVisitorCredentialFormPort", () => {
  it("getAssistantSiteCredential delegates to api.getAssistantSiteCredential, returning its result unchanged", async () => {
    const result = { data: credential({ isSet: true, masked: "••••abcd" }) };
    getAssistantSiteCredential.mockResolvedValue(result);
    await expect(defaultVisitorCredentialFormPort.getAssistantSiteCredential()).resolves.toEqual(result);
    expect(getAssistantSiteCredential).toHaveBeenCalledWith();
  });

  it("setAssistantSiteCredential forwards the patch to api.setAssistantSiteCredential", async () => {
    const result = { data: credential({ isSet: true, masked: "••••wxyz" }) };
    setAssistantSiteCredential.mockResolvedValue(result);
    await expect(defaultVisitorCredentialFormPort.setAssistantSiteCredential({ apiKey: "sk-new" })).resolves.toEqual(result);
    expect(setAssistantSiteCredential).toHaveBeenCalledWith({ apiKey: "sk-new" });
  });
});

describe("createFakeVisitorCredentialFormPort", () => {
  it("defaults to isSet:false/provider:google, and current reflects it", async () => {
    const port = createFakeVisitorCredentialFormPort();
    expect(port.current).toEqual(credential());
    await expect(port.getAssistantSiteCredential()).resolves.toEqual({ data: credential() });
  });

  it("seeds from options.credential when provided", () => {
    const port = createFakeVisitorCredentialFormPort({ credential: credential({ isSet: true, masked: "••••abcd" }) });
    expect(port.current).toEqual(credential({ isSet: true, masked: "••••abcd" }));
  });

  it("setAssistantSiteCredential merges the patch AND forces isSet:true, even for a patch that omits it", async () => {
    const port = createFakeVisitorCredentialFormPort();
    const result = await port.setAssistantSiteCredential({ model: "gpt-5" });
    expect(result).toEqual({ data: credential({ model: "gpt-5", isSet: true }) });
    expect(port.current.isSet).toBe(true);
  });
});
