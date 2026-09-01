import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccessTokensTab } from "../AccessTokensTab";
import { accessTokenProviderInfo } from "../rules";
import type { AccessTokensController, AccessTokenExistingRowState, AccessTokenProviderGroupState } from "../hooks/use-access-tokens.hooks";
import type { OtherCredentialsController } from "../hooks/use-other-credentials.hooks";

/**
 * @file Regression coverage for the owner-reported bug: the remove-token dialog told an operator to
 * "Revoke it on GitHub Pages" while the very next link pointed at `github.com/settings/tokens`.
 * `github-pages` is the DESTINATION this credential publishes to (`rules.ts`'s `label` field, e.g.
 * "GitHub Pages" the product); it is not a security console and has no revoke page of its own — the
 * actual company an operator authenticates to, and the only place a token can be revoked, is GitHub
 * (`tokenPageUrl`'s own host). `label` and the new `vendorLabel` are deliberately two different
 * fields on `AccessTokenProviderInfo` (`rules.ts`) precisely so revoke/provenance copy can name the
 * vendor while every other row/group affordance keeps naming the destination unchanged — see this
 * test's second assertion, which pins the destination-facing group heading to prove that copy was
 * NOT touched by this fix.
 *
 * `cloudflare-pages` has the identical shape (vendor "Cloudflare" vs. destination "Cloudflare
 * Pages") but only `github-pages` is asserted here — one representative case is enough to prove the
 * `vendorLabel` seam works; `rules.ts`'s own `PROVIDER_VENDOR_LABEL_OVERRIDES` table is the place a
 * second case would be reviewed, not a second copy of this test.
 */

/** One connected `github-pages` row — the `RemoveConfirmDialog` this test asserts on is only
 *  rendered once a provider group has at least one saved row (`TokenRow`'s own gate). */
function githubPagesRow(): AccessTokenExistingRowState {
  return {
    row: {
      kind: "publish",
      providerId: "github-pages",
      id: "row-1",
      name: "Production",
      rawLabel: "Production",
      isDefault: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    name: "Production",
    token: "",
    accountId: "",
    username: "",
    saving: false,
    error: null,
  };
}

function makeAccessTokens(overrides: Partial<AccessTokensController> = {}): AccessTokensController {
  const group: AccessTokenProviderGroupState = {
    info: accessTokenProviderInfo({ kind: "publish", providerId: "github-pages" }),
    rows: [githubPagesRow()],
    addForm: { visible: false, name: "", token: "", accountId: "", username: "", saving: false, error: null },
  };
  return {
    groups: [group],
    loadError: null,
    query: "",
    setQuery: () => {},
    category: "all",
    setCategory: () => {},
    totalCount: 1,
    matchCount: 1,
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
    ...overrides,
  };
}

function makeOtherCredentials(overrides: Partial<OtherCredentialsController> = {}): OtherCredentialsController {
  return {
    groups: [],
    loadError: null,
    totalCount: 0,
    matchCount: 0,
    setDraftToken: () => {},
    replace: async () => {},
    remove: async () => {},
    t: (key: string) => key,
    ...overrides,
  };
}

describe("AccessTokensTab remove-token dialog — vendor vs destination copy", () => {
  it("names GitHub (the vendor) as where to revoke a GitHub Pages token, not GitHub Pages (the destination)", () => {
    // A native `<dialog>` without an `open` attribute is accessibility-hidden (that's how
    // `RemoveConfirmDialog` stays invisible pre-`showModal()`), so `getByRole`/`getByText` cannot see
    // inside it even though the markup is present — this is why the assertions below query
    // `container` directly rather than through `screen`'s accessibility-tree-filtered queries.
    const { container } = render(<AccessTokensTab useAccessTokensHook={() => makeAccessTokens()} useOtherCredentialsHook={() => makeOtherCredentials()} />);

    // The revoke link's own text must read "GitHub", never "GitHub Pages" — GitHub Pages has no
    // revoke console. Exact-match the whole link text rather than a substring: "GitHub" is itself a
    // substring of "GitHub Pages", so a substring check would pass on the unfixed bug too. Scoped to
    // `dialog` because `ExistingTokenFields`' own "Create a token" link shares the same
    // `tokenPageUrl` href and would otherwise be the first match.
    const revokeLink = container.querySelector('dialog a[href="https://github.com/settings/tokens"]');
    expect(revokeLink).not.toBeNull();
    expect(revokeLink!.textContent?.replace(/\s+/g, " ").trim()).toBe("Revoke it on GitHub ↗");

    // The dialog body's own "does NOT revoke ... on {vendor}" clause must name GitHub too.
    expect(container.textContent).toMatch(/It does NOT revoke the token on GitHub —/);

    // Destination-facing copy is explicitly out of scope and must be unchanged: the provider
    // group's own heading still names the PRODUCT, "GitHub Pages" — proving this fix did not
    // collapse the two fields into one.
    const heading = container.querySelector('.access-tokens-provider-heading span[translate="no"]');
    expect(heading?.textContent).toBe("GitHub Pages");
  });
});
