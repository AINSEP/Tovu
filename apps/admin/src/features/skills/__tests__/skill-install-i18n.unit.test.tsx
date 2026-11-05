import { cleanup, render, screen, within } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";

import { ADMIN_LOCALES } from "@/lib/settings-tabs";
import { SkillInstallConfirmation } from "../SkillInstallConfirmation";
import type { useSkillInstall } from "../use-skill-install.hooks";

/**
 * Bug class (11-02 o2): user-facing copy in the skill-install surface was hard-coded English, so a
 * non-English admin heard "Dismiss" / "Install skill" from a screen reader and saw an English
 * dialog inside a translated chat dock. Guard: every supported non-English locale renders this
 * component's visible text and accessible names translated.
 */

afterEach(cleanup);

function install(overrides: Partial<ReturnType<typeof useSkillInstall>> = {}): ReturnType<typeof useSkillInstall> {
  return { pending: null, busy: false, error: null, cause: null, propose: vi.fn(), proposeFiles: vi.fn(), cancel: vi.fn(), confirm: vi.fn(async () => {}), fail: vi.fn(), ...overrides };
}

const pending = { githubUrl: "https://github.com/acme/skill" };
const NON_ENGLISH = ADMIN_LOCALES.filter(({ code }) => code !== "en").map(({ code }) => code);

it("covers the production locale picker, not a hand-kept list", () => {
  expect(NON_ENGLISH).toContain("es");
  expect(NON_ENGLISH.length).toBeGreaterThanOrEqual(20);
});

it("renders reviewed Spanish copy for the dismiss row and the dialog", () => {
  const { unmount } = render(<SkillInstallConfirmation install={install({ error: "SKILL.md is missing." })} locale="es" />);
  expect(screen.getByRole("button", { name: "Descartar" })).toHaveTextContent("Descartar");
  unmount();
  render(<SkillInstallConfirmation install={install({ pending })} locale="es" />);
  expect(screen.getByRole("dialog", { name: "Instalar habilidad" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "¿Instalar habilidad?" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar instalación" })).toBeInTheDocument();
});

it("keeps English when no locale is given (existing callers and tests)", () => {
  render(<SkillInstallConfirmation install={install({ error: "boom" })} />);
  expect(screen.getByRole("button", { name: "Dismiss" })).toHaveTextContent("Dismiss");
});

it.each(NON_ENGLISH)("%s translates the dismiss row's text and accessible name", locale => {
  render(<SkillInstallConfirmation install={install({ error: "SKILL.md is missing." })} locale={locale} />);
  const alert = screen.getByRole("alert");
  const dismiss = alert.querySelector("button[aria-label]")!;
  expect(dismiss.textContent?.trim()).not.toBe("Dismiss");
  expect(dismiss.textContent?.trim().length).toBeGreaterThan(0);
  expect(dismiss.getAttribute("aria-label")).toBe(dismiss.textContent);
  // The error itself is server text and stays exactly as given.
  expect(alert).toHaveTextContent("SKILL.md is missing.");
});

it.each(NON_ENGLISH)("%s translates the install dialog's accessible name and copy", locale => {
  render(<SkillInstallConfirmation install={install({ pending })} locale={locale} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog.getAttribute("aria-label")).not.toBe("Install skill");
  expect(dialog.getAttribute("aria-label")?.trim().length).toBeGreaterThan(0);
  // Spanish and Portuguese correctly use "Cancelar"; reject the untranslated button, not that substring.
  expect(within(dialog).queryByRole("button", { name: "Cancel", exact: true })).not.toBeInTheDocument();
  for (const english of ["Install skill?", "Review instructions from sources you trust. Installation runs no code.", "Confirm install"]) {
    expect(dialog.textContent, `${locale}: ${english}`).not.toContain(english);
  }
});
