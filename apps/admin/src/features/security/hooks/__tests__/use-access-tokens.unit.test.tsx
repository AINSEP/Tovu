import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import type { AdminPublishCredentialSummary } from "../../../../lib/api";
import { useAccessTokens } from "../use-access-tokens.hooks";
import { createFakeAccessTokensPort } from "../access-tokens-dependencies.hooks";
import type { AccessTokenExistingRowState, AccessTokenProviderGroupState } from "../use-access-tokens.hooks";

/**
 * @file Regression coverage for two Terra audit findings (2026-08-19, Codex sol bug/architecture
 * audit) in `useAccessTokens`:
 *
 * - HIGH #2: editing a saved token's Token/Account/Username field BEFORE its Name field erased the
 *   displayed Name, because the first partial draft update was seeded from `blankDraft()` (whose
 *   `name` is `""`) instead of the persisted row.
 * - MEDIUM: `removeToken`/`makeDefault` awaited their API calls with no error handling at all, so a
 *   rejected call (network/auth/server failure) produced an unhandled rejection and no visible
 *   change — the user could not tell the operation had failed.
 */

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const T = (key: string): string => key;

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

/** Locates one saved row's controller state across every provider group — `groups` is a flat list
 *  of per-provider buckets, not keyed by row id, so every assertion below has to search it. */
function findRow(groups: readonly AccessTokenProviderGroupState[] | undefined, id: string): AccessTokenExistingRowState | undefined {
  for (const group of groups ?? []) {
    const found = group.rows.find((r) => r.row.id === id);
    if (found) return found;
  }
  return undefined;
}

describe("useAccessTokens: setExistingField", () => {
  it("typing into Token before Name does not clear the saved Name", async () => {
    const port = createFakeAccessTokensPort({
      publish: { list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }) },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(findRow(result.current.groups, "cred-1")?.name).toBe("Production");

    // The first field ever touched on this row is Token, NOT Name — the exact repro sequence.
    act(() => result.current.setExistingField("cred-1", { token: "ghp_new_token_never_saved" }));

    const row = findRow(result.current.groups, "cred-1");
    expect(row?.token).toBe("ghp_new_token_never_saved");
    expect(row?.name).toBe("Production");
  });
});

describe("useAccessTokens: removeToken", () => {
  it("a rejected remove surfaces a visible per-row error instead of failing silently", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () => Promise.resolve({ credentials: [publishCredential()], executionMode: "self-hosted-cli" }),
        remove: () => Promise.reject(new Error("network down")),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    await act(() => result.current.removeToken(target));

    const row = findRow(result.current.groups, "cred-1");
    expect(row).toBeDefined();
    expect(row?.saving).toBe(false);
    expect(row?.error).toBe("Couldn't remove this token: network down");
  });
});

describe("useAccessTokens: makeDefault", () => {
  it("a rejected update surfaces a visible per-row error instead of failing silently", async () => {
    const port = createFakeAccessTokensPort({
      publish: {
        list: () =>
          Promise.resolve({
            credentials: [publishCredential({ isDefault: false }), publishCredential({ id: "cred-2", label: "Staging", isDefault: true })],
            executionMode: "self-hosted-cli",
          }),
        update: () => Promise.reject(new Error("server exploded")),
      },
    });
    const { result } = renderHook(() => useAccessTokens(port, T, "en"), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findRow(result.current.groups, "cred-1")!.row;

    await act(() => result.current.makeDefault(target));

    const row = findRow(result.current.groups, "cred-1");
    expect(row?.saving).toBe(false);
    expect(row?.error).toBe("Couldn't make this token the default: server exploded");
  });
});
