import { describe, expect, it } from "vitest";
import { t } from "../auth-i18n";

// Author Checklist F4.3/F6.2: English-only Login tests miss a dropped locale dictionary.
// Real translation factory, literal expectations, no shared state or runtime effects.
describe("signed-out operator translations", () => {
  it.each([
    ["Sign in to your workspace", "Inicia sesión en tu espacio de trabajo"],
    ["Username", "Nombre de usuario"],
    ["Password", "Contraseña"],
    ["Sign in", "Iniciar sesión"],
    ["Signing in…", "Iniciando sesión…"],
  ])("translates Spanish login copy %s", (key, expected) => {
    expect(t("es", key)).toBe(expected);
  });

  it("does not reuse another locale and preserves unknown copy", () => {
    expect(t("de", "Signing in…")).toBe("Anmeldung läuft…");
    expect(t("es", "Signing in…")).toBe("Iniciando sesión…");
    expect(t("es", "Cancel")).toBe("Cancelar");
    expect(t("en", "Sign in")).toBe("Sign in");
    expect(t("unknown-locale", "Username")).toBe("Username");
    expect(t("es", "Unlisted login error")).toBe("Unlisted login error");
  });
});
