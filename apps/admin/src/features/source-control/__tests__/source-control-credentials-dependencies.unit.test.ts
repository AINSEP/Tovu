import { describe, expect, it, vi } from "vitest";

import type { AdminSourceControlCredentialSummary } from "@/lib/api";

/**
 * @file Coverage for `source-control-credentials-dependencies.hooks.ts` (1/11 funcs) —
 * `defaultSourceControlCredentialsPort`'s four live `api.*` binds (including the create/update
 * `{ credential }` envelope unwrap) and `createFakeSourceControlCredentialsPort`'s four default
 * stubs. Same pattern as `security/hooks/__tests__/access-tokens-dependencies.unit.test.ts`'s
 * `sourceControl` block, which covers the identical shape on the Tier-1 Access Tokens port.
 */

const { listSourceControlCredentials, createSourceControlCredential, updateSourceControlCredential, deleteSourceControlCredential } = vi.hoisted(() => ({
  listSourceControlCredentials: vi.fn(),
  createSourceControlCredential: vi.fn(),
  updateSourceControlCredential: vi.fn(),
  deleteSourceControlCredential: vi.fn(),
}));

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, listSourceControlCredentials, createSourceControlCredential, updateSourceControlCredential, deleteSourceControlCredential },
  };
});

const { createFakeSourceControlCredentialsPort, defaultSourceControlCredentialsPort } = await import("../hooks/source-control-credentials-dependencies.hooks");

function credential(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
  return {
    id: "sc-1",
    providerId: "github",
    label: "Org account",
    configured: true,
    isDefault: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("defaultSourceControlCredentialsPort", () => {
  it("listCredentials delegates to api.listSourceControlCredentials, returning the snapshot unchanged", async () => {
    const snapshot = { credentials: [credential()] };
    listSourceControlCredentials.mockResolvedValue(snapshot);
    await expect(defaultSourceControlCredentialsPort.listCredentials()).resolves.toEqual(snapshot);
    expect(listSourceControlCredentials).toHaveBeenCalledWith();
  });

  it("createCredential forwards input to api.createSourceControlCredential and unwraps the { credential } envelope", async () => {
    const c = credential({ id: "sc-2", label: "Fork account" });
    createSourceControlCredential.mockResolvedValue({ credential: c });
    const input = { label: "Fork account", connection: { providerId: "github" as const, token: "ghp_y" } };
    await expect(defaultSourceControlCredentialsPort.createCredential(input)).resolves.toEqual(c);
    expect(createSourceControlCredential).toHaveBeenCalledWith(input);
  });

  it("updateCredential forwards id + input to api.updateSourceControlCredential and unwraps the envelope", async () => {
    const c = credential({ label: "Renamed" });
    updateSourceControlCredential.mockResolvedValue({ credential: c });
    await expect(defaultSourceControlCredentialsPort.updateCredential("sc-1", { label: "Renamed" })).resolves.toEqual(c);
    expect(updateSourceControlCredential).toHaveBeenCalledWith("sc-1", { label: "Renamed" });
  });

  it("deleteCredential forwards id to api.deleteSourceControlCredential", async () => {
    deleteSourceControlCredential.mockResolvedValue(undefined);
    await expect(defaultSourceControlCredentialsPort.deleteCredential("sc-1")).resolves.toBeUndefined();
    expect(deleteSourceControlCredential).toHaveBeenCalledWith("sc-1");
  });
});

describe("createFakeSourceControlCredentialsPort — defaults", () => {
  it("listCredentials defaults to an empty snapshot, never a fabricated row", async () => {
    const port = createFakeSourceControlCredentialsPort();
    await expect(port.listCredentials()).resolves.toEqual({ credentials: [] });
  });

  it("create/update reject with a named 'not stubbed for this test' error", async () => {
    const port = createFakeSourceControlCredentialsPort();
    await expect(port.createCredential({ label: "x", connection: { providerId: "github", token: "t" } })).rejects.toThrow("createCredential not stubbed for this test");
    await expect(port.updateCredential("id", {})).rejects.toThrow("updateCredential not stubbed for this test");
  });

  it("deleteCredential defaults to a safe idempotent resolve, never throwing", async () => {
    const port = createFakeSourceControlCredentialsPort();
    await expect(port.deleteCredential("id")).resolves.toBeUndefined();
  });

  it("an override wins over each default", async () => {
    const port = createFakeSourceControlCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [credential()] }),
    });
    await expect(port.listCredentials()).resolves.toMatchObject({ credentials: [{ id: "sc-1" }] });
  });
});
