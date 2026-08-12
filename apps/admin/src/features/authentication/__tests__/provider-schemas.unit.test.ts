import { describe, expect, it } from "vitest";

import { AUTHENTICATION_PROVIDER_SCHEMAS } from "../model/provider-schemas";

/**
 * @file Provider credential metadata for the Authentication screen. These assertions keep the
 * operator-facing controls provider-specific without implying a server-side OAuth implementation.
 */

describe("Authentication provider credential schemas", () => {
  it("covers exactly the providers already exposed by the Authentication screen", () => {
    expect(AUTHENTICATION_PROVIDER_SCHEMAS.map((provider) => provider.id)).toEqual([
      "google",
      "facebook",
      "linkedin",
    ]);
  });

  it.each([
    ["google", ["Client ID", "Client secret"]],
    ["facebook", ["App ID", "App secret"]],
    ["linkedin", ["Client ID", "Client secret"]],
  ] as const)("declares the proper required credential fields for %s", (providerId, expectedLabels) => {
    const provider = AUTHENTICATION_PROVIDER_SCHEMAS.find((candidate) => candidate.id === providerId);

    expect(provider).toBeDefined();
    expect(provider?.fields.map((field) => field.label)).toEqual(expectedLabels);
    expect(provider?.fields.every((field) => field.required)).toBe(true);
    expect(provider?.fields.at(-1)?.kind).toBe("password");
  });
});
