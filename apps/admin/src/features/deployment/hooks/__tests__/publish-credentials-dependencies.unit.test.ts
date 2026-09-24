import { describe, expect, it, vi } from "vitest";

import type { AdminPublishCredentialSummary, AdminPublishCredentialVerification } from "@/lib/api";

/**
 * @file Coverage for `publish-credentials-dependencies.hooks.ts` (3/14 funcs) —
 * `defaultPublishCredentialsPort`'s five live `api.*` binds (including the create/update/verify
 * envelope unwraps) and `createFakePublishCredentialsPort`'s five default stubs. Same thin-bind
 * shape as `security/hooks/access-tokens-dependencies.unit.test.ts`'s `publish` block.
 */

const { listPublishCredentials, createPublishCredential, updatePublishCredential, deletePublishCredential, verifyPublishCredential } = vi.hoisted(() => ({
  listPublishCredentials: vi.fn(),
  createPublishCredential: vi.fn(),
  updatePublishCredential: vi.fn(),
  deletePublishCredential: vi.fn(),
  verifyPublishCredential: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, listPublishCredentials, createPublishCredential, updatePublishCredential, deletePublishCredential, verifyPublishCredential },
  };
});

const { createFakePublishCredentialsPort, defaultPublishCredentialsPort } = await import("../publish-credentials-dependencies.hooks");

function credential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
  return {
    id: "cred-1",
    providerId: "github-pages",
    label: "Production",
    configured: true,
    isDefault: true,
    accountLabel: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function verification(overrides: Partial<AdminPublishCredentialVerification> = {}): AdminPublishCredentialVerification {
  return { status: "valid", message: "ok", checkedAt: "2026-08-01T00:00:00.000Z", ...overrides };
}

describe("defaultPublishCredentialsPort", () => {
  it("listCredentials delegates to api.listPublishCredentials, returning the snapshot unchanged", async () => {
    const snapshot = { credentials: [credential()], executionMode: "self-hosted-cli" as const };
    listPublishCredentials.mockResolvedValue(snapshot);
    await expect(defaultPublishCredentialsPort.listCredentials()).resolves.toEqual(snapshot);
    expect(listPublishCredentials).toHaveBeenCalledWith();
  });

  it("createCredential forwards input to api.createPublishCredential and unwraps the { credential } envelope", async () => {
    const c = credential({ id: "cred-2", label: "Staging" });
    createPublishCredential.mockResolvedValue({ credential: c });
    const input = { label: "Staging", connection: { providerId: "github-pages" as const, token: "ghp_x" } };
    await expect(defaultPublishCredentialsPort.createCredential(input)).resolves.toEqual(c);
    expect(createPublishCredential).toHaveBeenCalledWith(input);
  });

  it("createCredential keeps the save-time verification the server returns beside the credential", async () => {
    const c = credential({ id: "cred-2" });
    const verification: AdminPublishCredentialVerification = { status: "invalid", message: "GitHub rejected this token.", checkedAt: "2026-09-24T00:00:00.000Z" };
    createPublishCredential.mockResolvedValue({ credential: c, verification });
    const input = { label: "default", connection: { providerId: "github-pages" as const, token: "ghp_x" } };
    await expect(defaultPublishCredentialsPort.createCredential(input)).resolves.toEqual({ ...c, verification });
  });

  it("updateCredential keeps the save-time verification the server returns beside the credential", async () => {
    const c = credential();
    const verification: AdminPublishCredentialVerification = { status: "valid", message: "Connected as octocat.", checkedAt: "2026-09-24T00:00:00.000Z", accountLabel: "octocat" };
    updatePublishCredential.mockResolvedValue({ credential: c, verification });
    await expect(defaultPublishCredentialsPort.updateCredential("cred-1", { connection: { providerId: "github-pages", token: "t" } })).resolves.toEqual({ ...c, verification });
  });

  it("updateCredential forwards id + input to api.updatePublishCredential and unwraps the envelope", async () => {
    const c = credential({ label: "Renamed" });
    updatePublishCredential.mockResolvedValue({ credential: c });
    await expect(defaultPublishCredentialsPort.updateCredential("cred-1", { label: "Renamed" })).resolves.toEqual(c);
    expect(updatePublishCredential).toHaveBeenCalledWith("cred-1", { label: "Renamed" });
  });

  it("deleteCredential forwards id to api.deletePublishCredential", async () => {
    deletePublishCredential.mockResolvedValue(undefined);
    await expect(defaultPublishCredentialsPort.deleteCredential("cred-1")).resolves.toBeUndefined();
    expect(deletePublishCredential).toHaveBeenCalledWith("cred-1");
  });

  it("verifyCredential forwards id to api.verifyPublishCredential and unwraps the { verification } envelope", async () => {
    const v = verification({ status: "invalid", message: "bad token" });
    verifyPublishCredential.mockResolvedValue({ verification: v });
    await expect(defaultPublishCredentialsPort.verifyCredential("cred-1")).resolves.toEqual(v);
    expect(verifyPublishCredential).toHaveBeenCalledWith("cred-1");
  });
});

describe("createFakePublishCredentialsPort — defaults", () => {
  it("listCredentials defaults to an empty snapshot, never a fabricated row", async () => {
    const port = createFakePublishCredentialsPort();
    await expect(port.listCredentials()).resolves.toEqual({ credentials: [], executionMode: "self-hosted-cli" });
  });

  it("create/update/verify reject with a named 'not stubbed for this test' error", async () => {
    const port = createFakePublishCredentialsPort();
    await expect(port.createCredential({ label: "x", connection: { providerId: "github-pages", token: "t" } })).rejects.toThrow("createCredential not stubbed for this test");
    await expect(port.updateCredential("id", {})).rejects.toThrow("updateCredential not stubbed for this test");
    await expect(port.verifyCredential("id")).rejects.toThrow("verifyCredential not stubbed for this test");
  });

  it("deleteCredential defaults to a safe idempotent resolve, never throwing", async () => {
    const port = createFakePublishCredentialsPort();
    await expect(port.deleteCredential("id")).resolves.toBeUndefined();
  });

  it("an override wins over each default", async () => {
    const port = createFakePublishCredentialsPort({
      listCredentials: () => Promise.resolve({ credentials: [credential()], executionMode: "hosted-api-only" }),
    });
    await expect(port.listCredentials()).resolves.toMatchObject({ executionMode: "hosted-api-only" });
  });
});
