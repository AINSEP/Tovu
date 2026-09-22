import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFakeMediaProvidersPort,
  createFakeSkillsPort,
  createFakeSourceConfigDependencies,
  type ByokConfig,
  type ExecutionConfig,
  type SourceConfigItem,
} from "@jini-ai/ui";

import { SettingsUi } from "../SettingsUi";
import type { SettingsUiController } from "../hooks/use-settings-ui.hooks";
import type { SettingsSlice } from "@/hooks/use-settings-slice.hooks";
import { createFakeAdminExecutionCredentialPort } from "@/hooks/admin-execution-credential-dependencies.hooks";
import {
  useAdminExecutionCredential,
  type AdminExecutionCredentialController,
} from "@/hooks/use-admin-execution-credential.hooks";
import type { AdminExecutionCredential } from "@/lib/api";
import { createExecutionPort, DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import {
  GOOGLE,
  GOOGLE_ADMIN_KEY,
  OPENAI,
  apiKeyField,
  createServerPinnedProbes,
  formOn,
  presetFor,
  settle,
} from "@/lib/__tests__/stored-credential-endpoint.test-helpers";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_LOCALE,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
} from "@/lib/settings-tabs";

/**
 * @file `SettingsUi` — the Open Design settings-dialog port, driven entirely through the
 * `useSettingsUiHook` dependency-injection seam (same convention `PostsProps.usePostsHook` uses)
 * so no real ledger round trip is needed to exercise the 13-tab shell.
 *
 * Primary target: the `InstructionsTab` onChange landmine (`SettingsUi.tsx`'s
 * `onChange={(next) => s.instructions.onChange(next ?? DEFAULT_INSTRUCTIONS)}`). It was briefly
 * miscopied to `next ?? ""` during the extraction and fixed, and nothing guarded it before this
 * pass. `InstructionsTab` (`@jini-ai/ui`) reports an all-empty textarea as `undefined`, never `''`
 * — clearing the field is therefore the only way to observe the fallback at all, and asserting
 * against the *imported* `DEFAULT_INSTRUCTIONS` constant (not a hardcoded `""` literal) is what
 * actually pins the fallback source, not just its current value.
 */

function makeSlice<T>(value: T): SettingsSlice<T> {
  return {
    value,
    loadError: null,
    saveState: { status: "idle" },
    onChange: vi.fn(),
    refresh: vi.fn(),
  };
}

function baseController(overrides: Partial<SettingsUiController> = {}): SettingsUiController {
  return {
    memoryTopTab: "memories",
    setMemoryTopTab: vi.fn(),

    port: createExecutionPort(),
    mediaProvidersPort: createFakeMediaProvidersPort(),
    skillsPort: createFakeSkillsPort({ skills: [] }),
    // The real controller talks to `/mcp-servers`; these tests are about tab chrome, so the fake
    // port stands in. `ExternalMcpSettingsPanel` computes its own field specs from `dependencies`'
    // live draft now (`rules.ts`'s `buildExternalMcpFieldSpecs`) rather than taking a static list, so
    // there is no `fieldSpecs` member left on this controller to fake.
    externalMcp: {
      dependencies: createFakeSourceConfigDependencies<SourceConfigItem>({
        createSource: (input) => ({ id: input.fields.id?.trim() || "mcp-test", fields: input.fields }),
      }),
      restartRequired: false,
    },

    // Unconfigured, which is what the Connectors tab shows on a fresh install: the grid renders
    // gated behind `ConnectorGate`. Not a `makeSlice` — this one is not ledger-backed.
    composio: {
      config: { configured: false, apiKeyTail: "" },
      unlocked: false,
      loadError: null,
      saveState: "idle",
      saveError: null,
      catalogRefreshKey: 0,
      save: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    },

    execution: makeSlice(DEFAULT_EXECUTION_CONFIG),
    instructions: makeSlice(DEFAULT_INSTRUCTIONS),
    notifications: makeSlice(DEFAULT_NOTIFICATIONS),
    privacy: makeSlice(DEFAULT_PRIVACY),
    appearance: makeSlice(DEFAULT_APPEARANCE),
    language: makeSlice(DEFAULT_LOCALE),

    loading: false,
    loadError: null,
    save: { status: "idle" },
    ...overrides,
  } as SettingsUiController;
}

/** A fake `AdminExecutionCredentialController` for the `useAdminExecutionCredentialHook` seam below
 *  — the real hook's own `AdminExecutionCredentialController` shape, filled in with values a live
 *  network round trip cannot produce synchronously (a non-null `legacyKey`), so a passing assertion
 *  actually proves the injected fake rendered rather than the real hook happening to agree with it. */
function fakeAdminExecutionCredentialController(
  overrides: Partial<AdminExecutionCredentialController> = {},
): AdminExecutionCredentialController {
  return {
    stored: null,
    apiKeyStoredExternally: false,
    apiKeyPlaceholder: undefined,
    storedKeyIsForOtherEndpoint: false,
    canDiscoverModels: true,
    saveState: { status: "idle" },
    settingsSaveState: { status: "idle" },
    canSaveKey: false,
    saveKey: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
    legacyKey: null,
    migrateLegacyKey: vi.fn(async () => {}),
    dismissLegacyPrompt: vi.fn(),
    ...overrides,
  };
}

/** Switches the inline shell to the named tab via its sidebar nav button — only the active tab's
 *  panel is mounted (`SettingsDialogShell` renders `activeTab?.panel` alone), so every scenario
 *  below outside the default "Execution mode" tab has to navigate first. */
async function goToTab(user: ReturnType<typeof userEvent.setup>, tabId: string) {
  await user.click(screen.getByTestId(`settings-dialog-nav-${tabId}`));
}

afterEach(() => {
  // `handleTabChange` drives real `history.replaceState` via `lib/router`'s `navigate()` — reset
  // between tests so one test's tab click can't leak a `?tab=` into the next (same convention
  // `FormsList.unit.test.tsx` uses for its own `navigate()`-driven Edit test).
  window.history.replaceState(null, "", "/");
});

describe("loading and error states", () => {
  it("shows a loading placeholder while any slice is still settling", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ loading: true })} />);
    expect(screen.getByText("Loading settings…")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-dialog-nav-execution")).not.toBeInTheDocument();
  });

  it("shows the first load error as a banner once loaded, without blocking the rest of the page", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ loadError: "namespace fetch failed" })} />);
    expect(
      screen.getByText('Could not load saved settings (namespace fetch failed). Showing defaults — edits will still save.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId("settings-dialog-nav-execution")).toBeInTheDocument();
  });
});

describe("settings-dialog translation: two dictionary sources", () => {
  /**
   * `t()` now merges three lookup tiers (see `SettingsUi.tsx`'s own doc comment): `@jini-ai/ui`'s
   * `SETTINGS_DIALOG_DICTIONARIES` for the OD-generic keys, `@jini-ai/cms`'s
   * `SETTINGS_DIALOG_DICTIONARIES` for the 24 relocated chrome keys (tab labels like
   * "Instructions"), and Tovu's own `settings-capabilities-i18n.ts` (via `tCap`) for the 8
   * capability-fact notes. This pins that a non-English locale actually resolves real translations
   * from BOTH of the relocated sources, not just from whichever dictionary still lives in
   * `@jini-ai/ui` — a real regression risk the relocation introduces that pure typechecking can't
   * catch.
   */
  it("renders a Category B tab label (from @jini-ai/cms) translated when locale is es", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ language: makeSlice("es") })} />);
    expect(within(screen.getByTestId("settings-dialog-nav-instructions")).getByText("Instrucciones")).toBeInTheDocument();
  });

  it("renders a Category A capability note (from Tovu's own dictionary) translated when locale is es", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController({ language: makeSlice("es") })} />);
    await goToTab(user, "about");
    expect(
      screen.getByText(
        "Tovu es un CMS de servidor — las versiones nuevas se publican con un despliegue, no con un actualizador dentro de la app.",
      ),
    ).toBeInTheDocument();
  });

  /** The embedded `@jini-ai/ui` `MemorySettingsPanel` translates through its own `useT()`; neither
   *  settings-dialog dictionary carries its keys, so it rendered English in every locale until the
   *  nested `I18nProvider` fed by `settings-memory-i18n.ts`. */
  it("renders the embedded Memory panel translated when locale is de", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController({ language: makeSlice("de") })} />);
    await goToTab(user, "memory");
    expect(screen.getByText("Noch keine gespeicherten Erinnerungen")).toBeInTheDocument();
    expect(
      screen.getByText("Gespeicherte Fakten, Vorlieben und Projektkontext, die künftigen Chats zur Verfügung stehen."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No saved memories yet")).not.toBeInTheDocument();
  });

  it("keeps the embedded Memory panel English when locale is en", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController({ language: makeSlice("en") })} />);
    await goToTab(user, "memory");
    expect(screen.getByText("No saved memories yet")).toBeInTheDocument();
  });
});

describe("InstructionsTab onChange landmine", () => {
  it("clearing the textarea entirely falls back to the imported DEFAULT_INSTRUCTIONS, not a hardcoded empty string", async () => {
    const user = userEvent.setup();
    const controller = baseController({ instructions: makeSlice("some existing instructions") });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "instructions");
    const textarea = screen.getByLabelText("Custom instructions");
    await user.clear(textarea);

    expect(controller.instructions.onChange).toHaveBeenCalledWith(DEFAULT_INSTRUCTIONS);
  });

  it("typing real text calls onChange with that text verbatim — the fallback only fires on an all-empty field", async () => {
    const user = userEvent.setup();
    const controller = baseController({ instructions: makeSlice("") });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "instructions");
    const textarea = screen.getByLabelText("Custom instructions");
    await user.type(textarea, "x");

    expect(controller.instructions.onChange).toHaveBeenLastCalledWith("x");
  });
});

describe("Notifications patch merge", () => {
  it("merges NotificationsTab's onChange patch onto the current value rather than replacing it wholesale", async () => {
    const user = userEvent.setup();
    const controller = baseController({
      notifications: makeSlice<typeof DEFAULT_NOTIFICATIONS>({ ...DEFAULT_NOTIFICATIONS, soundEnabled: false }),
    });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "notifications");
    await user.click(screen.getByRole("button", { name: "Completion sound" }));

    expect(controller.notifications.onChange).toHaveBeenCalledWith({
      ...DEFAULT_NOTIFICATIONS,
      soundEnabled: true,
    });
  });
});

describe("Appearance (dialog theme) onChange merge", () => {
  it("merges AppearanceTab's theme selection onto the current value", async () => {
    const user = userEvent.setup();
    const controller = baseController({ appearance: makeSlice(DEFAULT_APPEARANCE) });
    render(<SettingsUi useSettingsUiHook={() => controller} />);

    await goToTab(user, "appearance");
    const group = screen.getByRole("group", { name: "Appearance" });
    await user.click(within(group).getByRole("button", { name: /dark/i }));

    expect(controller.appearance.onChange).toHaveBeenCalledWith({ ...DEFAULT_APPEARANCE, theme: "dark" });
  });
});

describe("Settings page theme is pinned to light (owner decision, 2026-09-06)", () => {
  // The wrapper's `data-theme` is a literal `"light"` no matter what `core.appearance.theme`
  // holds — see `SettingsUi.tsx`'s comment above its `return`. Against the previous behaviour
  // (`resolveDialogDataTheme`: `"dark"` → `data-theme="dark"`, `"system"` → no attribute) the
  // `dark` and `system` rows fail, which is the point: this is what pins that the page cannot
  // render dark, not a restatement of the default. The stored value still round-trips (the
  // onChange test above), so this is not a claim that the control stopped saving.
  it.each(["light", "dark", "system"] as const)('renders data-theme="light" when the stored theme is %j', (theme) => {
    const controller = baseController({ appearance: makeSlice({ ...DEFAULT_APPEARANCE, theme }) });
    const { container } = render(<SettingsUi useSettingsUiHook={() => controller} />);

    const wrapper = container.querySelector(".settings-ui-section");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("data-theme", "light");
  });
});

describe("Privacy tab — inert by design (no Tovu telemetry backend)", () => {
  it("renders the reference note and makes the control genuinely inert", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    await goToTab(user, "privacy");

    expect(
      screen.getByText(/this installation has no outbound telemetry pipeline/i),
    ).toBeInTheDocument();
    const wrap = document.querySelector(".settings-ui-inert-control");
    expect(wrap).toHaveAttribute("inert");
  });
});

describe("useAdminExecutionCredentialHook injection", () => {
  it("renders the migration prompt from the injected fake, not from a real credential round trip", () => {
    render(
      <SettingsUi
        useSettingsUiHook={() => baseController()}
        useAdminExecutionCredentialHook={() =>
          fakeAdminExecutionCredentialController({ legacyKey: "sk-legacy-from-fake" })
        }
      />,
    );
    // `AdminByokMigrationPrompt` renders only when `controller.legacyKey` is non-null — the real
    // hook can't settle a network GET synchronously within `render()`, so this text appearing at
    // all proves the fake controller is what fed the Execution tab, not the real wired hook.
    expect(screen.getByText(/We found a saved key in this browser/)).toBeInTheDocument();
  });
});

/**
 * The Settings mount of the owner's 2026-09-13 repro (`owner-screenshots-2026-09-13/29-*.png`): the cases
 * `AdminExecutionMode.unit.test.tsx` runs through AI Assistant's mount, here through the REAL
 * `ExecutionTab`, the REAL credential hook over its in-memory port, and a probe port that refuses the way
 * the server's endpoint pin does.
 */
describe("Execution tab — a Google key saved, the form moved to another provider", () => {
  const OTHER_PROVIDER_COPY = "Your saved key is for a different provider. Paste a key for this one.";

  /** Renders over a LIVE execution slice, so a chip click or a pasted key re-renders the form. Returns the
   *  probe port. */
  function renderSettingsWithKeySaved(
    byok: ByokConfig,
    { stored = GOOGLE_ADMIN_KEY, locale = DEFAULT_LOCALE }: { stored?: AdminExecutionCredential; locale?: string } = {},
  ) {
    const credentialPort = createFakeAdminExecutionCredentialPort({ stored });
    const probes = createServerPinnedProbes(stored);
    function useLiveSettingsUi(): SettingsUiController {
      const [execution, setExecution] = useState<ExecutionConfig>({ ...DEFAULT_EXECUTION_CONFIG, mode: "byok", byok });
      return baseController({
        port: probes,
        execution: { ...makeSlice(execution), onChange: setExecution },
        language: makeSlice(locale),
      });
    }
    render(
      <SettingsUi
        useSettingsUiHook={useLiveSettingsUi}
        useAdminExecutionCredentialHook={(input) => useAdminExecutionCredential(input, credentialPort)}
      />,
    );
    return probes;
  }

  /** Mounts on Google, lets Google's own (legitimate) discovery settle, then forgets it. */
  async function mountOnGoogleThenForgetItsDiscovery(options?: { locale?: string }) {
    const probes = renderSettingsWithKeySaved(formOn(GOOGLE, "gemini-flash-latest"), options);
    expect(await screen.findByPlaceholderText("••••mw4w")).toBeInTheDocument();
    await settle();
    probes.listModels.mockClear();
    return probes;
  }

  it("switching from Google to OpenAI with nothing typed sends no model discovery and shows no refusal", async () => {
    const user = userEvent.setup();
    const probes = await mountOnGoogleThenForgetItsDiscovery();

    await user.click(screen.getByRole("tab", { name: presetFor(OPENAI).title }));
    await settle();

    expect(screen.getByText(OTHER_PROVIDER_COPY)).toBeInTheDocument();
    expect(probes.listModels).not.toHaveBeenCalled();
    expect(screen.queryByText(/Could not load live models/)).not.toBeInTheDocument();
  });

  it("then pasting a key sends exactly one model discovery, carrying that key to OpenAI", async () => {
    const user = userEvent.setup();
    const probes = await mountOnGoogleThenForgetItsDiscovery();

    await user.click(screen.getByRole("tab", { name: presetFor(OPENAI).title }));
    await user.click(apiKeyField());
    await user.paste("sk-openai-typed");
    await settle();

    expect(probes.listModels).toHaveBeenCalledTimes(1);
    expect(probes.listModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-openai-typed", baseUrl: OPENAI }));
  });

  it("words a refused discovery with the plain-language copy, not the server's API-caller text", async () => {
    renderSettingsWithKeySaved(formOn(GOOGLE, "gemini-flash-latest"), { stored: { ...GOOGLE_ADMIN_KEY, baseUrl: null } });

    expect(
      await screen.findByText(/Could not load live models: Your saved key has no provider saved with it\. Paste the key again to test it\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/save a base URL for the credential first/)).not.toBeInTheDocument();
  });

  it("in Spanish, the key line asks for the new provider's key in Spanish", async () => {
    const user = userEvent.setup();
    await mountOnGoogleThenForgetItsDiscovery({ locale: "es" });

    await user.click(screen.getByRole("tab", { name: presetFor(OPENAI).title }));

    expect(screen.getByText("Tu clave guardada es de otro proveedor. Pega una clave para este.")).toBeInTheDocument();
    expect(screen.queryByText(OTHER_PROVIDER_COPY)).not.toBeInTheDocument();
  });

  it("in Spanish, a refused discovery is worded in Spanish", async () => {
    renderSettingsWithKeySaved(formOn(GOOGLE, "gemini-flash-latest"), {
      stored: { ...GOOGLE_ADMIN_KEY, baseUrl: null },
      locale: "es",
    });

    expect(
      await screen.findByText(
        /No se pudieron cargar los modelos en vivo: Tu clave guardada no tiene un proveedor guardado\. Pega la clave de nuevo para probarla\./,
      ),
    ).toBeInTheDocument();
  });
});

describe("save status pill", () => {
  it("renders the merged saving state with role=status", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController({ save: { status: "saving" } })} />);
    const pill = document.querySelector(".settings-ui-save");
    expect(pill).toHaveTextContent("Saving…");
    expect(pill).toHaveAttribute("role", "status");
  });

  it("renders the merged error state with role=alert and the error's own message", () => {
    render(
      <SettingsUi useSettingsUiHook={() => baseController({ save: { status: "error", message: "save failed" } })} />,
    );
    const pill = document.querySelector(".settings-ui-save");
    expect(pill).toHaveTextContent("save failed");
    expect(pill).toHaveAttribute("role", "alert");
  });
});

describe("no modal-overlay affordance", () => {
  // The "Open as dialog" button and the second, modal `SettingsDialogShell` render it opened
  // used to live here — removed 2026-09-19 (owner's call: the overlay was never wanted, only
  // the inline page is). This replaces the old "Open as dialog" describe block's three tests,
  // which asserted the button existed and opened a modal; it now asserts neither exists.
  it("renders only the inline shell — no 'Open as dialog' button and no modal backdrop", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    expect(screen.queryByRole("button", { name: "Open as dialog" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-dialog-backdrop")).not.toBeInTheDocument();
    // Exactly one shell mounted (the inline page) — this was 2 (inline + modal) whenever the
    // removed modal was open.
    expect(screen.getAllByTestId("settings-dialog-nav-execution").length).toBe(1);
  });
});

describe("?tab= deep linking", () => {
  it("opens directly on the tab named by the tabId prop", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController()} tabId="privacy" />);

    expect(
      screen.getByText(/this installation has no outbound telemetry pipeline/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Custom instructions")).not.toBeInTheDocument();
  });

  it("falls back to the default tab for an id that names no real tab, instead of blanking the panel", () => {
    // The regression this guards: `URLSearchParams.get` also returns `null` for a missing `?tab=`,
    // and `SettingsDialogShell`'s controlled/uncontrolled switch is `activeTabId !== undefined` —
    // passing an unrecognized id straight through would render a controlled-but-matchless tab and
    // show no panel at all, not the first tab.
    render(<SettingsUi useSettingsUiHook={() => baseController()} tabId="not-a-real-tab" />);

    expect(screen.getByRole("tablist", { name: "Execution mode" })).toBeInTheDocument();
  });

  it("defaults to the first tab when no tabId is supplied at all", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    expect(screen.getByRole("tablist", { name: "Execution mode" })).toBeInTheDocument();
  });

  it("switching tabs writes the new id into the URL's ?tab= so the shown tab is always the linkable one", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);

    await goToTab(user, "privacy");

    expect(window.location.search).toBe("?tab=privacy");
  });

  it("publishes the inline tab nav as agent-clickable, matching the ?tab= id, so an agent already on this page can reach a specific tab via page.find_elements/page.click", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    const privacyNav = screen.getByTestId("settings-dialog-nav-privacy");
    expect(privacyNav).toHaveAttribute("data-agent-element", "tab-privacy");
    expect(privacyNav).toHaveAttribute("data-agent-label", "Privacy");
  });
});

describe("About tab", () => {
  it("shows the Tovu Admin version, no updater surface", async () => {
    const user = userEvent.setup();
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    await goToTab(user, "about");

    expect(screen.getByText(/^Tovu Admin /)).toBeInTheDocument();
    // "no updater surface" means no update-status/check control — the panel's own hint prose
    // mentioning "updater" in passing (deployments, not an in-app updater) is not itself a surface.
    expect(screen.queryByRole("button", { name: /update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /update/i })).not.toBeInTheDocument();
  });
});

describe("Workspace tab (SPEC-044's OQ-04, folded in 2026-09-10)", () => {
  it("publishes the tab as agent-clickable, labelled 'Workspace'", () => {
    render(<SettingsUi useSettingsUiHook={() => baseController()} />);
    const workspaceNav = screen.getByTestId("settings-dialog-nav-workspace");
    expect(workspaceNav).toHaveAttribute("data-agent-element", "tab-workspace");
    expect(workspaceNav).toHaveAttribute("data-agent-label", "Workspace");
  });

  it("mounts the real Workspace screen verbatim, not a placeholder", async () => {
    // Deliberately does not mock `Workspace.tsx`'s own `useWiredWorkspace()` — this tab has no seam
    // for that in `SettingsUiController` (see `SettingsUi.tsx`'s own comment on the tab: Workspace
    // is self-contained and reads nothing from `s`). Instead, `fetch` itself is stubbed to a
    // promise that never settles, so `Workspace.tsx`'s own "Loading workspace…" render (its state
    // before the real fetch resolves) is deterministic here rather than racing jsdom's real
    // network-failure timing — an earlier version of this test asserted the same text without the
    // stub and was flaky for exactly that reason (jsdom's fetch rejection can land before or after
    // `userEvent.click`'s own microtask flush). `Workspace.unit.test.tsx` already covers the loaded/
    // error/save states directly via its own `useWorkspaceHook` DI seam; this test only needs to
    // prove the REAL component mounted, not a placeholder.
    const originalFetch = global.fetch;
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;
    try {
      const user = userEvent.setup();
      render(<SettingsUi useSettingsUiHook={() => baseController()} />);
      await goToTab(user, "workspace");

      expect(screen.getByText("Loading workspace…")).toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("shows the 'Workspace' heading and its identity subtitle exactly once each, not doubled", async () => {
    // Regression guard for the doubled-heading defect flagged after this tab's first pass: mounting
    // `<Workspace />` verbatim gave the tab both the shell's own chrome header AND `Workspace.tsx`'s
    // own `.page-header` underneath it, each saying "Workspace" and the same identity sentence.
    // `showPageHeader={false}` (`SettingsUi.tsx`'s mount, `WorkspaceProps.showPageHeader`) is what
    // this test pins — unlike the test above, this one lets the fetch actually resolve so the
    // assertion runs against `Workspace.tsx`'s real LOADED render branch, the one branch the
    // page-header used to appear in.
    const originalFetch = global.fetch;
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            workspace: { id: "w1", name: "My Site", slug: "my-site", createdAt: "2026-08-01T00:00:00.000Z" },
          }),
          { status: 200 },
        ),
      ),
    ) as typeof fetch;
    try {
      const user = userEvent.setup();
      render(<SettingsUi useSettingsUiHook={() => baseController()} />);
      await goToTab(user, "workspace");

      // Waits for the loaded branch — `findByLabelText` retries until `Workspace.tsx`'s fetch
      // resolves and the rename form actually renders.
      expect(await screen.findByLabelText("Name")).toHaveValue("My Site");

      // The shell's own chrome header — the only "Workspace" heading left.
      expect(screen.getByRole("heading", { level: 2, name: "Workspace" })).toBeInTheDocument();
      // `Workspace.tsx`'s own `<h1>`/kicker/description are gone, not merely hidden.
      expect(screen.queryByRole("heading", { level: 1, name: "Workspace" })).not.toBeInTheDocument();
      expect(screen.queryByText("Administration")).not.toBeInTheDocument();
      expect(
        screen.getAllByText("This site's identity — its name, URL slug, and creation date."),
      ).toHaveLength(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
