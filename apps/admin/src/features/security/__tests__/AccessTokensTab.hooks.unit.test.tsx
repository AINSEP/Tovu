import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMergedSecretsOrder } from "../AccessTokensTab.hooks";
import { accessTokenProviderInfo, otherCredentialStoreInfo } from "../rules";
import type { AccessTokenKind, AccessTokenRow } from "../rules";
import type { AccessTokenAddFormState, AccessTokenExistingRowState, AccessTokenProviderGroupState, AccessTokensController } from "../hooks/use-access-tokens.hooks";
import type { OtherCredentialGroupState, OtherCredentialRowState, OtherCredentialsController } from "../hooks/use-other-credentials.hooks";

/**
 * @file `useMergedSecretsOrder` — the merge step behind the owner's 2026-09-21 round-2 ordering
 * ruling ("one TRUE merged list across every row kind on the page"). Covers what used to be split
 * across three places: this hook's own new merge/sort behavior, plus the per-store visibility check
 * and multi-item explosion that `OtherCredentialsSection.unit.test.tsx` used to drive through the
 * now-deleted `OtherCredentialsSection`/`MaybeOtherCredentialGroup`/`OtherCredentialGroup` wrapper
 * layers (moved here because the logic itself moved here — see that file's own header and this
 * repo's `2026-09-21-tovu-94-secrets-order-2.md` handoff). `sortAccessTokenGroups`'s own comparator
 * rules (category-chip order, alphabetical tiebreak) are `rules.unit.test.ts`'s job, unchanged by
 * this pass — these tests only prove the two tiers are actually fed into that ONE comparator
 * together, not "Tier 2 sorted internally, still appended after all of Tier 1."
 */

function makeAccessTokens(groups: readonly AccessTokenProviderGroupState[] | undefined): AccessTokensController {
  return {
    groups,
    loadError: null,
    query: "",
    setQuery: () => {},
    category: "all",
    setCategory: () => {},
    totalCount: 0,
    matchCount: 0,
    setExistingField: () => {},
    replaceToken: async () => {},
    removeToken: async () => {},
    makeDefault: async () => {},
    openAddForm: () => {},
    closeAddForm: () => {},
    setAddField: () => {},
    createToken: async () => {},
    customAddForm: { name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", saving: false, error: null },
    setCustomAddField: () => {},
    resetCustomAddForm: () => {},
    createCustomCredential: async () => false,
    t: (key: string) => key,
  };
}

function makeOtherCredentials(groups: readonly OtherCredentialGroupState[] | undefined): OtherCredentialsController {
  return {
    groups,
    loadError: null,
    totalCount: 0,
    matchCount: 0,
    setDraftToken: () => {},
    replace: async () => {},
    remove: async () => {},
    t: (key: string) => key,
  };
}

function row(overrides: Partial<AccessTokenRow> = {}): AccessTokenRow {
  return {
    kind: "publish",
    providerId: "netlify",
    id: "row-1",
    name: "Production",
    rawLabel: "Production",
    isDefault: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function rowState(overrides: Partial<AccessTokenExistingRowState> = {}): AccessTokenExistingRowState {
  return { row: row(), name: "Production", token: "", accountId: "", username: "", saving: false, error: null, ...overrides };
}

const BLANK_ADD_FORM: AccessTokenAddFormState = { visible: false, name: "", token: "", accountId: "", username: "", saving: false, error: null };

/** One Tier-1 provider group — `rows` empty means "Not connected". */
function providerGroup(kind: AccessTokenKind, providerId: string, rows: AccessTokenExistingRowState[] = []): AccessTokenProviderGroupState {
  return { info: accessTokenProviderInfo({ kind, providerId }), rows, addForm: BLANK_ADD_FORM };
}

function otherRow(storeId: OtherCredentialGroupState["store"]["id"], overrides: Partial<OtherCredentialRowState> = {}): OtherCredentialRowState {
  const store = otherCredentialStoreInfo(storeId);
  return {
    key: `${store.id}:${overrides.itemId ?? store.id}`,
    store,
    itemId: store.id,
    name: store.label,
    valueFact: "••••abcd",
    updatedAt: null,
    token: "",
    saving: false,
    error: null,
    ...overrides,
  };
}

/** One Tier-2 store group — `rows` empty means "Not configured". */
function otherGroup(storeId: OtherCredentialGroupState["store"]["id"], rows: OtherCredentialRowState[] = []): OtherCredentialGroupState {
  return { store: otherCredentialStoreInfo(storeId), rows };
}

describe("useMergedSecretsOrder — the owner's literal regression case", () => {
  it("ranks a configured external-mcp entry above an unconfigured composio-project placeholder", () => {
    const controller = makeAccessTokens([]);
    const otherController = makeOtherCredentials([
      otherGroup("composio-project"), // Ops, not configured
      otherGroup("external-mcp", [otherRow("external-mcp", { itemId: "higgsfield", name: "Higgsfield" })]), // AI, configured
    ]);
    const { result } = renderHook(() => useMergedSecretsOrder(controller, otherController, ""));

    const labels = result.current.map((e) => e.info.label);
    expect(labels.indexOf("Higgsfield")).toBeLessThan(labels.indexOf("Composio project key"));
  });
});

describe("useMergedSecretsOrder — genuinely cross-tier, not 'Tier 2 always after Tier 1'", () => {
  it("ranks a configured Tier-2 entry above an unconnected Tier-1 provider in an earlier-ranked category", () => {
    // Hosting ranks BEFORE AI in ACCESS_TOKEN_CATEGORIES — category order alone would put Vercel
    // first. Fill state must win regardless: round 1's own bug was Tier 2 never being compared
    // against Tier 1 at all, so this is the case that would fail under "Tier 2 sorted internally,
    // still appended after all of Tier 1" even though it now passes category order too.
    const controller = makeAccessTokens([providerGroup("publish", "vercel")]); // Hosting, not connected
    const otherController = makeOtherCredentials([otherGroup("site-assistant", [otherRow("site-assistant")])]); // AI, configured
    const { result } = renderHook(() => useMergedSecretsOrder(controller, otherController, ""));

    const labels = result.current.map((e) => e.info.label);
    expect(labels.indexOf("Site assistant model key")).toBeLessThan(labels.indexOf("Vercel"));
  });

  it("still ranks a saved Tier-1 token above an unconfigured Tier-2 placeholder (round 1's own baseline, now cross-tier)", () => {
    const controller = makeAccessTokens([providerGroup("publish", "github-pages", [rowState({ row: row({ kind: "publish", providerId: "github-pages" }) })])]);
    const otherController = makeOtherCredentials([otherGroup("admin-byok")]); // not configured
    const { result } = renderHook(() => useMergedSecretsOrder(controller, otherController, ""));

    const labels = result.current.map((e) => e.info.label);
    expect(labels.indexOf("GitHub Pages")).toBeLessThan(labels.indexOf("Admin AI Assistant key (BYOK)"));
  });
});

describe("useMergedSecretsOrder — multi-item store explosion", () => {
  it("explodes a store with 2+ configured items into one entry per item, ranked by its own item name", () => {
    const controller = makeAccessTokens([]);
    const otherController = makeOtherCredentials([
      otherGroup("media-provider", [
        otherRow("media-provider", { itemId: "grok", name: "xAI Grok" }),
        otherRow("media-provider", { itemId: "cloudinary", name: "Cloudinary" }),
      ]),
    ]);
    const { result } = renderHook(() => useMergedSecretsOrder(controller, otherController, ""));

    const labels = result.current.map((e) => e.info.label);
    expect(labels).toContain("Cloudinary");
    expect(labels).toContain("xAI Grok");
    expect(labels).not.toContain("Media provider keys");
    // Alphabetical within the same (saved, media) tier — "Cloudinary" before "xAI Grok".
    expect(labels.indexOf("Cloudinary")).toBeLessThan(labels.indexOf("xAI Grok"));
  });

  it("renders exactly one placeholder entry per otherwise-empty store, never zero and never more than one", () => {
    const controller = makeAccessTokens([]);
    const otherController = makeOtherCredentials([otherGroup("site-assistant"), otherGroup("admin-byok")]);
    const { result } = renderHook(() => useMergedSecretsOrder(controller, otherController, ""));

    expect(result.current).toHaveLength(2);
    expect(result.current.every((e) => e.kind === "other" && e.row === undefined)).toBe(true);
  });
});

describe("useMergedSecretsOrder — visibility (moved from OtherCredentialsSection's own suite)", () => {
  it("hides an empty Tier-2 store whose own label/purpose does not match the query", () => {
    const otherController = makeOtherCredentials([otherGroup("site-assistant")]);
    const { result } = renderHook(() => useMergedSecretsOrder(makeAccessTokens([]), otherController, "zzz-no-match"));
    expect(result.current).toHaveLength(0);
  });

  it("still shows an empty Tier-2 store when the query matches its own label", () => {
    const otherController = makeOtherCredentials([otherGroup("site-assistant")]);
    const { result } = renderHook(() => useMergedSecretsOrder(makeAccessTokens([]), otherController, "site assistant"));
    expect(result.current).toHaveLength(1);
  });

  it("shows a Tier-2 store whose row already matched the query upstream, even if the store's own label does not", () => {
    const otherController = makeOtherCredentials([otherGroup("media-provider", [otherRow("media-provider", { itemId: "cloudinary", name: "Cloudinary" })])]);
    const { result } = renderHook(() => useMergedSecretsOrder(makeAccessTokens([]), otherController, "cloudinary"));
    expect(result.current).toHaveLength(1);
  });

  it("hides an unconnected Tier-1 provider whose own label does not match the query", () => {
    const controller = makeAccessTokens([providerGroup("publish", "netlify")]);
    const { result } = renderHook(() => useMergedSecretsOrder(controller, makeOtherCredentials([]), "zzz-no-match"));
    expect(result.current).toHaveLength(0);
  });
});

describe("useMergedSecretsOrder — search narrows both tiers and keeps the merged result ordered", () => {
  it("returns only the query-matched entries across both tiers, still filled-before-unfilled", () => {
    const controller = makeAccessTokens([
      providerGroup("publish", "netlify"), // not connected, no match for "git"
      providerGroup("source-control", "github", [rowState({ row: row({ kind: "source-control", providerId: "github", id: "gh-1" }) })]), // matches "git"
    ]);
    const otherController = makeOtherCredentials([
      otherGroup("external-mcp", [otherRow("external-mcp", { itemId: "gh-app", name: "GitHub App" })]), // matches "git"
      otherGroup("admin-byok"), // no match for "git"
    ]);
    const { result } = renderHook(() => useMergedSecretsOrder(controller, otherController, "git"));

    // Both matched entries are "filled" (saved-tier), so the tiebreak is category-chip order:
    // source-control (GitHub's own category) ranks before ai (GitHub App's, via external-mcp) —
    // `rules.unit.test.ts`'s own `sortAccessTokenGroups` suite owns proving that rule; this test only
    // proves the QUERY correctly dropped the two non-matching entries (Netlify, admin-byok) from both
    // tiers before the shared comparator ever ran.
    const labels = result.current.map((e) => e.info.label);
    expect(labels).toEqual(["GitHub", "GitHub App"]);
  });
});

describe("useMergedSecretsOrder — still loading", () => {
  it("returns an empty list when either controller's groups is still undefined", () => {
    const { result } = renderHook(() => useMergedSecretsOrder(makeAccessTokens(undefined), makeOtherCredentials(undefined), ""));
    expect(result.current).toEqual([]);
  });
});
