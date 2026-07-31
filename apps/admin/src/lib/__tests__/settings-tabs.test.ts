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
  loadAppearance,
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
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ changed: boolean }>;
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
  it("writes nothing when both sides are the 'no decision yet' null, workspace-scoped", async () => {
    await savePrivacy(DEFAULT_PRIVACY, DEFAULT_PRIVACY);
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ key: string; changed: boolean }>;
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
  });
});

describe("saveAppearance", () => {
  it("writes only what changed", async () => {
    await saveAppearance({ theme: "dark", accentColor: "#111111" }, { theme: "system", accentColor: "#111111" });
    const [namespace, scope, candidates] = saveChangedEntries.mock.calls.at(-1) as [
      string,
      string,
      Array<{ key: string; changed: boolean }>,
    ];
    expect(namespace).toBe(APPEARANCE_NAMESPACE);
    // Per-operator, like Notifications — one admin's theme is not the workspace's.
    expect(scope).toBe("user");
    expect(candidates.find((c) => c.key === "theme")?.changed).toBe(true);
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
    expect(scope).toBe("user");
    expect(candidates[0]).toMatchObject({ key: "locale", valueJson: "fr", changed: true });
  });

  it("marks nothing changed for an identical save", async () => {
    await saveLanguage("en", "en");
    const candidates = saveChangedEntries.mock.calls.at(-1)?.[2] as Array<{ changed: boolean }>;
    expect(candidates[0]?.changed).toBe(false);
  });
});
