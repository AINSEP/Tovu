import { describe, expect, it } from "vitest";
import { t } from "../../app-i18n";

// Author Checklist: real translator, literal non-default locales, no effects/state/mocks.
// F4.3/F6.2: returning English or caching the first locale must fail; no source edits permitted.
describe("app shell translations", () => {
  it.each([
    ["Assistant", "Asistente"],
    ["Loading Tovu…", "Cargando Tovu…"],
    ["Skip to content", "Saltar al contenido"],
    ["Close navigation", "Cerrar navegación"],
    ["Open navigation", "Abrir navegación"],
    ["Log out?", "¿Cerrar sesión?"],
    ["Are you sure you want to log out?", "¿Seguro que quieres cerrar sesión?"],
  ])("translates Spanish shell copy %s", (key, expected) => {
    expect(t("es", key)).toBe(expected);
  });

  it("resolves each call's locale and falls back to shared copy or the original key", () => {
    expect(t("de", "Open navigation")).toBe("Navigation öffnen");
    expect(t("es", "Open navigation")).toBe("Abrir navegación");
    expect(t("es", "Cancel")).toBe("Cancelar");
    expect(t("unknown-locale", "Open navigation")).toBe("Open navigation");
    expect(t("en", "Log out?")).toBe("Log out?");
    expect(t("es", "Unlisted shell message")).toBe("Unlisted shell message");
  });
});
