import { describe, expect, it } from "vitest";
import { Icon as UiIcon, useT as useUiT, SETTINGS_DIALOG_DICTIONARIES, DEFAULT_NOTIFICATIONS_PREFERENCES } from "@jini-ai/ui";
import { UNREACHABLE_RETRY_DELAYS_MS, LOCAL_BACKUP_PRINCIPAL_ID } from "@jini-ai/ui/panel-kit";
import { useT as useChatT } from "@jini-ai/chat/react";
import { Icon, useAdminKitValues } from "@jini-ai/admin/react/kit";
import { render, renderHook } from "@/__tests__/render-with-jini-kits";
import { adminKit } from "../jini-kits";
import { useHostAdminLocale } from "@/hooks/admin-locale-dependencies.hooks";

/** The host half of A-K2-0a: Tovu supplies the kit's `Icon`, UI translator and plain values. These pin
 *  WHICH implementations it supplies, since `satisfies AdminKit` only checks their shapes. */
describe("Tovu's admin kit: Icon, UI translator and values", () => {
  it("supplies ui's own Icon, and the kit facade renders it", () => {
    expect(adminKit.components.Icon).toBe(UiIcon);
    const { container } = render(<Icon name="settings" aria-label="Settings glyph" />);
    expect(container.querySelector('svg[aria-label="Settings glyph"]')).not.toBeNull();
  });

  it("supplies the UI translator, never chat's", () => {
    expect(adminKit.hooks.useT).toBe(useUiT);
    expect(adminKit.hooks.useT).not.toBe(useChatT);
  });

  it("passes ui's values through by identity, never copies", () => {
    expect(adminKit.values.SETTINGS_DIALOG_DICTIONARIES).toBe(SETTINGS_DIALOG_DICTIONARIES);
    expect(adminKit.values.DEFAULT_NOTIFICATIONS_PREFERENCES).toBe(DEFAULT_NOTIFICATIONS_PREFERENCES);
    expect(adminKit.values.UNREACHABLE_RETRY_DELAYS_MS).toBe(UNREACHABLE_RETRY_DELAYS_MS);
    expect(adminKit.values.LOCAL_BACKUP_PRINCIPAL_ID).toBe(LOCAL_BACKUP_PRINCIPAL_ID);
    const { result } = renderHook(() => useAdminKitValues());
    expect(result.current).toBe(adminKit.values);
  });
});

describe("Tovu's admin kit: the one host locale hook (P12 #6.T, F6.3)", () => {
  it("the kit slot holds the same function App's required useAdminLocaleHook prop receives", () => {
    // main.tsx passes useHostAdminLocale to <App>; a second binding here could disagree on scope or key.
    expect(adminKit.hooks.useAdminLocale).toBe(useHostAdminLocale);
  });
});
