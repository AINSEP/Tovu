// @vitest-environment jsdom
import { render as renderWithoutProvider, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { FetchQueryProvider } from "../../lib/fetch-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "../../App";
import type { UseAdminSession } from "../../App.hooks";

/**
 * @file Owner decision, 2026-09-21 (option A): Jini's shared `ConfirmDialog` hard-codes its Cancel
 * button to the English literal "Cancel", with no way to receive Tovu's language — every dialog
 * built on it (~22 call sites across the admin) stayed English in all 20 non-English locales. `App`
 * now wraps its tree in `@jini-ai/admin/react`'s `ConfirmDialogDefaultsProvider`, set once with
 * `tApp(navLocale, "Cancel")`, so every current and future `ConfirmDialog` picks up the translated
 * label without passing `cancelLabel` at each call site.
 *
 * Proven here through the REAL integration point rather than a synthetic
 * `<ConfirmDialogDefaultsProvider>` wrapper: `App`'s own logout confirm (`LogoutConfirmDialog`,
 * covered in full by `app-logout-confirm.unit.test.tsx`) is the nearest `ConfirmDialog` mount to
 * the provider, so if this one picks up the translated label, so does every sibling deeper in the
 * tree. Same fake-`useSession`/`fetch`/`EventSource` harness as that file — see its own header for
 * why each stub exists. `fetchMock` here additionally special-cases the `core.language` settings
 * namespace so `useWiredAdminLocale()` resolves to a non-English locale instead of degrading to the
 * `DEFAULT_LOCALE` ("en") every other call in that harness relies on.
 */

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

/** JSON body for `api.getSettingsEffective({ namespace: "core.language" })` — the shape
 *  `loadNamespaceValues` (`lib/ledger-slice.ts`) reads via `data.map((row) => [row.key, row.value])`
 *  before `loadLanguage` (`lib/settings-tabs.ts`) reads the `"locale"` key out of that map. */
function settingsEffectiveResponse(rows: Array<{ key: string; value: unknown }>) {
  return new Response(
    JSON.stringify({ data: rows.map((row) => ({ ...row, sourceLayer: "user", defVersion: 1 })) }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    // Only the language namespace needs a non-empty answer — every other settings/session fetch
    // this harness's mounted `App` triggers degrades harmlessly to an empty response, same as
    // `app-logout-confirm.unit.test.tsx`'s blanket stub.
    if (url.includes("/settings/effective") && url.includes("namespace=core.language")) {
      return settingsEffectiveResponse([{ key: "locale", value: "de" }]);
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function fakeSession(): UseAdminSession {
  return {
    user: { id: "u1", username: "admin" },
    checking: false,
    handleLogin: vi.fn(),
    logout: vi.fn(async () => {}),
  };
}

it("translates the logout confirm's Cancel button under a non-English locale", async () => {
  const user = userEvent.setup();
  render(<App useSession={() => fakeSession()} />);

  // `navLocale` starts at `DEFAULT_LOCALE` and updates once the stubbed fetch above resolves — see
  // `useAdminLocale`'s own doc comment. Waiting on the translated nav label (already covered
  // elsewhere) would work too, but the sidebar's logout button label is `admin-nav-i18n.ts`'s own
  // "Log out" key, translated identically in German ("Abmelden") — asserting on IT first pins that
  // the locale actually settled before opening the dialog.
  await waitFor(() => expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Abmelden" }));
  const dialog = screen.getByText("Möchten Sie sich wirklich abmelden?").closest("dialog") as HTMLElement;
  await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));

  // The whole point of the fix: this button's label comes from `ConfirmDialogDefaultsProvider`'s
  // `cancelLabel`, not the Jini component's own built-in English default — before this change it
  // stayed "Cancel" even here, under German.
  expect(within(dialog).getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
});

/** `App` mounts the assistant dock, whose agents list reads through the app's query cache — render
 *  under the same provider `main.tsx` wraps `App` in. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
