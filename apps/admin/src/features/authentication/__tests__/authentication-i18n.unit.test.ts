import { describe, expect, it } from "vitest";
import { providerBackendNote, t } from "../authentication-i18n";

// Author Checklist F4.3/F6.2/F7.5: real interpolation, non-default locales/providers,
// independent literal notes, no mock, persistence, timer or shared mutable state.
describe("provider backend note", () => {
  // Dropping interpolation, using English unconditionally, or reusing the previous provider fails.
  it("interpolates a provider into the Spanish note on each call", () => {
    expect(providerBackendNote("es", "Google")).toBe("Aún no está conectado a un backend de autenticación de proveedor. Estos campos obligatorios se muestran para planificar la configuración; Tovu no puede guardar credenciales ni habilitar el inicio de sesión con Google desde esta pantalla hoy.");
    expect(providerBackendNote("es", "LinkedIn")).toBe("Aún no está conectado a un backend de autenticación de proveedor. Estos campos obligatorios se muestran para planificar la configuración; Tovu no puede guardar credenciales ni habilitar el inicio de sesión con LinkedIn desde esta pantalla hoy.");
  });

  it.each(["en", "unsupported-locale", ""])("uses the English template for locale %j", (locale) => {
    expect(providerBackendNote(locale, "Facebook")).toBe("Not connected to a provider authentication backend yet. These required fields are shown for setup planning; Tovu cannot save credentials or enable Facebook sign-in from this screen today.");
  });

  // BUG: inherited object properties are not locale templates. The same unknown-locale fallback
  // must work for these names rather than passing a function/object to template.replace (F4.4).
  it.each(["constructor", "toString", "__proto__"])("falls back safely for inherited locale name %s", (locale) => {
    expect(providerBackendNote(locale, "Google")).toBe("Not connected to a provider authentication backend yet. These required fields are shown for setup planning; Tovu cannot save credentials or enable Google sign-in from this screen today.");
  });

  it("resolves field copy and preserves unlisted provider-specific text", () => {
    expect(t({ locale: "es", key: "Client secret" })).toBe("Secreto de cliente");
    expect(t({ locale: "es", key: "required" })).toBe("obligatorio");
    expect(t({ locale: "unsupported-locale", key: "Required credentials" })).toBe("Required credentials");
    expect(t({ locale: "es", key: "Unlisted setup hint" })).toBe("Unlisted setup hint");
  });
});
