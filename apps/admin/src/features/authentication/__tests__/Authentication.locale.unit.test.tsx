import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const language = vi.hoisted(() => ({ locale: "es" }));
// Locale delivery is outside this claim; the real component, shell and translators all run.
vi.mock("@/hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => language.locale }));
import { Authentication } from "../Authentication";

beforeEach(() => { language.locale = "es"; });

describe("Authentication localized credential preview", () => {
  // F1.3/F2.4/F6.2: hardcoding English, losing hint associations, or enabling fields must fail.
  it("translates field labels, associated hints and provider notes while rejecting secret input", async () => {
    const user = userEvent.setup();
    render(<Authentication />);
    expect(screen.getByRole("heading", { level: 1, name: "Autenticación" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Google" }));
    const identity = screen.getByLabelText(/^ID de cliente/);
    const secret = screen.getByLabelText(/^Secreto de cliente/);
    expect(identity).toHaveAttribute("autocomplete", "off");
    expect(identity).toBeRequired();
    expect(identity).toBeDisabled();
    expect(secret).toHaveAttribute("type", "password");
    expect(secret).toHaveAttribute("placeholder", "Introduce el secreto de cliente de Google");
    expect(secret).toHaveAttribute("autocomplete", "new-password");
    expect(secret).toBeDisabled();
    expect(document.getElementById(identity.getAttribute("aria-describedby")!)?.textContent)
      .toBe("ID de cliente de aplicación web OAuth 2.0 de Google Cloud Console.");
    expect(document.getElementById(secret.getAttribute("aria-describedby")!)?.textContent)
      .toBe("Secreto de cliente OAuth 2.0 vinculado al ID de cliente.");
    expect(screen.getByRole("note").textContent).toBe("Aún no está conectado a un backend de autenticación de proveedor. Estos campos obligatorios se muestran para planificar la configuración; Tovu no puede guardar credenciales ni habilitar el inicio de sesión con Google desde esta pantalla hoy.");
    await user.type(secret, "should-not-be-retained");
    expect(secret).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "LinkedIn" }));
    expect(screen.getByLabelText(/^Secreto de cliente/)).toHaveAttribute("placeholder", "Introduce el secreto de cliente de LinkedIn");
    expect(screen.getByRole("note").textContent).toBe("Aún no está conectado a un backend de autenticación de proveedor. Estos campos obligatorios se muestran para planificar la configuración; Tovu no puede guardar credenciales ni habilitar el inicio de sesión con LinkedIn desde esta pantalla hoy.");
  });

  it("falls back to English for an unsupported locale", async () => {
    language.locale = "unsupported-locale";
    const user = userEvent.setup();
    render(<Authentication />);
    expect(screen.getByRole("heading", { level: 1, name: "Authentication" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Facebook" }));
    expect(screen.getByLabelText(/^App ID/)).toBeDisabled();
    expect(screen.getByLabelText(/^App secret/)).toHaveAttribute("placeholder", "Enter Meta app secret");
    expect(screen.getByRole("note").textContent).toBe("Not connected to a provider authentication backend yet. These required fields are shown for setup planning; Tovu cannot save credentials or enable Facebook sign-in from this screen today.");
  });
});
