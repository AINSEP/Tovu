import { expect, it } from "vitest";
import { t } from "../settings-i18n";

it("translates settings load and save states and preserves the error banner fragments", () => {
  // Author Checklist F1.1/F2.4/F4.1/F6.2: literal Spanish oracle, real bound
  // dictionary. Reject an empty dictionary or binding the capabilities dictionary.
  expect(t("es", "Loading settings…")).toBe("Cargando configuración…");
  expect(t("es", "Could not load saved settings (") + "HTTP 503" + t("es", "). Showing defaults — edits will still save.")).toBe(
    "No se pudo cargar la configuración guardada (HTTP 503). Se muestran los valores predeterminados; las ediciones se seguirán guardando.",
  );
  expect(t("es", "Saving…")).toBe("Guardando…");
  expect(t("es", "Saved")).toBe("Guardado");
  expect(t("es", "Skills")).toBe("Habilidades");
  expect(t("es", "Info")).toBe("Información");
  expect(t("unlisted-locale", "Loading settings…")).toBe("Loading settings…");
  expect(t("es", "future settings label")).toBe("future settings label");
});
