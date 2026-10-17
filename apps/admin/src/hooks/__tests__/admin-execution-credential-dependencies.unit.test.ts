import { afterEach, expect, it, vi } from "vitest";
import {
  createFakeAdminExecutionCredentialPort,
  defaultAdminExecutionCredentialPort,
  UNSET_ADMIN_EXECUTION_CREDENTIAL,
} from "../admin-execution-credential-dependencies.hooks";

afterEach(() => vi.unstubAllGlobals());

it("the live credential port reads and saves through the authenticated API", async () => {
  const saved = { ...UNSET_ADMIN_EXECUTION_CREDENTIAL, isSet: true, masked: "••••tail" };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/assistant/execution-credential");
    expect(init.credentials).toBe("same-origin");
    if (init.method === "GET") return new Response(JSON.stringify({ data: UNSET_ADMIN_EXECUTION_CREDENTIAL }));
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ apiKey: "test-key-tail" });
    return new Response(JSON.stringify({ data: saved }));
  });
  vi.stubGlobal("fetch", fetch);
  await expect(defaultAdminExecutionCredentialPort.loadAdminExecutionCredential()).resolves.toEqual(UNSET_ADMIN_EXECUTION_CREDENTIAL);
  await expect(defaultAdminExecutionCredentialPort.saveAdminExecutionCredential({ apiKey: "test-key-tail" })).resolves.toEqual(saved);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("a fake save override becomes the current view and the next loaded view", async () => {
  const overridden = { ...UNSET_ADMIN_EXECUTION_CREDENTIAL, isSet: true, masked: "custom-mask" };
  const port = createFakeAdminExecutionCredentialPort({ onSave: () => overridden });
  await expect(port.saveAdminExecutionCredential({ apiKey: "typed" })).resolves.toEqual(overridden);
  expect(port.current).toEqual(overridden);
  await expect(port.loadAdminExecutionCredential()).resolves.toEqual(overridden);
  expect(port.saveCalls).toEqual([{ apiKey: "typed" }]);
});

it("an undefined save override falls through to the normal merge", async () => {
  const port = createFakeAdminExecutionCredentialPort({ onSave: () => undefined });
  await port.saveAdminExecutionCredential({ apiKey: "typed-tail", protocol: "openai", providerId: "openai",
    baseUrl: "https://api.example.test", model: "model-a", maxTokens: 123 });
  await expect(port.loadAdminExecutionCredential()).resolves.toEqual({ isSet: true, masked: "••••tail",
    protocol: "openai", providerId: "openai", baseUrl: "https://api.example.test", model: "model-a",
    maxTokens: 123, updatedAt: "1970-01-01T00:00:00.000Z" });
});

it("omitted fields preserve the stored view while explicit nullable and empty values are merged", async () => {
  const stored = { ...UNSET_ADMIN_EXECUTION_CREDENTIAL, isSet: true, masked: "••••kept", protocol: "openai",
    providerId: "openai", baseUrl: "https://api.example.test", model: "model-a", maxTokens: 123 };
  const port = createFakeAdminExecutionCredentialPort({ stored });
  await port.saveAdminExecutionCredential({});
  await expect(port.loadAdminExecutionCredential()).resolves.toEqual({ ...stored, updatedAt: "1970-01-01T00:00:00.000Z" });
  await port.saveAdminExecutionCredential({ providerId: null, baseUrl: "", model: "", maxTokens: 0 });
  await expect(port.loadAdminExecutionCredential()).resolves.toEqual({ ...stored, providerId: null,
    baseUrl: "", model: "", maxTokens: 0, updatedAt: "1970-01-01T00:00:00.000Z" });
});
