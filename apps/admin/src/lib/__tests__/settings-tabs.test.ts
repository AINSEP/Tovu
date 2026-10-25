import { describe, expect, it, vi } from "vitest";

/**
 * @file Instructions/Notifications/Privacy load+save adapters over `ledger-slice.ts`.
 *
 * `loadNamespaceValues`/`saveChangedEntries` are mocked here (the I/O boundary) but
 * `readString`/`readBoolean`/`readNumber` are the REAL implementations from
 * `ledger-slice.ts` — those are pure and independently covered in
 * `ledger-slice.test.ts`; running the real ones here means these tests exercise the
 * actual value extraction, not a hand-rolled stand-in for it.
 *
 * The load-bearing cases are Privacy's sentinel round-trips: the ledger cannot
 * register a null default for a non-secret definition, so `privacyDecisionAt: null`
 * is stored as `0` and `installationId: null` as `""`. Getting either direction
 * wrong is user-visible — `decisionAt` gates the first-run consent prompt, so a
 * wrong round-trip either re-prompts someone who already decided (sentinel not
 * collapsed back to null) or silently skips the prompt for someone who has not
 * (a real decision incorrectly treated as the sentinel).
 */

const { loadNamespaceValues, saveChangedEntries } = vi.hoisted(() => ({
  loadNamespaceValues: vi.fn(),
  // Typed params (even though unused) so `.mock.calls[n]` is a real 3-tuple
  // below, not `[]` inferred from a zero-arg implementation.
  saveChangedEntries: vi.fn(async (_namespace: string, _scope: string, _candidates: unknown[]) => [] as readonly string[]),
}));

vi.mock("../ledger-slice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ledger-slice")>();
  return { ...actual, loadNamespaceValues, saveChangedEntries };
});

import type { NotificationsPreferences, PrivacyConsentState } from "@jini-ai/ui";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  INSTRUCTIONS_NAMESPACE,
  NOTIFICATIONS_NAMESPACE,
  PRIVACY_NAMESPACE,
  APPEARANCE_NAMESPACE,
  LANGUAGE_NAMESPACE,
  DEFAULT_APPEARANCE,
  DEFAULT_LOCALE,
  DEFAULT_INTERFACE,
  INTERFACE_NAMESPACE,
  loadAppearance,
  loadInterface,
  saveInterface,
  adminThemeAccent,
  withAdminThemeAccent,
  loadInstructions,
  loadLanguage,
  loadNotifications,
  loadPrivacy,
  saveAppearance,
  saveInstructions,
  saveLanguage,
  saveNotifications,
  savePrivacy,
} from "../settings-tabs";

// --- Instructions -----------------------------------------------------------

describe("loadInstructions", () => {
  it("defaults to the empty string when nothing is stored", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    expect(await loadInstructions()).toBe(DEFAULT_INSTRUCTIONS);
  });

  it("returns the stored value", async () => {
    loadNamespaceValues.mockResolvedValue(new Map([["custom", "Always be concise."]]));
    expect(await loadInstructions()).toBe("Always be concise.");
  });

  it("reads from the instructions namespace", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    await loadInstructions();
    expect(loadNamespaceValues).toHaveBeenCalledWith(INSTRUCTIONS_NAMESPACE);
  });
});

describe("saveInstructions", () => {
  it("writes the new value, workspace-scoped, when it changed", async () => {
    await saveInstructions("New instructions", "");
    expect(saveChangedEntries).toHaveBeenCalledWith(INSTRUCTIONS_NAMESPACE, "workspace", [
      { key: "custom", valueJson: "New instructions", changed: true },
    ]);
  });

  it("writes nothing when the value is unchanged", async () => {
    await saveInstructions("same", "same");
    expect(saveChangedEntries).toHaveBeenCalledWith("core.instructions", "workspace", [
      { key: "custom", valueJson: "same", changed: false },
    ]);
  });

  it("collapses an all-empty-textarea `undefined` to the empty string the ledger stores, not undefined", async () => {
    // `InstructionsTab.onChange` reports an all-empty textarea as `undefined` per
    // its documented collapse. A definition can't validate `undefined` as its
    // value, so it must be normalised to '' before it ever reaches the ledger.
    await saveInstructions(undefined, "had some text");
    expect(saveChangedEntries).toHaveBeenCalledWith("core.instructions", "workspace", [
      { key: "custom", valueJson: "", changed: true },
    ]);
  });

  it("treats undefined-from-empty as unchanged when the previous value was already empty", async () => {
    await saveInstructions(undefined, "");
    expect(saveChangedEntries).toHaveBeenCalledWith("core.instructions", "workspace", [
      { key: "custom", valueJson: "", changed: false },
    ]);
  });

  it("returns whatever saveChangedEntries reports as written", async () => {
    saveChangedEntries.mockResolvedValueOnce(["custom"]);
    expect(await saveInstructions("x", "")).toEqual(["custom"]);
  });
});

// --- Notifications ------------------------------------------------------------

describe("loadNotifications", () => {
  it("defaults every field when nothing is stored", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    expect(await loadNotifications()).toEqual(DEFAULT_NOTIFICATIONS);
  });

  it("reads back a fully-stored preference set", async () => {
    loadNamespaceValues.mockResolvedValue(
      new Map<string, unknown>([
        ["soundEnabled", true],
        ["successSoundId", "chime"],
        ["failureSoundId", "buzz"],
        ["desktopEnabled", true],
      ]),
    );
    const prefs = await loadNotifications();
    expect(prefs).toEqual({ soundEnabled: true, successSoundId: "chime", failureSoundId: "buzz", desktopEnabled: true });
  });

  it("falls back field-by-field for a partially-written namespace", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["soundEnabled", true]]));
    const prefs = await loadNotifications();
    expect(prefs.soundEnabled).toBe(true);
    expect(prefs.successSoundId).toBe(DEFAULT_NOTIFICATIONS.successSoundId);
    expect(prefs.failureSoundId).toBe(DEFAULT_NOTIFICATIONS.failureSoundId);
    expect(prefs.desktopEnabled).toBe(DEFAULT_NOTIFICATIONS.desktopEnabled);
  });

  it("falls back on a wrong-typed stored value instead of passing it through", async () => {
    // Confirms settings-tabs hands raw ledger values straight to the typed
    // readers rather than pre-massaging them — a wrong type must still fall back.
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["soundEnabled", "true"]]));
    const prefs = await loadNotifications();
    expect(prefs.soundEnabled).toBe(false);
  });

  it("reads from the notifications namespace", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    await loadNotifications();
    expect(loadNamespaceValues).toHaveBeenCalledWith(NOTIFICATIONS_NAMESPACE);
  });
});

describe("saveNotifications", () => {
  it("writes only the fields that changed, USER-scoped (not workspace)", async () => {
    const previous: NotificationsPreferences = DEFAULT_NOTIFICATIONS;
    const next: NotificationsPreferences = { ...previous, desktopEnabled: true };
    await saveNotifications(next, previous);

    expect(saveChangedEntries).toHaveBeenCalledWith("core.notifications", "user", [
      { key: "soundEnabled", valueJson: previous.soundEnabled, changed: false },
      { key: "successSoundId", valueJson: previous.successSoundId, changed: false },
      { key: "failureSoundId", valueJson: previous.failureSoundId, changed: false },
      { key: "desktopEnabled", valueJson: true, changed: true },
    ]);
  });

  it("marks every field changed when every field differs", async () => {
    // Deliberately not DEFAULT_NOTIFICATIONS' own success/failure sound ids
    // (ding/buzz) — a "next" that happens to equal the default for one field
    // would silently pass a weaker version of this test.
    const previous: NotificationsPreferences = DEFAULT_NOTIFICATIONS;
    const next: NotificationsPreferences = {
      soundEnabled: true,
      successSoundId: "chime",
      failureSoundId: "thud",
      desktopEnabled: true,
    };
    await saveNotifications(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
    expect(candidates.map((c) => c.key)).toEqual(["soundEnabled", "successSoundId", "failureSoundId", "desktopEnabled"]);
    expect(candidates.every((c) => c.changed)).toBe(true);
  });
});

// --- Privacy — the sentinel round-trips ---------------------------------------

describe("loadPrivacy — sentinel collapse", () => {
  it("defaults to null/null/false/false when nothing is stored", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    expect(await loadPrivacy()).toEqual(DEFAULT_PRIVACY);
  });

  it("collapses the decisionAt sentinel (0) back to null", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["decisionAt", 0]]));
    const state = await loadPrivacy();
    expect(state.privacyDecisionAt).toBeNull();
  });

  it("does NOT collapse a real decision timestamp — the exact case that gates the first-run prompt", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["decisionAt", 1_700_000_000_000]]));
    const state = await loadPrivacy();
    expect(state.privacyDecisionAt).toBe(1_700_000_000_000);
  });

  it("does not collapse a small non-zero decision timestamp either — only exactly 0 is the sentinel", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["decisionAt", 1]]));
    const state = await loadPrivacy();
    expect(state.privacyDecisionAt).toBe(1);
  });

  it("collapses the installationId sentinel ('') back to null", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["installationId", ""]]));
    const state = await loadPrivacy();
    expect(state.installationId).toBeNull();
  });

  it("does NOT collapse a real installation id", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["installationId", "install-abc-123"]]));
    const state = await loadPrivacy();
    expect(state.installationId).toBe("install-abc-123");
  });

  it("reads telemetry booleans independently of the sentinel fields", async () => {
    loadNamespaceValues.mockResolvedValue(
      new Map<string, unknown>([
        ["telemetry.metrics", true],
        ["telemetry.content", false],
      ]),
    );
    const state = await loadPrivacy();
    expect(state.telemetry).toEqual({ metrics: true, content: false });
  });

  it("reads from the privacy namespace", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    await loadPrivacy();
    expect(loadNamespaceValues).toHaveBeenCalledWith(PRIVACY_NAMESPACE);
  });
});

describe("savePrivacy — sentinel round-trip on write", () => {
  it("persists a new installationId without replacing it with the empty sentinel", async () => {
    await savePrivacy({ ...DEFAULT_PRIVACY, installationId: "install-new-456" }, DEFAULT_PRIVACY);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; valueJson: unknown; changed: boolean }>;
    expect(candidates.find((c) => c.key === "installationId")).toEqual({ key: "installationId", valueJson: "install-new-456", changed: true });
  });

  it("writes nothing when both sides are the 'no decision yet' null, workspace-scoped", async () => {
    await savePrivacy(DEFAULT_PRIVACY, DEFAULT_PRIVACY);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
    expect(candidates.map((c) => c.key)).toEqual(["telemetry.metrics", "telemetry.content", "installationId", "decisionAt"]);
    expect(candidates.every((c) => !c.changed)).toBe(true);
    expect(saveChangedEntries).toHaveBeenCalledWith("core.privacy", "workspace", expect.anything());
  });

  it("persists a freshly-made decision as the real timestamp, not the sentinel", async () => {
    const previous = DEFAULT_PRIVACY;
    const next: PrivacyConsentState = { ...previous, privacyDecisionAt: 1_700_000_000_000 };
    await savePrivacy(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{
      key: string;
      valueJson: unknown;
      changed: boolean;
    }>;
    const decisionCandidate = candidates.find((c) => c.key === "decisionAt");
    expect(decisionCandidate).toEqual({ key: "decisionAt", valueJson: 1_700_000_000_000, changed: true });
  });

  it("writes the sentinel (0) back to the ledger when a decision is cleared to null", async () => {
    const previous: PrivacyConsentState = { ...DEFAULT_PRIVACY, privacyDecisionAt: 1_700_000_000_000 };
    const next: PrivacyConsentState = { ...previous, privacyDecisionAt: null };
    await savePrivacy(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{
      key: string;
      valueJson: unknown;
      changed: boolean;
    }>;
    const decisionCandidate = candidates.find((c) => c.key === "decisionAt");
    expect(decisionCandidate).toEqual({ key: "decisionAt", valueJson: 0, changed: true });
  });

  it("persists a real installationId, and writes the sentinel ('') when it is cleared to null", async () => {
    const previous: PrivacyConsentState = { ...DEFAULT_PRIVACY, installationId: "install-abc" };
    const next: PrivacyConsentState = { ...previous, installationId: null };
    await savePrivacy(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{
      key: string;
      valueJson: unknown;
      changed: boolean;
    }>;
    const idCandidate = candidates.find((c) => c.key === "installationId");
    expect(idCandidate).toEqual({ key: "installationId", valueJson: "", changed: true });
  });

  it("coerces an undefined telemetry field to false on write (decline-all clears an optional field)", async () => {
    const previous: PrivacyConsentState = { ...DEFAULT_PRIVACY, telemetry: { metrics: true, content: true } };
    const next: PrivacyConsentState = { ...previous, telemetry: {} };
    await savePrivacy(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{
      key: string;
      valueJson: unknown;
      changed: boolean;
    }>;
    const metrics = candidates.find((c) => c.key === "telemetry.metrics");
    const content = candidates.find((c) => c.key === "telemetry.content");
    expect(metrics).toEqual({ key: "telemetry.metrics", valueJson: false, changed: true });
    expect(content).toEqual({ key: "telemetry.content", valueJson: false, changed: true });
  });

  it("coerces an undefined telemetry field to false on the PREVIOUS side too (not just next)", async () => {
    // The `?? false` fallback is applied to both `next` and `previous` independently — a
    // previous state with untouched (undefined, not false) telemetry fields must still
    // diff correctly against an explicit `true`, rather than `undefined !== true` producing
    // a technically-true-but-coincidental "changed" via a different mechanism.
    const previous: PrivacyConsentState = { ...DEFAULT_PRIVACY, telemetry: {} };
    const next: PrivacyConsentState = { ...previous, telemetry: { metrics: true, content: true } };
    await savePrivacy(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{
      key: string;
      valueJson: unknown;
      changed: boolean;
    }>;
    const metrics = candidates.find((c) => c.key === "telemetry.metrics");
    const content = candidates.find((c) => c.key === "telemetry.content");
    expect(metrics).toEqual({ key: "telemetry.metrics", valueJson: true, changed: true });
    expect(content).toEqual({ key: "telemetry.content", valueJson: true, changed: true });
  });

  it("treats undefined and explicit false as equal on both sides — no spurious write", async () => {
    // Pins the fallback actually COLLAPSES both sides to the same value rather than merely
    // being present on one side — an implementation that only defaulted `next` (not
    // `previous`) would see `false !== undefined` and wrongly report `changed: true` here.
    const previous: PrivacyConsentState = { ...DEFAULT_PRIVACY, telemetry: {} };
    const next: PrivacyConsentState = { ...previous, telemetry: { metrics: false, content: false } };
    await savePrivacy(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
    const metrics = candidates.find((c) => c.key === "telemetry.metrics");
    const content = candidates.find((c) => c.key === "telemetry.content");
    expect(metrics?.changed).toBe(false);
    expect(content?.changed).toBe(false);
  });

  it("does not falsely mark decisionAt changed when a real timestamp is unchanged across saves", async () => {
    const state: PrivacyConsentState = { ...DEFAULT_PRIVACY, privacyDecisionAt: 1_700_000_000_000 };
    await savePrivacy(state, state);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
    const decisionCandidate = candidates.find((c) => c.key === "decisionAt");
    expect(decisionCandidate?.changed).toBe(false);
  });
});

// --- Appearance -------------------------------------------------------------

describe("loadAppearance", () => {
  it("migrates a legacy accent as Classic's without applying it to Glass", async () => {
    loadNamespaceValues.mockResolvedValue(new Map([["accentColor", "#d97706"]]));
    const appearance = await loadAppearance();
    expect(adminThemeAccent({ appearance, themeId: "classic" })).toBe("#d97706");
    expect(adminThemeAccent({ appearance, themeId: "glass" })).toBeUndefined();
  });

  it("round-trips accents in separate fields while legacy readers still receive a color string", async () => {
    const previous = { ...DEFAULT_APPEARANCE, accentColor: "#d97706" };
    const glass = withAdminThemeAccent({ appearance: previous, themeId: "glass", accentColor: "#123456" });
    const next = withAdminThemeAccent({ appearance: glass, themeId: "classic", accentColor: "#abcdef" });
    expect(previous).toEqual({ theme: "light", accentColor: "#d97706" });
    expect(glass.accentColors).toEqual({ glass: "#123456" });
    await saveAppearance(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)![2] as Array<{ key: string; valueJson: unknown; changed: boolean }>;
    const accent = candidates.find((candidate) => candidate.key === "accentColor")!;
    expect(accent.changed).toBe(true);
    expect(accent.valueJson).toBe("#abcdef");
    const themeAccents = candidates.find((candidate) => candidate.key === "adminThemeAccents")!;
    expect(themeAccents).toEqual({ key: "adminThemeAccents", valueJson: { glass: "#123456" }, changed: true });
    loadNamespaceValues.mockResolvedValue(new Map(candidates.map(({ key, valueJson }) => [key, valueJson])));
    const loaded = await loadAppearance();
    expect(adminThemeAccent({ appearance: loaded, themeId: "classic" })).toBe("#abcdef");
    expect(adminThemeAccent({ appearance: loaded, themeId: "glass" })).toBe("#123456");
    expect(loaded.accentColor).toBe("#abcdef");
    await saveAppearance(loaded, loaded);
    expect((saveChangedEntries.mock.calls.at(-1)![2] as Array<{ changed: boolean }>).every((candidate) => !candidate.changed)).toBe(true);
  });

  it("preserves unknown theme choices and rejects malformed map entries", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["accentColor", "#d97706"], ["adminThemeAccents", { classic: "#000000", glass: 12, removed: "#AaBbCc", invalid: "red" }]]));
    const loaded = await loadAppearance();
    expect(loaded.accentColors).toEqual({ removed: "#AaBbCc" });
    expect(adminThemeAccent({ appearance: loaded, themeId: "classic" })).toBe("#d97706");
    expect(adminThemeAccent({ appearance: loaded, themeId: "glass" })).toBeUndefined();
    const next = withAdminThemeAccent({ appearance: loaded, themeId: "glass", accentColor: "#2563eb" });
    expect(next.accentColors?.removed).toBe("#AaBbCc");
    // Blue is an explicit Glass choice; only Classic treats the old default as unchosen.
    expect(adminThemeAccent({ appearance: next, themeId: "glass" })).toBe("#2563eb");
    expect(adminThemeAccent({ appearance: DEFAULT_APPEARANCE, themeId: "classic" })).toBeUndefined();
  });

  it.each([{ stored: "{broken" }, { stored: null }, { stored: [] }, { stored: 42 }, { stored: {} }])("ignores an invalid or empty admin-theme map ($stored)", async ({ stored }) => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["adminThemeAccents", stored]]));
    expect(await loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it.each(["classic", "glass"])("default clears only %s's override across save and reload", async (themeId) => {
    const previous = { ...DEFAULT_APPEARANCE, accentColor: "#d97706", accentColors: { glass: "#123456", removed: "#abcdef" } };
    const next = withAdminThemeAccent({ appearance: previous, themeId, accentColor: undefined });
    await saveAppearance(next, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)![2] as Array<{ key: string; valueJson: unknown }>;
    loadNamespaceValues.mockResolvedValue(new Map(candidates.map(({ key, valueJson }) => [key, valueJson])));
    const loaded = await loadAppearance();
    expect(adminThemeAccent({ appearance: loaded, themeId })).toBeUndefined();
    expect(adminThemeAccent({ appearance: loaded, themeId: themeId === "classic" ? "glass" : "classic" })).toBe(themeId === "classic" ? "#123456" : "#d97706");
    expect(loaded.accentColors?.removed).toBe("#abcdef");
    expect(previous.accentColors.glass).toBe("#123456");
    expect(previous.accentColor).toBe("#d97706");
  });
  it("defaults when nothing is stored", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    expect(await loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("returns stored theme and accent", async () => {
    loadNamespaceValues.mockResolvedValue(
      new Map<string, unknown>([
        ["theme", "dark"],
        ["accentColor", "#ff0000"],
      ]),
    );
    expect(await loadAppearance()).toEqual({ theme: "dark", accentColor: "#ff0000" });
  });

  it("accepts every legal theme", async () => {
    for (const theme of ["system", "light", "dark"] as const) {
      loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["theme", theme]]));
      expect((await loadAppearance()).theme).toBe(theme);
    }
  });

  it("falls back for an unrecognised stored theme", async () => {
    // Must not reach the tab as a value its radio group cannot select.
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["theme", "solarized"]]));
    expect((await loadAppearance()).theme).toBe(DEFAULT_APPEARANCE.theme);
  });

  it("falls back for a wrong-typed theme", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["theme", 42]]));
    expect((await loadAppearance()).theme).toBe(DEFAULT_APPEARANCE.theme);
  });

  it("passes an arbitrary accent through — the picker allows any #rrggbb", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["accentColor", "#0f0f0f"]]));
    expect((await loadAppearance()).accentColor).toBe("#0f0f0f");
  });

  it("reads the appearance namespace", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    await loadAppearance();
    expect(loadNamespaceValues).toHaveBeenCalledWith(APPEARANCE_NAMESPACE);
    expect(loadNamespaceValues).toHaveBeenLastCalledWith("core.appearance");
  });
});

describe("saveAppearance", () => {
  it("preserves the admin-theme map when an existing scalar-only caller saves", async () => {
    const previous = { ...DEFAULT_APPEARANCE, accentColors: { glass: "#123456" } };
    await saveAppearance({ ...DEFAULT_APPEARANCE, accentColor: "#abcdef" }, previous);
    const candidates = saveChangedEntries.mock.calls.at(-1)![2] as Array<{ key: string; valueJson: unknown; changed: boolean }>;
    expect(candidates.find(({ key }) => key === "adminThemeAccents")).toEqual({
      key: "adminThemeAccents", valueJson: { glass: "#123456" }, changed: false,
    });
    loadNamespaceValues.mockResolvedValue(new Map(candidates.map(({ key, valueJson }) => [key, valueJson])));
    const loaded = await loadAppearance();
    expect(adminThemeAccent({ appearance: loaded, themeId: "classic" })).toBe("#abcdef");
    expect(adminThemeAccent({ appearance: loaded, themeId: "glass" })).toBe("#123456");
  });

  it("writes only what changed", async () => {
    await saveAppearance({ theme: "dark", accentColor: "#111111" }, { theme: "system", accentColor: "#111111" });
    const [namespace, scope, candidates] = saveChangedEntries.mock.calls.at(-1) as [
      string,
      string,
      Array<{ key: string; changed: boolean }>,
    ];
    expect(namespace).toBe(APPEARANCE_NAMESPACE);
    expect(namespace).toBe("core.appearance");
    // Per-operator, like Notifications — one admin's theme is not the workspace's.
    expect(scope).toBe("user");
    expect(candidates.find((c) => c.key === "theme")?.changed).toBe(true);
    expect(candidates).toEqual([
      { key: "theme", valueJson: "dark", changed: true },
      { key: "accentColor", valueJson: "#111111", changed: false },
      { key: "adminThemeAccents", valueJson: {}, changed: false },
    ]);
    expect(candidates.find((c) => c.key === "accentColor")?.changed).toBe(false);
  });

  it("marks nothing changed for an identical save", async () => {
    await saveAppearance(DEFAULT_APPEARANCE, DEFAULT_APPEARANCE);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ changed: boolean }>;
    expect(candidates.every((c) => !c.changed)).toBe(true);
  });

  it("detects an accent-only change", async () => {
    await saveAppearance({ theme: "light", accentColor: "#abcdef" }, { theme: "light", accentColor: "#111111" });
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
    expect(candidates.find((c) => c.key === "accentColor")?.changed).toBe(true);
    expect(candidates).toEqual([
      { key: "theme", valueJson: "light", changed: false },
      { key: "accentColor", valueJson: "#abcdef", changed: true },
      { key: "adminThemeAccents", valueJson: {}, changed: false },
    ]);
    expect(candidates.find((c) => c.key === "theme")?.changed).toBe(false);
  });
});

// --- Language ---------------------------------------------------------------

describe("loadLanguage", () => {
  it("defaults when nothing is stored", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    expect(await loadLanguage()).toBe(DEFAULT_LOCALE);
  });

  it("returns the stored locale", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["locale", "fr"]]));
    expect(await loadLanguage()).toBe("fr");
  });

  it("returns an unknown stored code as-is rather than rejecting it", async () => {
    // Tovu has no locale catalog yet; an unrecognised code simply selects
    // nothing in the tab, which is better than failing the read.
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["locale", "xx-YZ"]]));
    expect(await loadLanguage()).toBe("xx-YZ");
  });

  it("falls back for a wrong-typed value", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["locale", 7]]));
    expect(await loadLanguage()).toBe(DEFAULT_LOCALE);
  });

  it("reads the language namespace", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    await loadLanguage();
    expect(loadNamespaceValues).toHaveBeenCalledWith(LANGUAGE_NAMESPACE);
    expect(loadNamespaceValues).toHaveBeenLastCalledWith("core.language");
  });
});

describe("saveLanguage", () => {
  it("writes a changed locale at user scope", async () => {
    await saveLanguage("fr", "en");
    const [namespace, scope, candidates] = saveChangedEntries.mock.calls.at(-1) as [
      string,
      string,
      Array<{ key: string; valueJson: unknown; changed: boolean }>,
    ];
    expect(namespace).toBe(LANGUAGE_NAMESPACE);
    expect(namespace).toBe("core.language");
    expect(scope).toBe("user");
    expect(candidates[0]).toMatchObject({ key: "locale", valueJson: "fr", changed: true });
  });

  it("marks nothing changed for an identical save", async () => {
    await saveLanguage("en", "en");
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ changed: boolean }>;
    expect(candidates[0]?.changed).toBe(false);
  });
});

// --- Interface -----------------------------------------------------------------

describe("loadInterface", () => {
  it("defaults every field (the owner-approved behaviour) when nothing is stored, reading the interface namespace", async () => {
    loadNamespaceValues.mockResolvedValue(new Map());
    expect(await loadInterface()).toEqual({ hideChatFabWhileOpen: true, wrapTabs: false, adminTheme: "classic" });
    expect(loadNamespaceValues).toHaveBeenCalledWith(INTERFACE_NAMESPACE);
  });

  it("reads stored values back, falling back field-by-field on a wrong-typed value", async () => {
    loadNamespaceValues.mockResolvedValue(new Map<string, unknown>([["hideChatFabWhileOpen", false], ["wrapTabs", "yes"], ["adminTheme", "glass"]]));
    expect(await loadInterface()).toEqual({ hideChatFabWhileOpen: false, wrapTabs: DEFAULT_INTERFACE.wrapTabs, adminTheme: "glass" });
  });
});

describe("saveInterface", () => {
  it("writes only the changed fields, USER-scoped, and returns what was written", async () => {
    saveChangedEntries.mockResolvedValueOnce(["wrapTabs"]);
    const written = await saveInterface({ ...DEFAULT_INTERFACE, wrapTabs: true }, DEFAULT_INTERFACE);
    expect(written).toEqual(["wrapTabs"]);
    expect(saveChangedEntries).toHaveBeenLastCalledWith("core.interface", "user", [
      { key: "hideChatFabWhileOpen", valueJson: true, changed: false },
      { key: "wrapTabs", valueJson: true, changed: true },
      { key: "adminTheme", valueJson: "classic", changed: false },
    ]);
  });

  it("marks every field changed when every field differs", async () => {
    await saveInterface({ hideChatFabWhileOpen: false, wrapTabs: true, adminTheme: "glass" }, DEFAULT_INTERFACE);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
    expect(candidates.every((c) => c.changed)).toBe(true);
  });
});

// L13 Stryker: telemetry-off-by-default and the "unchanged ⇒ changed:false" flags survived.
describe("L13 mutation gaps — privacy defaults and unchanged flags", () => {
  it("telemetry is OFF by default and no installation or decision is assumed", () => {
    expect(DEFAULT_PRIVACY).toEqual({ telemetry: { metrics: false, content: false }, installationId: null, privacyDecisionAt: null });
  });
  it("the interface defaults keep the phone tab strip one row and the chat FAB hidden while open", () => {
    expect(DEFAULT_INTERFACE).toEqual({ hideChatFabWhileOpen: true, wrapTabs: false, adminTheme: "classic" });
    expect(DEFAULT_APPEARANCE).toEqual({ theme: "light", accentColor: "#2563eb" });
  });
  it("saving identical notification preferences marks no field changed, with desktop on or off", async () => {
    for (const desktopEnabled of [true, false]) {
      const prefs: NotificationsPreferences = { ...DEFAULT_NOTIFICATIONS, desktopEnabled };
      await saveNotifications(prefs, { ...prefs });
      const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ changed: boolean }>;
      expect(candidates.map(c => c.changed)).toEqual([false, false, false, false]);
    }
  });
  it("saving an identical interface marks no field changed; flipping wrapTabs alone marks only it", async () => {
    for (const wrapTabs of [true, false]) {
      const config = { ...DEFAULT_INTERFACE, wrapTabs };
      await saveInterface(config, { ...config });
      expect(saveChangedEntries.mock.calls.at(-1)).toEqual(["core.interface", "user", [
        { key: "hideChatFabWhileOpen", valueJson: true, changed: false },
        { key: "wrapTabs", valueJson: wrapTabs, changed: false },
        { key: "adminTheme", valueJson: "classic", changed: false },
      ]]);
    }
    await saveInterface({ ...DEFAULT_INTERFACE, wrapTabs: true }, DEFAULT_INTERFACE);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
    expect(candidates.filter(c => c.changed).map(c => c.key)).toEqual(["wrapTabs"]);
  });
});
