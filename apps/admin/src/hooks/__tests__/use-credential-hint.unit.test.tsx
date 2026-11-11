import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

/** L13 Stryker: the hook had no test — it must pass the operator's locale through to the shared copy. */
const { locale } = vi.hoisted(() => ({ locale: { value: "en" } }));
vi.mock("../use-admin-locale.hooks", () => ({ useAdminLocale: () => locale.value }));

import { useCredentialHint, useStoredCredentialHint } from "../use-credential-hint.hooks";

beforeEach(() => { locale.value = "en"; });

test("formats the server hint in the operator's locale, and is empty without one", () => {
  expect(renderHook(() => useCredentialHint({ hint: { length: 1234, last4: "abcd" } })).result.current).toBe("…abcd, 1,234 chars");
  locale.value = "de";
  const german = renderHook(() => useCredentialHint({ hint: { length: 1234, last4: "abcd" } })).result.current;
  expect(german.startsWith("…abcd, 1.234")).toBe(true);
  expect(renderHook(() => useCredentialHint({ hint: null })).result.current).toBe("");
  expect(renderHook(() => useCredentialHint({})).result.current).toBe("");
});

test("a stored hint is shown only for a set key on this endpoint, falling back to the legacy mask", () => {
  const hint = { length: 40, last4: "wxyz" };
  expect(renderHook(() => useStoredCredentialHint({ stored: { isSet: true, masked: "••••", tokenHint: hint } })).result.current).toBe("…wxyz, 40 chars");
  expect(renderHook(() => useStoredCredentialHint({ stored: { isSet: true, masked: "••••" } })).result.current).toBe("••••");
  expect(renderHook(() => useStoredCredentialHint({ stored: { isSet: true, masked: null } })).result.current).toBeUndefined();
  expect(renderHook(() => useStoredCredentialHint({ stored: { isSet: false, masked: "••••", tokenHint: hint } })).result.current).toBeUndefined();
  expect(renderHook(() => useStoredCredentialHint({ stored: null })).result.current).toBeUndefined();
  expect(renderHook(() => useStoredCredentialHint({ stored: { isSet: true, masked: "••••", tokenHint: hint }, storedKeyIsForOtherEndpoint: true })).result.current).toBeUndefined();
});
