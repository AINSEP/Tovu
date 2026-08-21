import { describe, expect, it, vi } from "vitest";

import type {
  AdminCustomCredentialSummary,
  AdminPublishCredentialSummary,
  AdminSourceControlCredentialSummary,
} from "../../../../lib/api";

/**
 * @file Coverage for `access-tokens-dependencies.hooks.ts` — two independent surfaces:
 *
 * 1. `defaultAccessTokensPort` — 12 thin binds onto `api.*` across `publish`/`sourceControl`/
 *    `custom`. `create`/`update` additionally unwrap the `{ credential }` envelope `api.*` resolves
 *    (`res => res.credential`) — that unwrap is the one piece of real logic here, so every
 *    create/update assertion checks the RETURNED value is the unwrapped summary, not the envelope.
 * 2. `createFakeAccessTokensPort` — the three per-group default-slice helpers this file composes;
 *    covered via each group's unstubbed defaults AND an override winning over them.
 */

const {
  listPublishCredentials,
  createPublishCredential,
  updatePublishCredential,
  deletePublishCredential,
  listSourceControlCredentials,
  createSourceControlCredential,
  updateSourceControlCredential,
  deleteSourceControlCredential,
  listCustomCredentials,
  createCustomCredential,
  updateCustomCredential,
  deleteCustomCredential,
} = vi.hoisted(() => ({
  listPublishCredentials: vi.fn(),
  createPublishCredential: vi.fn(),
  updatePublishCredential: vi.fn(),
  deletePublishCredential: vi.fn(),
  listSourceControlCredentials: vi.fn(),
  createSourceControlCredential: vi.fn(),
  updateSourceControlCredential: vi.fn(),
  deleteSourceControlCredential: vi.fn(),
  listCustomCredentials: vi.fn(),
  createCustomCredential: vi.fn(),
  updateCustomCredential: vi.fn(),
  deleteCustomCredential: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listPublishCredentials,
      createPublishCredential,
      updatePublishCredential,
      deletePublishCredential,
      listSourceControlCredentials,
      createSourceControlCredential,
      updateSourceControlCredential,
      deleteSourceControlCredential,
      listCustomCredentials,
      createCustomCredential,
      updateCustomCredential,
      deleteCustomCredential,
    },
  };
});

const { createFakeAccessTokensPort, defaultAccessTokensPort } = await import("../access-tokens-dependencies.hooks");

function publishCredential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
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

function sourceControlCredential(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
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

function customCredential(overrides: Partial<AdminCustomCredentialSummary> = {}): AdminCustomCredentialSummary {
  return {
    id: "cc-1",
    label: "Internal API",
    category: "general",
    baseUrl: "https://internal.example.com",
    configured: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("defaultAccessTokensPort.publish", () => {
  it("list delegates to api.listPublishCredentials, returning the snapshot unchanged", async () => {
    const snapshot = { credentials: [publishCredential()], executionMode: "self-hosted-cli" as const };
    listPublishCredentials.mockResolvedValue(snapshot);
    await expect(defaultAccessTokensPort.publish.list()).resolves.toEqual(snapshot);
    expect(listPublishCredentials).toHaveBeenCalledWith();
  });

  it("create forwards input to api.createPublishCredential and unwraps the { credential } envelope", async () => {
    const credential = publishCredential({ id: "cred-2", label: "Staging" });
    createPublishCredential.mockResolvedValue({ credential });
    const input = { label: "Staging", connection: { providerId: "github-pages" as const, token: "ghp_x" } };
    await expect(defaultAccessTokensPort.publish.create(input)).resolves.toEqual(credential);
    expect(createPublishCredential).toHaveBeenCalledWith(input);
  });

  it("update forwards id + input to api.updatePublishCredential and unwraps the envelope", async () => {
    const credential = publishCredential({ label: "Renamed" });
    updatePublishCredential.mockResolvedValue({ credential });
    await expect(defaultAccessTokensPort.publish.update("cred-1", { label: "Renamed" })).resolves.toEqual(credential);
    expect(updatePublishCredential).toHaveBeenCalledWith("cred-1", { label: "Renamed" });
  });

  it("remove forwards id to api.deletePublishCredential", async () => {
    deletePublishCredential.mockResolvedValue(undefined);
    await expect(defaultAccessTokensPort.publish.remove("cred-1")).resolves.toBeUndefined();
    expect(deletePublishCredential).toHaveBeenCalledWith("cred-1");
  });
});

describe("defaultAccessTokensPort.sourceControl", () => {
  it("list delegates to api.listSourceControlCredentials, returning the snapshot unchanged", async () => {
    const snapshot = { credentials: [sourceControlCredential()] };
    listSourceControlCredentials.mockResolvedValue(snapshot);
    await expect(defaultAccessTokensPort.sourceControl.list()).resolves.toEqual(snapshot);
    expect(listSourceControlCredentials).toHaveBeenCalledWith();
  });

  it("create forwards input to api.createSourceControlCredential and unwraps the envelope", async () => {
    const credential = sourceControlCredential({ id: "sc-2", label: "Fork account" });
    createSourceControlCredential.mockResolvedValue({ credential });
    const input = { label: "Fork account", connection: { providerId: "github" as const, token: "ghp_y" } };
    await expect(defaultAccessTokensPort.sourceControl.create(input)).resolves.toEqual(credential);
    expect(createSourceControlCredential).toHaveBeenCalledWith(input);
  });

  it("update forwards id + input to api.updateSourceControlCredential and unwraps the envelope", async () => {
    const credential = sourceControlCredential({ label: "Renamed" });
    updateSourceControlCredential.mockResolvedValue({ credential });
    await expect(defaultAccessTokensPort.sourceControl.update("sc-1", { label: "Renamed" })).resolves.toEqual(credential);
    expect(updateSourceControlCredential).toHaveBeenCalledWith("sc-1", { label: "Renamed" });
  });

  it("remove forwards id to api.deleteSourceControlCredential", async () => {
    deleteSourceControlCredential.mockResolvedValue(undefined);
    await expect(defaultAccessTokensPort.sourceControl.remove("sc-1")).resolves.toBeUndefined();
    expect(deleteSourceControlCredential).toHaveBeenCalledWith("sc-1");
  });
});

describe("defaultAccessTokensPort.custom", () => {
  it("list delegates to api.listCustomCredentials, returning the snapshot unchanged", async () => {
    const snapshot = { credentials: [customCredential()] };
    listCustomCredentials.mockResolvedValue(snapshot);
    await expect(defaultAccessTokensPort.custom.list()).resolves.toEqual(snapshot);
    expect(listCustomCredentials).toHaveBeenCalledWith();
  });

  it("create forwards input to api.createCustomCredential and unwraps the envelope", async () => {
    const credential = customCredential({ id: "cc-2", label: "Another API" });
    createCustomCredential.mockResolvedValue({ credential });
    const input = { label: "Another API", category: "ops" as const, baseUrl: "https://ops.example.com", connection: { token: "tok" } };
    await expect(defaultAccessTokensPort.custom.create(input)).resolves.toEqual(credential);
    expect(createCustomCredential).toHaveBeenCalledWith(input);
  });

  it("update forwards id + input to api.updateCustomCredential and unwraps the envelope", async () => {
    const credential = customCredential({ label: "Renamed" });
    updateCustomCredential.mockResolvedValue({ credential });
    await expect(defaultAccessTokensPort.custom.update("cc-1", { label: "Renamed" })).resolves.toEqual(credential);
    expect(updateCustomCredential).toHaveBeenCalledWith("cc-1", { label: "Renamed" });
  });

  it("remove forwards id to api.deleteCustomCredential", async () => {
    deleteCustomCredential.mockResolvedValue(undefined);
    await expect(defaultAccessTokensPort.custom.remove("cc-1")).resolves.toBeUndefined();
    expect(deleteCustomCredential).toHaveBeenCalledWith("cc-1");
  });
});

describe("createFakeAccessTokensPort — defaults", () => {
  it("every list defaults to an empty snapshot, never a fabricated row", async () => {
    const port = createFakeAccessTokensPort();
    await expect(port.publish.list()).resolves.toEqual({ credentials: [], executionMode: "self-hosted-cli" });
    await expect(port.sourceControl.list()).resolves.toEqual({ credentials: [] });
    await expect(port.custom.list()).resolves.toEqual({ credentials: [] });
  });

  it("every unstubbed create/update rejects with a named 'not stubbed for this test' error", async () => {
    const port = createFakeAccessTokensPort();
    await expect(port.publish.create({ label: "x", connection: { providerId: "github-pages", token: "t" } })).rejects.toThrow("publish.create not stubbed for this test");
    await expect(port.publish.update("id", {})).rejects.toThrow("publish.update not stubbed for this test");
    await expect(port.sourceControl.create({ label: "x", connection: { providerId: "github", token: "t" } })).rejects.toThrow("sourceControl.create not stubbed for this test");
    await expect(port.sourceControl.update("id", {})).rejects.toThrow("sourceControl.update not stubbed for this test");
    await expect(port.custom.create({ label: "x", category: "general", baseUrl: "https://x", connection: { token: "t" } })).rejects.toThrow("custom.create not stubbed for this test");
    await expect(port.custom.update("id", {})).rejects.toThrow("custom.update not stubbed for this test");
  });

  it("every unstubbed remove resolves (a safe idempotent default), never throwing", async () => {
    const port = createFakeAccessTokensPort();
    await expect(port.publish.remove("id")).resolves.toBeUndefined();
    await expect(port.sourceControl.remove("id")).resolves.toBeUndefined();
    await expect(port.custom.remove("id")).resolves.toBeUndefined();
  });

  it("an override wins over its group's default for all three groups", async () => {
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "hosted-api-only" }) },
      sourceControl: { list: () => Promise.resolve({ credentials: [sourceControlCredential()] }) },
      custom: { list: () => Promise.resolve({ credentials: [customCredential()] }) },
    });
    await expect(port.publish.list()).resolves.toMatchObject({ executionMode: "hosted-api-only" });
    await expect(port.sourceControl.list()).resolves.toMatchObject({ credentials: [{ id: "sc-1" }] });
    await expect(port.custom.list()).resolves.toMatchObject({ credentials: [{ id: "cc-1" }] });
  });
});
