import { afterEach, expect, it, vi } from "vitest";
import {
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
